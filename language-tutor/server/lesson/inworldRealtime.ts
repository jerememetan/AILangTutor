import { randomUUID } from 'node:crypto';
import { pcmSampleRate } from '../../src/lesson/lesson-contract.ts';
import type { LevelId, TutorReply } from '../../src/lesson/lesson-contract.ts';
import { assessmentInstructions, assessmentSchema, readAssessment } from './assessment.ts';
import {
  challengeAssessmentInstructions, challengeAssessmentSchema, challengeScenarioInstructions,
  challengeScenarioSchema, readChallengeAssessment, readChallengeScenario,
} from './challenge.ts';
import type { ChallengeAssessment, ChallengeContext, ChallengeGoals, ChallengeScenario } from './challenge.ts';
import { planInstructions, planSchema, readLessonPlan } from './lessonPlan.ts';
import type { LessonGoal, LessonPlan } from './lessonPlan.ts';
import type { Assessment } from './session.ts';

type TurnContext = {
  goal: LessonGoal;
  level: LevelId;
  previousReply: TutorReply;
  priorHelp?: string;
};
type RealtimeErrorDetails = { type?: string; code?: string | number; param?: string; message?: string };
type RealtimeEvent = {
  type: string;
  item_id?: string;
  transcript?: string;
  response_id?: string;
  response?: {
    id: string;
    status: string;
    metadata?: Record<string, string>;
    status_details?: { reason?: string; error?: RealtimeErrorDetails };
  };
  error?: RealtimeErrorDetails;
  name?: string;
  arguments?: string;
  call_id?: string;
  text?: string;
};

type ConnectSocket = (url: string, headers: Record<string, string>) => WebSocket;
const connectSocket: ConnectSocket = (url, headers) => {
  // Node's WebSocket supports server-side handshake headers through its Undici options.
  const NodeWebSocket = WebSocket as unknown as new (url: string, options: { headers: typeof headers }) => WebSocket;
  return new NodeWebSocket(url, { headers });
};

const pcm = { type: 'audio/pcm', rate: pcmSampleRate };
const sttModel = 'inworld/inworld-stt-1';
const vocabulary = ['안녕하세요', '한글'];
const hangul = /\p{Script=Hangul}/u;
const hanOrKana = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const assessmentTool = {
  type: 'function',
  name: 'assess_speaking_goal',
  description: 'Submit your assessment and coaching for the latest learner turn. Call this exactly once.',
  parameters: assessmentSchema,
};
const planTool = {
  type: 'function',
  name: 'plan_speaking_lesson',
  description: 'Provide a level-appropriate speaking agenda for this lesson. Call this exactly once.',
  parameters: planSchema,
};
const challengePlanTool = {
  type: 'function',
  name: 'plan_speaking_challenge',
  description: 'Provide the opening and two ordered cues for the orientation roleplay.',
  parameters: challengeScenarioSchema,
};
const challengeAssessmentTool = {
  type: 'function',
  name: 'assess_challenge_turn',
  description: 'Assess the latest roleplay attempt and quote the learner when demonstrated.',
  parameters: challengeAssessmentSchema,
};
type FunctionTool = { type: string; name: string; description: string; parameters: object };
const audioChunkBytes = pcmSampleRate * 2 / 10;

export type RealtimeRoom = {
  plan(level: LevelId): Promise<LessonPlan>;
  evaluate(audio: Uint8Array, context: TurnContext): Promise<{ transcript: string; result: Assessment | null }>;
  planChallenge(level: LevelId, goals: ChallengeGoals): Promise<ChallengeScenario>;
  assessChallenge(audio: Uint8Array, context: ChallengeContext): Promise<{ transcript: string; result: ChallengeAssessment | null }>;
};

export type RealtimeProvider = {
  room(signal: AbortSignal): RealtimeRoom;
};

export class InworldRealtimeError extends Error {
  constructor(stage: string, detail: string) {
    super('Inworld Realtime failed during ' + stage + ' (' + detail + ').');
  }
}

class ToolCallingRestrictedError extends InworldRealtimeError {}

function toolCallingRestricted(error: RealtimeErrorDetails | undefined) {
  return typeof error?.message === 'string' && /tool calling is currently restricted on your plan/i.test(error.message);
}

function diagnosticCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999) return String(value);
  if (typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,48}$/.test(value)) return value;
}

function send(socket: WebSocket, event: object) {
  socket.send(JSON.stringify(event));
}

