import { randomUUID } from 'node:crypto';
import { pcmSampleRate } from '../../src/lesson/lesson-contract.ts';
import type { LevelId, TutorReply } from '../../src/lesson/lesson-contract.ts';
import { assessmentInstructions, assessmentSchema, readAssessment } from './assessment.ts';
import { planInstructions, planSchema, readLessonPlan } from './lessonPlan.ts';
import type { LessonGoal, LessonPlan } from './lessonPlan.ts';
import type { Assessment } from './session.ts';

type TurnContext = {
  goal: LessonGoal;
  level: LevelId;
  previousReply: TutorReply;
  priorHelp?: string;
};
type RealtimeEvent = {
  type: string;
  item_id?: string;
  transcript?: string;
  response_id?: string;
  response?: { id: string; status: string; metadata?: Record<string, string> };
  name?: string;
  arguments?: string;
  call_id?: string;
};

type ConnectSocket = (url: string, headers: Record<string, string>) => WebSocket;
const connectSocket: ConnectSocket = (url, headers) => {
  // Node's WebSocket supports server-side handshake headers through its Undici options.
  const NodeWebSocket = WebSocket as unknown as new (url: string, options: { headers: typeof headers }) => WebSocket;
  return new NodeWebSocket(url, { headers });
};

const pcm = { type: 'audio/pcm', rate: pcmSampleRate };
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
const audioChunkBytes = pcmSampleRate * 2 / 10;

export type RealtimeRoom = {
  plan(level: LevelId): Promise<LessonPlan>;
  evaluate(audio: Uint8Array, context: TurnContext): Promise<{ transcript: string; result: Assessment | null }>;
};

export type RealtimeProvider = {
  room(signal: AbortSignal): RealtimeRoom;
};

function send(socket: WebSocket, event: object) {
  socket.send(JSON.stringify(event));
}

function exchange<T>(
  socket: WebSocket,
  signal: AbortSignal,
  receive: (event: RealtimeEvent) => T | undefined,
  start?: () => void,
): Promise<T> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  return new Promise((resolve, reject) => {
    const listeners = new AbortController();
    const finish = () => listeners.abort();
    const fail = (error: unknown) => { finish(); reject(error); };
    const disconnect = () => fail(new Error('Inworld Realtime disconnected.'));
    const options = { signal: listeners.signal };
    socket.addEventListener('error', disconnect, options);
    socket.addEventListener('close', disconnect, options);
    deadline.addEventListener('abort', () => fail(deadline.reason), options);
    socket.addEventListener('message', (message: MessageEvent) => {
      try {
        if (typeof message.data !== 'string') return;
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === 'error') throw new Error('Inworld Realtime rejected the request.');
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
  return exchange(socket, signal, (event) => {
    if (event.type === 'input_audio_buffer.committed') committedId = event.item_id;
    if (!committedId || event.item_id !== committedId) return;
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      throw new Error('Inworld could not transcribe the learner audio.');
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

async function requestTool<T>(
  socket: WebSocket, signal: AbortSignal, tool: typeof assessmentTool | typeof planTool,
  instructions: string, maxTokens: number, parse: (output: string) => T,
) {
  const requestId = randomUUID();
  let responseId: string | undefined;
  let toolCall: { id: string; result: T } | undefined;
  const call = await exchange(socket, signal, (event) => {
    if (event.type === 'response.created' && event.response?.metadata?.request_id === requestId) {
      responseId = event.response.id;
    }
    if (!responseId) return;
    if (event.type === 'response.function_call_arguments.done' && event.response_id === responseId) {
      if (toolCall || event.name !== tool.name || !event.call_id || !event.arguments) {
        throw new Error('Inworld returned an invalid lesson tool call.');
      }
      toolCall = { id: event.call_id, result: parse(event.arguments) };
    }
    if (event.type === 'response.done' && event.response?.id === responseId) {
      if (event.response.status !== 'completed' || !toolCall) {
        throw new Error('Inworld did not finish the lesson tool call.');
      }
      return toolCall;
    }
  }, () => send(socket, {
    type: 'response.create',
    response: {
      output_modalities: ['text'],
      tool_choice: 'required',
      tools: [tool],
      max_output_tokens: maxTokens,
      metadata: { request_id: requestId },
      instructions,
    },
  }));
  send(socket, {
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id: call.id, output: '{"received":true}' },
  });
  return call.result;
}

export function createRealtimeProvider(env: NodeJS.ProcessEnv, connect = connectSocket): RealtimeProvider | null {
  const apiKey = env.INWORLD_API_KEY;
  if (!apiKey) return null;
  const model = env.INWORLD_LESSON_MODEL || 'openai/gpt-6-luna';
  const session = {
    type: 'realtime',
    model,
    ...(model === 'openai/gpt-6-luna' && { text_generation_config: { reasoning: { effort: 'NONE' } } }),
    output_modalities: ['text'],
    max_output_tokens: 350,
    audio: {
      input: { format: pcm, transcription: { model: 'inworld/inworld-stt-1' }, turn_detection: null },
    },
    providerData: { auto_tool_response: false, stt: { language_hints: ['ko-KR', 'en-US'] } },
  };
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

      async function run<T>(work: (connected: WebSocket) => Promise<T>) {
        const next = previous.then(async () => {
          clearTimeout(idleTimer);
          try {
            signal.throwIfAborted();
            if (socket?.readyState !== WebSocket.OPEN) {
              const url = `wss://api.inworld.ai/api/v1/realtime/session?key=${randomUUID()}&protocol=realtime`;
              socket = connect(url, { Authorization: `Basic ${apiKey}` });
              const connected = socket;
              await exchange(connected, signal, (event) => event.type === 'session.created' ? true : undefined);
              await exchange(connected, signal, (event) => event.type === 'session.updated' ? true : undefined,
                () => send(connected, { type: 'session.update', session }));
            }
            return await work(socket);
          } catch (error) {
            disconnect();
            throw error;
          } finally {
            // A closed browser tab may leave the room without posting an explicit end request.
            if (socket) idleTimer = setTimeout(disconnect, 120_000).unref();
          }
        });
        previous = next.then(() => {}, () => {});
        return next;
      }

      return {
        plan: (level) => run((connected) => requestTool(
          connected, signal, planTool,
          `${planInstructions(level)}\nCall plan_speaking_lesson with the agenda.`,
          1400, (output) => readLessonPlan(output, level),
        )),
        evaluate: (audio, context) => run(async (connected) => {
          const transcript = await transcribe(connected, signal, audio);
          const result = transcript ? await requestTool(connected, signal, assessmentTool, [
            assessmentInstructions,
            'Call assess_speaking_goal for the most recent learner audio item. Earlier turns are context only.',
            JSON.stringify({ ...context, transcript }),
          ].join('\n'), 350, readAssessment) : null;
          return { transcript, result };
        }),
      };
    },
  };
}