function exchange<T>(
  socket: WebSocket,
  signal: AbortSignal,
  stage: string,
  receive: (event: RealtimeEvent) => T | undefined,
  start?: () => void,
): Promise<T> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  return new Promise((resolve, reject) => {
    const listeners = new AbortController();
    const finish = () => listeners.abort();
    const fail = (error: unknown) => { finish(); reject(error); };
    const options = { signal: listeners.signal };
    socket.addEventListener('error', (event) => {
      const { error } = event as ErrorEvent;
      const code = diagnosticCode(error?.cause?.code ?? error?.code);
      fail(new InworldRealtimeError(stage, code ? 'WebSocket error ' + code : 'WebSocket error'));
    }, options);
    socket.addEventListener('close', (event) => {
      const code = diagnosticCode(event.code);
      fail(new InworldRealtimeError(stage, code ? 'WebSocket closed with code ' + code : 'WebSocket closed'));
    }, options);
    deadline.addEventListener('abort', () => {
      fail(signal.aborted ? signal.reason : new InworldRealtimeError(stage, 'timed out waiting for Inworld'));
    }, options);
    socket.addEventListener('message', (message: MessageEvent) => {
      try {
        if (typeof message.data !== 'string') return;
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === 'error') {
          if (toolCallingRestricted(event.error)) {
            throw new ToolCallingRestrictedError(stage, 'tool calling is restricted');
          }
          const details = [event.error?.type, event.error?.code, event.error?.param].map(diagnosticCode).filter(Boolean);
          throw new InworldRealtimeError(stage, ['request rejected', ...details].join(', '));
        }
        const result = receive(event);
        if (result !== undefined) { finish(); resolve(result); }
      } catch (error) {
        fail(error);
      }
    }, options);
    try {
      deadline.throwIfAborted();
      start?.();
    } catch (error) {
      fail(error);
    }
  });
}

function transcribe(socket: WebSocket, signal: AbortSignal, audio: Uint8Array) {
  let committedId: string | undefined;
  return exchange(socket, signal, 'speech transcription', (event) => {
    if (event.type === 'input_audio_buffer.committed') committedId = event.item_id;
    if (!committedId || event.item_id !== committedId) return;
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      throw new InworldRealtimeError('speech transcription', 'Inworld could not transcribe the recording');
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      return event.transcript?.trim().slice(0, 1500) ?? '';
    }
  }, () => {
    for (let offset = 0; offset < audio.length; offset += audioChunkBytes) {
      const chunk = audio.subarray(offset, offset + audioChunkBytes);
      send(socket, { type: 'input_audio_buffer.append', audio: Buffer.from(chunk).toString('base64') });
    }
    send(socket, { type: 'input_audio_buffer.commit' });
  });
}

async function requestStructured<T>(
  socket: WebSocket, signal: AbortSignal, tool: FunctionTool, useTools: boolean,
  instructions: string, maxTokens: number, parse: (output: string) => T,
) {
  const requestId = randomUUID();
  const stage = tool.name;
  let responseId: string | undefined;
  let toolCall: { id: string; output: string } | undefined;
  const textParts: string[] = [];
  const result = await exchange(socket, signal, stage, (event) => {
    if (event.type === 'response.created' && event.response && event.response.metadata?.request_id === requestId) {
      responseId = event.response.id;
    }
    if (!responseId) return;
    if (useTools && event.type === 'response.function_call_arguments.done' && event.response_id === responseId) {
      if (toolCall || event.name !== tool.name || !event.call_id || !event.arguments) {
        throw new InworldRealtimeError(stage, 'invalid tool call');
      }
      toolCall = { id: event.call_id, output: event.arguments };
    }
    if (!useTools && event.type === 'response.output_text.done' && event.response_id === responseId &&
      typeof event.text === 'string') {
      textParts.push(event.text);
    }
    if (event.type === 'response.done' && event.response?.id === responseId) {
      if (event.response.status !== 'completed') {
        const details = event.response.status_details;
        if (toolCallingRestricted(details?.error)) {
          throw new ToolCallingRestrictedError(stage, 'tool calling is restricted');
        }
        const codes = [event.response.status, details?.reason, details?.error?.type, details?.error?.code]
          .map(diagnosticCode).filter(Boolean);
        throw new InworldRealtimeError(stage, ['model response did not complete', ...codes].join(', '));
      }
      const output = useTools ? toolCall?.output : textParts.join('').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
      if (!output) throw new InworldRealtimeError(stage, 'model response did not include an answer');
      try {
        return { value: parse(output) };
      } catch {
        throw new InworldRealtimeError(stage, 'model output did not match the lesson format');
      }
    }
  }, () => send(socket, {
    type: 'response.create',
    response: {
      output_modalities: ['text'],
      ...(useTools ? { tool_choice: 'required', tools: [tool] } : {}),
      max_output_tokens: maxTokens,
      metadata: { request_id: requestId },
      instructions: useTools
        ? instructions + '\nCall ' + tool.name + ' exactly once.'
        : instructions + '\nReturn only one compact JSON object matching this schema. Do not include any commentary or Markdown.\n' +
          JSON.stringify(tool.parameters),
    },
  }));
  if (toolCall) {
    send(socket, {
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: toolCall.id, output: '{"received":true}' },
    });
  }
  return result.value;
}

export function createRealtimeProvider(env: NodeJS.ProcessEnv, connect = connectSocket, fetcher = fetch): RealtimeProvider | null {
  const apiKey = env.INWORLD_API_KEY;
  if (!apiKey) return null;
  const model = env.INWORLD_LESSON_MODEL || 'openai/gpt-6-luna';
  let useTools = true;
  const session = {
    type: 'realtime',
    model,
    ...(model === 'openai/gpt-6-luna' && { text_generation_config: { reasoning: { effort: 'NONE' } } }),
    output_modalities: ['text'],
    max_output_tokens: 350,
    audio: {
      input: { format: pcm, transcription: { model: sttModel, prompts: vocabulary }, turn_detection: null },
    },
    providerData: { auto_tool_response: false },
  };

  async function transcribeLearner(socket: WebSocket, signal: AbortSignal, audio: Uint8Array) {
    const transcript = await transcribe(socket, signal, audio);
    // Keep auto-detection for bilingual conversation, but recheck unexpected script before grading.
    if (!hanOrKana.test(transcript)) return transcript;
    try {
      const response = await fetcher('https://api.inworld.ai/stt/v1/transcribe', {
        method: 'POST',
        headers: { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcribeConfig: {
            modelId: sttModel,
            audioEncoding: 'LINEAR16',
            sampleRateHertz: pcmSampleRate,
            numberOfChannels: 1,
            language: 'ko',
          },
          audioData: { content: Buffer.from(audio).toString('base64') },
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });
      if (response.ok) {
        const retry = (await response.json())?.transcription?.transcript;
        const korean = typeof retry === 'string' ? retry.trim().slice(0, 1500) : '';
        if (hangul.test(korean) && !hanOrKana.test(korean)) return korean;
      } else {
        await response.body?.cancel();
      }
    } catch {
      signal.throwIfAborted();
    }
    return '';
  }

  return {
    room(signal) {
      let socket: WebSocket | undefined;
      let idleTimer: NodeJS.Timeout | undefined;
      let previous = Promise.resolve();
      const disconnect = () => {
        clearTimeout(idleTimer);
        socket?.close();
        socket = undefined;
      };
      signal.addEventListener('abort', disconnect, { once: true });

      async function run<T>(work: (connected: WebSocket, activeSignal: AbortSignal) => Promise<T>) {
        const next = previous.then(async () => {
          clearTimeout(idleTimer);
          const timeout = AbortSignal.timeout(40_000);
          const activeSignal = AbortSignal.any([signal, timeout]);
          try {
            activeSignal.throwIfAborted();
            if (socket?.readyState !== WebSocket.OPEN) {
              const url = `wss://api.inworld.ai/api/v1/realtime/session?key=${randomUUID()}&protocol=realtime`;
              socket = connect(url, { Authorization: `Basic ${apiKey}` });
              const connected = socket;
              await exchange(connected, activeSignal, 'WebSocket connection', (event) => event.type === 'session.created' ? true : undefined);
              await exchange(connected, activeSignal, 'session configuration', (event) => event.type === 'session.updated' ? true : undefined,
                () => send(connected, { type: 'session.update', session }));
            }
            return await work(socket, activeSignal);
          } catch (error) {
            disconnect();
            if (timeout.aborted && !signal.aborted) throw new InworldRealtimeError('lesson request', 'timed out waiting for Inworld');
            throw error;
          } finally {
            // A closed browser tab may leave the room without posting an explicit end request.
            if (socket) idleTimer = setTimeout(disconnect, 120_000).unref();
          }
        });
        previous = next.then(() => {}, () => {});
        return next;
      }

      function planLesson(level: LevelId) {
        return run((connected, activeSignal) => {
          send(connected, {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Prepare my Korean speaking lesson.' }],
            },
          });
          return requestStructured(
            connected, activeSignal, planTool, useTools, planInstructions(level),
            1000, (output) => readLessonPlan(output, level),
          );
        });
      }

      return {
        async plan(level) {
          try {
            return await planLesson(level);
          } catch (error) {
            if (!(error instanceof ToolCallingRestrictedError) || signal.aborted) throw error;
            // The rejected response may still have pending events. Retry on a fresh connection.
            useTools = false;
            return planLesson(level);
          }
        },
        evaluate: (audio, context) => run(async (connected, activeSignal) => {
          const transcript = await transcribeLearner(connected, activeSignal, audio);
          const result = transcript ? await requestStructured(connected, activeSignal, assessmentTool, useTools, [
            assessmentInstructions,
            'Assess only the transcript supplied below. Earlier conversation items are context only.',
            JSON.stringify({ ...context, transcript }),
          ].join('\n'), 350, readAssessment) : null;
          return { transcript, result };
        }),
        planChallenge: (level, goals) => run((connected, activeSignal) => requestStructured(
          connected, activeSignal, challengePlanTool, useTools, challengeScenarioInstructions(level, goals),
          700, (output) => readChallengeScenario(output, goals),
        )),
        assessChallenge: (audio, { goal, cue, level }) => run(async (connected, activeSignal) => {
          const transcript = await transcribeLearner(connected, activeSignal, audio);
          const result = transcript ? await requestStructured(
            connected, activeSignal, challengeAssessmentTool, useTools,
            challengeAssessmentInstructions + '\nUse only the transcript supplied below for this assessment.\n' +
              JSON.stringify({ level, criterion: goal.criterion, cue, transcript }),
            220, readChallengeAssessment,
          ) : null;
          return { transcript, result };
        }),
      };
    },
  };
}
