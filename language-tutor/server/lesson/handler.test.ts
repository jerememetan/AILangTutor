import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import viteConfig from '../../vite.config.ts';
import { minPcmBytes, pcmAudioType, pcmSampleRate } from '../../src/lesson/lesson-contract.ts';
import type {
  ChallengeTurn, ChallengeView, ChatMessage, GoalId, LevelId, OpenLesson, Recap, SessionView,
} from '../../src/lesson/lesson-contract.ts';
import type { ChallengeScenario } from './challenge.ts';
import { createElevenLabsVoice } from './elevenLabsVoice.ts';
import type { TutorVoice } from './elevenLabsVoice.ts';
import { createLessonHandler } from './handler.ts';
import { createRealtimeProvider } from './inworldRealtime.ts';
import type { RealtimeProvider, RealtimeRoom } from './inworldRealtime.ts';
import { readLessonPlan } from './lessonPlan.ts';
import type { Assessment } from './session.ts';

const base = 'http://localhost/api/lesson/sessions';
const clips = {
  greeting: '안녕하십니까',
  name: '제 이름은 제레미예요',
  question: '성함이 어떻게 되세요?',
  help: 'How do I say hello politely?',
  badQuote: 'Hello',
};

const modelGoals = [
  { title: 'Open with a Korean greeting', practice: 'Greet Jiwon as you would on the first day of class.', criterion: 'Use a polite Korean greeting.', hint: 'Think of a phrase for saying hello.', example: clips.greeting },
  { title: 'Introduce yourself by name', practice: 'Say your name in Korean to a classmate you just met.', criterion: 'Give your name in a Korean sentence.', hint: 'Use the pattern for introducing yourself.', example: clips.name },
  { title: 'Ask a new classmate their name', practice: 'Ask Jiwon what her name is.', criterion: 'Ask your conversation partner for their name in Korean.', hint: 'Turn the Korean word for name into a polite question.', example: clips.question },
  { title: 'Add a personal detail', practice: 'Tell Jiwon where you are from as part of your introduction.', criterion: 'State where you are from in Korean.', hint: 'Use a place name with the expression for coming from somewhere.', example: '저는 싱가포르에서 왔어요.' },
  { title: 'React to a shared interest', practice: 'Jiwon likes music. Ask her a follow-up about it.', criterion: 'Ask a relevant follow-up question in Korean.', hint: 'Ask what kind of music she likes.', example: '어떤 음악을 좋아하세요?' },
  { title: 'Change register for a professor', practice: 'Introduce yourself to a professor you are meeting for the first time.', criterion: 'Introduce yourself using formal Korean endings.', hint: 'Think of the more formal sentence ending.', example: '저는 제레미입니다.' },
];

function modelAgenda(level: LevelId) {
  const order = level === 'comfortable' ? [3, 2, 4, 5] : level === 'basic' ? [0, 1, 2] : [0, 1];
  return {
    title: level === 'comfortable' ? 'Making a first impression' : 'Meeting a classmate',
    opening: level === 'beginner' ? 'Hi! If you’re new to Korean, you can ask me in English.' : 'Hi! Imagine it’s your first day of class.',
    goals: order.map((index) => modelGoals[index]),
  };
}

function transcriptAudio(text: string) {
  const bytes = new Uint8Array(minPcmBytes);
  bytes.set(new TextEncoder().encode(text));
  return new Blob([bytes], { type: pcmAudioType });
}
const demonstrated = (evidence: string): Assessment => ({
  verdict: 'demonstrated', evidence, english: 'Good practice.', korean: null, gaveExample: false,
});
const scenario: ChallengeScenario = {
  opening: 'You just arrived at exchange orientation.',
  cues: [
    { english: 'Greet your new exchange buddy.', korean: null },
    { english: 'Tell me your name.', korean: '이름이 뭐예요?' },
  ],
};
const lessonRoom: RealtimeRoom = {
  async plan(level) { return readLessonPlan(JSON.stringify(modelAgenda(level)), level); },
  async planChallenge() { return scenario; },
  async assessChallenge(audio) {
    const transcript = new TextDecoder().decode(audio).replace(/\0+$/, '').trim();
    if (!transcript) return { transcript, result: null };
    if (transcript === clips.help) return { transcript, result: { verdict: 'question', evidence: null } };
    if (transcript === "I don't know") return { transcript, result: { verdict: 'practice', evidence: null } };
    if (transcript === clips.badQuote) {
      return { transcript, result: { verdict: 'demonstrated', evidence: clips.greeting } };
    }
    return { transcript, result: { verdict: 'demonstrated', evidence: transcript } };
  },
  async evaluate(audio) {
    const transcript = new TextDecoder().decode(audio).replace(/\0+$/, '').trim();
    if (!transcript) return { transcript, result: null };
    if (transcript === clips.help) {
      return {
        transcript,
        result: { verdict: 'side-question', evidence: null, english: 'Here’s a polite greeting.', korean: '안녕하세요.', gaveExample: true },
      };
    }
    return { transcript, result: demonstrated(transcript === clips.badQuote ? clips.greeting : transcript) };
  },
};

const fixtureVoice: TutorVoice = async (_reply, emit) => { emit(new Uint8Array([1, 2, 3, 4])); };

function fixtureProvider(overrides: (signal: AbortSignal) => Partial<RealtimeRoom> = () => ({})): RealtimeProvider {
  return { room: (signal) => ({ ...lessonRoom, ...overrides(signal) }) };
}

function entryRequest(level: LevelId, entryId = randomUUID(), priorCookie = '') {
  return new Request(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: priorCookie },
    body: JSON.stringify({ tutorId: 'vita', level, entryId }),
  });
}

test('the Vite proxy preserves the browser host for the lesson origin check', async () => {
  for (const config of [viteConfig.server, viteConfig.preview]) {
    const proxy = config?.proxy?.['/api/lesson'];
    assert.ok(proxy && typeof proxy === 'object');
    assert.equal(proxy.changeOrigin, false);
  }

  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const browserOrigin = 'http://localhost:5173';
  function open(host: string, site: string) {
    const headers = new Headers({ Origin: browserOrigin, 'Sec-Fetch-Site': site, 'Content-Type': 'application/json' });
    return handler(new Request(host + '/api/lesson/sessions', {
      method: 'POST', headers,
      body: JSON.stringify({ tutorId: 'vita', level: 'beginner', entryId: randomUUID() }),
    }));
  }
  assert.equal((await open(browserOrigin, 'same-origin')).status, 201);
  assert.equal((await open('http://127.0.0.1:8787', 'same-origin')).status, 403);
  assert.equal((await open(browserOrigin, 'cross-site')).status, 403);
});

async function enter(handler: ReturnType<typeof createLessonHandler>, level: LevelId = 'beginner', entryId = randomUUID(), priorCookie = '') {
  const response = await handler(entryRequest(level, entryId, priorCookie));
  assert.ok(response.ok);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? priorCookie;
  assert.ok(cookie);
  const { sessionId, view } = await response.json() as OpenLesson;
  return { cookie, sessionId, view };
}

function turn(session: Awaited<ReturnType<typeof enter>>, goal: GoalId | null, answer?: string, id = randomUUID(), clip?: Blob) {
  const body = new FormData();
  body.set('turnId', id);
  if (goal) body.set('goalId', goal);
  body.set('kind', answer === undefined ? 'hint' : 'speech');
  if (answer !== undefined) body.set('audio', clip ?? transcriptAudio(answer), 'answer');
  return new Request(`${base}/${session.sessionId}/turns`, {
    method: 'POST', headers: { Cookie: session.cookie }, body,
  });
}

type TestSession = Awaited<ReturnType<typeof enter>>;
type TestHandler = ReturnType<typeof createLessonHandler>;

function challengeRequest(session: TestSession, action: string, body?: FormData) {
  return new Request(base + '/' + session.sessionId + '/challenge/' + action, {
    method: 'POST', headers: { Cookie: session.cookie }, body,
  });
}

function challengeTurn(session: TestSession, number: ChallengeTurn, answer?: string, id: string = randomUUID(), skip = false) {
  const body = new FormData();
  body.set('turnId', id);
  body.set('turn', String(number));
  if (answer !== undefined) body.set('audio', transcriptAudio(answer), 'answer');
  if (skip) body.set('kind', 'skip');
  return challengeRequest(session, 'turns', body);
}

async function finishLesson(handler: TestHandler, session: TestSession, helpWith?: GoalId) {
  let view = session.view;
  for (const goal of view.agenda.goals) {
    if (goal.id === helpWith) assert.ok((await handler(turn(session, goal.id))).ok);
    const response = await handler(turn(session, goal.id, clips.greeting));
    assert.ok(response.ok);
    view = await response.json() as SessionView;
  }
  assert.equal(view.activeGoal, null);
  return view;
}

type ClientEvent = {
  type: string;
  session?: {
    model: string;
    output_modalities: string[];
    text_generation_config?: { reasoning: { effort: string } };
    audio: { input: { turn_detection: unknown; transcription: { prompts: string[] } }; output?: unknown };
    providerData: { auto_tool_response: boolean };
  };
  response?: {
    metadata: Record<string, string>;
    tool_choice?: string;
    instructions: string;
    tools?: { name: string }[];
    max_output_tokens: number;
  };
  item?: { type: string; call_id?: string; role?: string; content?: { type: string; text: string }[] };
  audio?: string;
};

class FakeInworldSocket extends EventTarget {
  readyState: number = WebSocket.OPEN;
  onSend: (event: ClientEvent) => void;

  constructor(onSend: (socket: FakeInworldSocket, event: ClientEvent) => void) {
    super();
    this.onSend = (event) => onSend(this, event);
    queueMicrotask(() => this.emit({ type: 'session.created' }));
  }

  send(data: string) { queueMicrotask(() => this.onSend(JSON.parse(data))); }

  emit(event: object) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
  }

  close() {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }
}

function sendTranscript(socket: FakeInworldSocket, text: string) {
  socket.emit({ type: 'input_audio_buffer.committed', item_id: 'current-turn' });
  socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'current-turn', transcript: text });
}

function sendToolResult(socket: FakeInworldSocket, request: ClientEvent, result: object) {
  const name = request.response?.tools?.[0].name;
  const response = { id: name, metadata: request.response?.metadata };
  socket.emit({ type: 'response.created', response });
  socket.emit({
    type: 'response.function_call_arguments.done', response_id: response.id,
    name, call_id: `call-${name}`, arguments: JSON.stringify(result),
  });
  socket.emit({ type: 'response.done', response: { ...response, status: 'completed' } });
}

const pcmClip = new Blob([new Uint8Array(minPcmBytes)], { type: pcmAudioType });

test('plans and assesses via validated text when the Inworld account restricts tools', async () => {
  let connections = 0;
  let toolRequests = 0;
  const provider = createRealtimeProvider({ INWORLD_API_KEY: 'fake' }, () => {
    connections++;
    return new FakeInworldSocket((socket, event) => {
      if (event.type === 'session.update') socket.emit({ type: 'session.updated' });
      if (event.type === 'input_audio_buffer.commit') sendTranscript(socket, clips.greeting);
      if (event.type !== 'response.create' || !event.response) return;
      assert.ok(event.response.max_output_tokens <= 1000);
      if (event.response.tools) {
        toolRequests++;
        socket.emit({ type: 'error', error: { message: 'Tool calling is currently restricted on your plan.' } });
        return;
      }
      assert.equal(event.response.tool_choice, undefined);
      assert.match(event.response.instructions, /one compact JSON object/);
      const output = event.response.instructions.includes('Write a brief English welcome')
        ? modelAgenda('beginner')
        : demonstrated(clips.greeting);
      const response = { id: 'text-response', metadata: event.response.metadata };
      socket.emit({ type: 'response.created', response });
      socket.emit({ type: 'response.output_text.done', response_id: 'old-response', text: 'unrelated' });
      socket.emit({ type: 'response.output_text.done', response_id: response.id, text: JSON.stringify(output) });
      socket.emit({ type: 'response.done', response: { ...response, status: 'completed' } });
    }) as unknown as WebSocket;
  });
  const handler = createLessonHandler(provider, fixtureVoice);
  const session = await enter(handler);
  assert.equal(session.view.agenda.goals.length, 2);
  const answer = await handler(turn(session, 'goal-1', clips.greeting));
  assert.equal(answer.status, 200);
  assert.equal((await answer.json() as SessionView).activeGoal, 'goal-2');
  assert.equal(connections, 2);
  assert.equal(toolRequests, 1);
});

test('lesson setup logs the Inworld stage and codes without exposing provider payloads', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const provider = createRealtimeProvider({ INWORLD_API_KEY: 'fake' }, () =>
    new FakeInworldSocket((socket, event) => {
      if (event.type === 'session.update') {
        socket.emit({ type: 'error', error: {
          type: 'invalid_request_error',
          code: 'invalid_value',
          param: 'session.model',
          message: 'private response payload',
        } });
      }
    }) as unknown as WebSocket);
  const handler = createLessonHandler(provider, fixtureVoice);
  const response = await handler(entryRequest('beginner'));
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /prepare your speaking goals/);
  assert.doesNotMatch(body, /invalid_value|private response payload/);
  assert.equal(warnings.mock.callCount(), 1);
  assert.match(String(warnings.mock.calls[0].arguments[0]), /session configuration.*invalid_value.*session\.model/);
  assert.doesNotMatch(String(warnings.mock.calls[0].arguments[0]), /private response payload/);
});

test('the same Inworld room plans a lesson and a challenge and assesses the latest speech', async () => {
  const controller = new AbortController();
  let connections = 0;
  const calls: string[] = [];
  const provider = createRealtimeProvider({ INWORLD_API_KEY: 'fake' }, () => {
    connections++;
    return new FakeInworldSocket((socket, event) => {
      if (event.type === 'session.update') socket.emit({ type: 'session.updated' });
      if (event.type === 'input_audio_buffer.commit') sendTranscript(socket, '안녕하십니까');
      if (event.type !== 'response.create') return;
      const name = event.response?.tools?.[0].name ?? '';
      calls.push(name);
      if (name === 'plan_speaking_lesson') sendToolResult(socket, event, modelAgenda('beginner'));
      if (name === 'plan_speaking_challenge') {
        assert.doesNotMatch(event.response?.instructions ?? '', /Think of a phrase|안녕하세요/);
        sendToolResult(socket, event, scenario);
      }
      if (name === 'assess_challenge_turn') {
        assert.match(event.response?.instructions ?? '', /안녕하십니까/);
        sendToolResult(socket, event, { verdict: 'demonstrated', evidence: '안녕하십니까' });
      }
    }) as unknown as WebSocket;
  });
  assert.ok(provider);
  try {
    const room = provider.room(controller.signal);
    const { goals } = await room.plan('beginner');
    const planned = await room.planChallenge('beginner', [goals[0], goals[1]]);
    const attempt = await room.assessChallenge(new Uint8Array(minPcmBytes), {
      goal: goals[0], cue: planned.cues[0], level: 'beginner',
    });
    assert.deepEqual(planned, scenario);
    assert.deepEqual(attempt, { transcript: '안녕하십니까', result: { verdict: 'demonstrated', evidence: '안녕하십니까' } });
    assert.equal(connections, 1);
    assert.deepEqual(calls, ['plan_speaking_lesson', 'plan_speaking_challenge', 'assess_challenge_turn']);
  } finally {
    controller.abort();
  }
});

test('retries unexpected script as Korean and only assesses usable transcripts', async () => {
  const controller = new AbortController();
  const audio = new Uint8Array(minPcmBytes).fill(42);
  const attempts = [
    { automatic: '你好', expected: clips.greeting, retry: Response.json({ transcription: { transcript: clips.greeting } }) },
    { automatic: 'こんにちは', expected: clips.name, retry: Response.json({ transcription: { transcript: clips.name } }) },
    { automatic: clips.help, expected: clips.help },
    { automatic: clips.greeting, expected: clips.greeting },
    { automatic: '你好', expected: '', retry: new Response(null, { status: 503 }) },
    { automatic: 'こんにちは', expected: '', retry: Response.json({ transcription: { transcript: '  ' } }) },
    { automatic: '안녕 你好', expected: clips.greeting, retry: Response.json({ transcription: { transcript: clips.greeting } }) },
    { automatic: 'こんにちは', expected: '', retry: Response.json({ transcription: { transcript: 'こんにちは' } }) },
  ];
  let turnIndex = 0;
  const retryRequests: unknown[] = [];
  const graded: number[] = [];
  const provider = createRealtimeProvider(
    { INWORLD_API_KEY: 'fake' },
    () => new FakeInworldSocket((socket, event) => {
      const attempt = attempts[turnIndex];
      if (event.type === 'session.update') {
        assert.deepEqual(event.session?.audio.input.transcription.prompts, ['안녕하세요', '한글']);
        socket.emit({ type: 'session.updated' });
      }
      if (event.type === 'input_audio_buffer.commit') sendTranscript(socket, attempt.automatic);
      if (event.type !== 'response.create') return;
      graded.push(turnIndex);
      const context = event.response?.instructions.split('\n').at(-2);
      assert.equal(JSON.parse(context ?? '{}').transcript, attempt.expected);
      const name = event.response?.tools?.[0].name;
      const result = name === 'assess_challenge_turn'
        ? { verdict: 'demonstrated', evidence: attempt.expected }
        : demonstrated(attempt.expected);
      sendToolResult(socket, event, result);
    }) as unknown as WebSocket,
    async (url, init) => {
      retryRequests.push({
        turnIndex, url, method: init?.method,
        authorization: new Headers(init?.headers).get('authorization'),
        body: JSON.parse(String(init?.body)),
      });
      return attempts[turnIndex].retry ?? new Response(null, { status: 500 });
    },
  );
  assert.ok(provider);
  const { goals: [goal] } = readLessonPlan(JSON.stringify(modelAgenda('beginner')), 'beginner');
  try {
    const room = provider.room(controller.signal);
    for (const [index, { expected }] of attempts.entries()) {
      turnIndex = index;
      const turn = index === 1
        ? await room.assessChallenge(audio, { goal, cue: scenario.cues[0], level: 'beginner' })
        : await room.evaluate(audio, {
          goal, level: 'beginner', previousReply: { english: '', korean: null, prompt: 'Try a greeting.' },
          discussing: false, recentDialogue: [],
        });
      assert.equal(turn.transcript, expected);
      assert.equal(turn.result?.evidence, expected || undefined);
    }
    assert.deepEqual(graded, [0, 1, 2, 3, 6]);
    assert.deepEqual(retryRequests, [0, 1, 4, 5, 6, 7].map((index) => ({
      turnIndex: index,
      url: 'https://api.inworld.ai/stt/v1/transcribe',
      method: 'POST',
      authorization: 'Basic fake',
      body: {
        transcribeConfig: {
          modelId: 'inworld/inworld-stt-1',
          audioEncoding: 'LINEAR16',
          sampleRateHertz: pcmSampleRate,
          numberOfChannels: 1,
          language: 'ko',
        },
        audioData: { content: Buffer.from(audio).toString('base64') },
      },
    })));
  } finally {
    controller.abort();
  }
});

test('the challenge keeps missed prompts active and reports a skipped skill accurately', async () => {
  let planned = 0;
  let assessments = 0;
  let voiceCalls = 0;
  const handler = createLessonHandler(fixtureProvider(() => ({
    async planChallenge(level, goals) {
      planned++;
      assert.equal(level, 'comfortable');
      assert.deepEqual(goals.map(({ id }) => id), ['goal-1', 'goal-3']);
      return scenario;
    },
    async assessChallenge(audio, context) {
      assessments++;
      return lessonRoom.assessChallenge(audio, context);
    },
  })), async (reply, emit, signal) => {
    voiceCalls++;
    await fixtureVoice(reply, emit, signal);
  });
  const session = await enter(handler, 'comfortable');
  assert.equal((await handler(challengeRequest(session, 'start'))).status, 409);
  const snapshot = await finishLesson(handler, session, 'goal-3');
  const stranger = await enter(handler);
  assert.equal((await handler(challengeRequest({ ...session, cookie: stranger.cookie }, 'start'))).status, 404);
  const begin = () => handler(challengeRequest(session, 'start')).then((response) => response.json() as Promise<ChallengeView>);
  const [first, duplicateStart] = await Promise.all([begin(), begin()]);
  assert.deepEqual(first, duplicateStart);
  assert.equal(planned, 1);
  assert.equal(first.status, 'active');
  assert.equal(first.turn, 1);
  assert.equal('results' in first, false);
  assert.equal((await handler(challengeTurn(session, 1))).status, 415);
  assert.equal((await handler(challengeTurn(session, 1, undefined, randomUUID(), true))).status, 400);
  assert.equal(assessments, 0);
  const answer = async (number: ChallengeTurn, speech: string, id?: string) => {
    const response = await handler(challengeTurn(session, number, speech, id));
    assert.ok(response.ok);
    return await response.json() as ChallengeView;
  };
  const silence = await answer(1, '');
  assert.equal(silence.status, 'active');
  assert.equal(silence.turn, 1);
  assert.equal(silence.transcript, null);
  assert.match(silence.reply.english, /recording again/);
  const question = await answer(1, clips.help);
  assert.equal(question.status, 'active');
  assert.equal(question.turn, 1);
  assert.match(question.reply.english, /what you remember/);
  const inventedEvidence = await answer(1, clips.badQuote);
  assert.equal(inventedEvidence.status, 'active');
  assert.equal(inventedEvidence.turn, 1);
  const id = randomUUID();
  const second = await answer(1, '안녕하십니까', id);
  assert.equal(second.status, 'active');
  assert.equal(second.turn, 2);
  assert.equal(second.transcript, '안녕하십니까');
  assert.equal('results' in second, false);
  assert.deepEqual(await answer(1, '안녕하십니까', id), second);
  assert.equal(assessments, 4);
  const finalId = randomUUID();
  const missed = await answer(2, "I don't know", finalId);
  assert.equal(missed.status, 'active');
  assert.equal(missed.turn, 2);
  assert.equal(missed.canSkip, true);
  assert.equal('results' in missed, false);
  assert.deepEqual(await answer(2, "I don't know", finalId), missed);
  const skipId = randomUUID();
  const skip = async (): Promise<ChallengeView> => {
    const response = await handler(challengeTurn(session, 2, undefined, skipId, true));
    assert.ok(response.ok);
    return response.json();
  };
  const final = await skip();
  assert.equal(final.status, 'complete');
  assert.deepEqual(final.results.map(({ outcome }) => outcome), ['independent', 'practice']);
  assert.equal(final.results[0].quote, '안녕하십니까');
  assert.equal(final.results[1].quote, null);
  assert.ok(final.results[1].example);
  assert.match(final.reply.english, /1 out of 2/);
  assert.deepEqual(await skip(), final);
  assert.deepEqual(await begin(), final);
  for (let replay = 0; replay < 2; replay++) {
    const response = await handler(new Request(new URL(final.audioPath, base), { headers: { Cookie: session.cookie } }));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  }
  assert.equal(voiceCalls, 1);
  assert.equal(assessments, 5);
  const recap = await handler(new Request(base + '/' + session.sessionId + '/end', {
    method: 'POST', headers: { Cookie: session.cookie },
  })).then((response) => response.json());
  assert.deepEqual(recap, { completed: snapshot.completed, helpByGoal: snapshot.helpByGoal });
});

test('a correct retry of the final challenge prompt demonstrates both skills', async () => {
  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const session = await enter(handler);
  await finishLesson(handler, session);
  assert.ok((await handler(challengeRequest(session, 'start'))).ok);
  assert.ok((await handler(challengeTurn(session, 1, clips.greeting))).ok);
  const missed: ChallengeView = await handler(challengeTurn(session, 2, "I don't know")).then((r) => r.json());
  assert.equal(missed.status, 'active');
  assert.equal(missed.turn, 2);
  const retried: ChallengeView = await handler(challengeTurn(session, 2, clips.name)).then((r) => r.json());
  assert.equal(retried.status, 'complete');
  assert.deepEqual(retried.results.map(({ outcome, quote }) => ({ outcome, quote })), [
    { outcome: 'independent', quote: clips.greeting },
    { outcome: 'independent', quote: clips.name },
  ]);
});

test('a Hangul discussion keeps its context, can resume the exercise, and continues after the agenda', async () => {
  const hangulQuestion = 'How do I learn the characters in Korean?';
  const followUp = 'How do those two letters fit together?';
  const translation = 'How do I say thank you?';
  const hangulReply: Assessment = {
    verdict: 'discussion', evidence: null, english: 'Hangul letters are grouped into syllable blocks.',
    korean: 'ㄱ + ㅏ → 가', gaveExample: false,
  };
  const handler = createLessonHandler(fixtureProvider(() => ({
    async evaluate(audio, context) {
      const transcript = new TextDecoder().decode(audio).replace(/\0+$/, '').trim();
      if (transcript === hangulQuestion) return { transcript, result: hangulReply };
      if (transcript === followUp) {
        assert.equal(context.discussing, true);
        assert.ok(context.recentDialogue.some((item) => item.speaker === 'learner' && item.text === hangulQuestion));
        assert.equal(context.previousReply.korean, hangulReply.korean);
        return { transcript, result: { ...hangulReply, english: 'Put the consonant on the left and the vowel on the right.' } };
      }
      if (transcript === translation) {
        assert.equal(context.goal, null);
        return { transcript, result: { ...hangulReply, english: 'This is a polite way to thank someone.', korean: '감사합니다.' } };
      }
      return lessonRoom.evaluate(audio, context);
    },
  })), fixtureVoice);
  const session = await enter(handler);
  const say = async (goal: GoalId | null, transcript: string): Promise<SessionView> => {
    const response = await handler(turn(session, goal, transcript));
    assert.ok(response.ok);
    return response.json();
  };
  const first = await say('goal-1', hangulQuestion);
  assert.equal(first.discussing, true);
  assert.equal(first.reply.prompt, '');
  assert.equal(first.reply.korean, hangulReply.korean);
  const follow = await say('goal-1', followUp);
  assert.match(follow.reply.english, /consonant on the left/);
  assert.equal(follow.activeGoal, 'goal-1');
  assert.deepEqual(follow.helpByGoal, {});
  assert.deepEqual(follow.completed, []);

  const body = new FormData();
  body.set('kind', 'resume');
  body.set('goalId', 'goal-1');
  body.set('turnId', randomUUID());
  const resumed: SessionView = await handler(new Request(base + '/' + session.sessionId + '/turns', {
    method: 'POST', body, headers: { Cookie: session.cookie },
  })).then((response) => response.json());
  assert.equal(resumed.discussing, false);
  assert.equal(resumed.reply.prompt, session.view.agenda.goals[0].practice);
  await say('goal-1', clips.greeting);
  const completed = await say('goal-2', clips.name);
  const continued = await say(null, translation);
  assert.equal(continued.discussing, true);
  assert.equal(continued.activeGoal, null);
  assert.equal(continued.reply.korean, '감사합니다.');
  assert.deepEqual(continued.completed, completed.completed);
});

test('challenge setup and speech retry after provider errors, and closing discards late assessments', async () => {
  let plans = 0;
  let assessments = 0;
  let assessing: () => void = () => {};
  const inFlight = new Promise<void>((resolve) => { assessing = resolve; });
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const handler = createLessonHandler(fixtureProvider(() => ({
    async planChallenge() {
      if (++plans === 1) throw new Error('Temporary planning failure');
      return scenario;
    },
    async assessChallenge(audio, context) {
      if (++assessments === 1) throw new Error('Temporary assessment failure');
      assessing();
      await hold;
      return lessonRoom.assessChallenge(audio, context);
    },
  })), fixtureVoice);
  const session = await enter(handler);
  await finishLesson(handler, session);
  assert.equal((await handler(challengeRequest(session, 'start'))).status, 502);
  assert.ok((await handler(challengeRequest(session, 'start'))).ok);
  const id = randomUUID();
  assert.equal((await handler(challengeTurn(session, 1, clips.greeting, id))).status, 502);
  const retry = handler(challengeTurn(session, 1, clips.greeting, id));
  await inFlight;
  const close = () => handler(challengeRequest(session, 'end')).then((response) => response.json());
  assert.deepEqual(await close(), { status: 'ended' });
  release();
  assert.equal((await retry).status, 409);
  assert.deepEqual(await close(), { status: 'ended' });
  assert.deepEqual(await handler(challengeRequest(session, 'start')).then((response) => response.json()), { status: 'ended' });
  assert.equal((await handler(challengeTurn(session, 1, clips.greeting))).status, 409);
  assert.equal(assessments, 2);
});

test('Inworld checks spoken evidence while ElevenLabs streams the welcome early and caches it for replay', async () => {
  let connections = 0;
  let synthesizedReplies = 0;
  let plans = 0;
  let receivedOpeningMessage = false;
  let transcriptionCount = 0;
  let closed: FakeInworldSocket | undefined;
  let finishAudio: () => void = () => assert.fail('Tutor audio has not started.');
  const assessments = [clips.badQuote, clips.greeting];
  const voice = createElevenLabsVoice({
    ELEVENLABS_API_KEY: 'test-elevenlabs',
    ELEVENLABS_VOICE_ID: 'test-anna',
  }, async (url, init) => {
    synthesizedReplies++;
    assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/test-anna/stream?output_format=pcm_24000');
    assert.equal(new Headers(init?.headers).get('xi-api-key'), 'test-elevenlabs');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: `[warmly] ${modelAgenda('beginner').opening} [encouraging] ${modelGoals[0].practice}`,
      model_id: 'eleven_v4',
    });
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        finishAudio = () => {
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        };
      },
    }));
  });
  const provider = createRealtimeProvider({ INWORLD_API_KEY: 'fake' }, (url, headers) => {
    assert.match(url, /^wss:\/\/api\.inworld\.ai\/api\/v1\/realtime\/session\?key=/);
    assert.equal(headers.Authorization, 'Basic fake');
    connections++;
    const fixture = new FakeInworldSocket((socket, event) => {
      switch (event.type) {
        case 'session.update':
          assert.equal(event.session?.model, 'openai/gpt-6-luna');
          assert.equal(event.session?.text_generation_config?.reasoning.effort, 'NONE');
          assert.equal(event.session?.audio.input.turn_detection, null);
          assert.equal(event.session?.providerData.auto_tool_response, false);
          assert.deepEqual(event.session?.output_modalities, ['text']);
          assert.equal(event.session?.audio.output, undefined);
          socket.emit({ type: 'session.updated' });
          break;
        case 'input_audio_buffer.append':
          assert.equal(Buffer.from(event.audio ?? '', 'base64').length, minPcmBytes);
          break;
        case 'input_audio_buffer.commit':
          socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'earlier-turn', transcript: clips.greeting });
          sendTranscript(socket, assessments[transcriptionCount++]);
          break;
        case 'response.create':
          assert.equal(event.response?.tool_choice, 'required');
          if (event.response?.tools?.[0].name === 'plan_speaking_lesson') {
            assert.ok(receivedOpeningMessage, 'The first response needs a user message in the conversation.');
            plans++;
            assert.match(event.response.instructions, /beginner.*exactly 2/);
            sendToolResult(socket, event, modelAgenda('beginner'));
          } else {
            assert.match(event.response?.instructions ?? '', /"id":"goal-1".*"criterion":"Use a polite Korean greeting."/);
            sendToolResult(socket, event, demonstrated(clips.greeting));
          }
          break;
        case 'conversation.item.create':
          if (event.item?.type === 'message') {
            assert.equal(plans, 0);
            assert.equal(event.item.role, 'user');
            assert.deepEqual(event.item.content, [{ type: 'input_text', text: 'Prepare my Korean speaking lesson.' }]);
            receivedOpeningMessage = true;
          } else {
            assert.match(event.item?.call_id ?? '', /^call-(assess_speaking_goal|plan_speaking_lesson)$/);
          }
          break;
        default:
          assert.fail(`Unexpected event ${event.type}`);
      }
    });
    closed = fixture;
    return fixture as unknown as WebSocket;
  });
  const handler = createLessonHandler(provider, voice);
  const session = await enter(handler);
  const audioRequest = () => new Request(new URL(session.view.audioPath, base), { headers: { Cookie: session.cookie } });
  const opening = await handler(audioRequest());
  assert.equal(opening.headers.get('content-type'), pcmAudioType);
  const reader = opening.body!.getReader();
  assert.deepEqual(Array.from((await reader.read()).value!), [1, 2]);
  const replay = await handler(audioRequest());
  finishAudio();
  assert.deepEqual(Array.from(await replay.bytes()), [1, 2, 3, 4]);
  assert.deepEqual(Array.from((await reader.read()).value!), [3, 4]);
  assert.equal((await reader.read()).done, true);
  assert.equal(synthesizedReplies, 1);

  const forged = await handler(turn(session, 'goal-1', 'pcm', randomUUID(), pcmClip));
  assert.equal((await forged.json() as SessionView).completed.length, 0);
  const valid = await handler(turn(session, 'goal-1', 'pcm', randomUUID(), pcmClip));
  assert.equal((await valid.json() as SessionView).activeGoal, 'goal-2');
  assert.equal(connections, 1);
  assert.equal(plans, 1);

  await handler(new Request(`${base}/${session.sessionId}/end`, {
    method: 'POST', headers: { Cookie: session.cookie },
  }));
  assert.equal(closed?.readyState, WebSocket.CLOSED);
});

test('Realtime reconnects on a retry after the socket drops during transcription', async () => {
  let connections = 0;
  const provider = createRealtimeProvider({ INWORLD_API_KEY: 'fake' }, () => {
    const first = ++connections === 1;
    return new FakeInworldSocket((socket, event) => {
      if (event.type === 'session.update') socket.emit({ type: 'session.updated' });
      if (event.type === 'input_audio_buffer.commit') {
        if (first) socket.close();
        else sendTranscript(socket, clips.greeting);
      }
      if (event.type === 'response.create') {
        const isPlan = event.response?.tools?.[0].name === 'plan_speaking_lesson';
        sendToolResult(socket, event, isPlan ? modelAgenda('beginner') : demonstrated(clips.greeting));
      }
    }) as unknown as WebSocket;
  });
  const handler = createLessonHandler(provider, fixtureVoice);
  const session = await enter(handler);
  const id = randomUUID();
  assert.equal((await handler(turn(session, 'goal-1', 'pcm', id, pcmClip))).status, 502);
  const retry = await handler(turn(session, 'goal-1', 'pcm', id, pcmClip));
  assert.equal((await retry.json() as SessionView).activeGoal, 'goal-2');
  assert.equal(connections, 2);
});

test('a concurrent retry shares the original result and a stale recording receives the current goal', async () => {
  let evaluations = 0;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const finish = new Promise<void>((resolve) => { release = resolve; });
  const handler = createLessonHandler(fixtureProvider(() => ({
    async evaluate() {
      evaluations++;
      entered();
      await finish;
      return { transcript: clips.greeting, result: demonstrated(clips.greeting) };
    },
  })), fixtureVoice);
  const session = await enter(handler);
  const id = randomUUID();
  const original = handler(turn(session, 'goal-1', clips.greeting, id));
  await started;
  const duplicate = handler(turn(session, 'goal-1', clips.greeting, id));
  const conflict = await handler(turn(session, 'goal-1', clips.greeting));
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /still processing/);
  release();
  const results = await Promise.all([original, duplicate]);
  assert.deepEqual(results.map((response) => response.status), [200, 200]);
  const [accepted, replayed] = await Promise.all(results.map((response) => response.json()));
  assert.deepEqual(accepted, replayed);
  assert.equal(accepted.completed.length, 1);
  assert.equal(evaluations, 1);

  const stale = await handler(turn(session, 'goal-1', clips.greeting));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).view.activeGoal, 'goal-2');
  assert.equal(evaluations, 1);
});

test('runs the basic demo, English question, fresh Korean recall, three goals and recap', async () => {
  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const session = await enter(handler, 'basic');
  assert.equal(session.view.completed.length, 0);
  const accepted = new Set<string>();
  async function say(goal: GoalId, answer: string) {
    const response = await handler(turn(session, goal, answer));
    assert.equal(response.status, 200);
    const view = await response.json() as SessionView;
    assert.ok(!accepted.has(view.audioPath));
    accepted.add(view.audioPath);
    return view;
  }
  const explanation = await say('goal-1', clips.help);
  assert.equal(explanation.completed.length, 0);
  assert.equal(explanation.transcript, clips.help);
  assert.equal(explanation.reply.korean, '안녕하세요.');
  assert.equal((await say('goal-1', clips.greeting)).completed.length, 0);
  assert.equal((await say('goal-1', clips.greeting)).activeGoal, 'goal-2');
  assert.equal((await say('goal-2', clips.name)).activeGoal, 'goal-3');
  const final = await say('goal-3', clips.question);
  assert.equal(final.activeGoal, null);
  assert.equal(final.transcript, clips.question);
  assert.deepEqual(final.completed.map((item) => item.quote), [clips.greeting, clips.name, clips.question]);
  assert.equal(final.helpByGoal['goal-1'], 'Asked for an explanation.');
  assert.match(final.reply.english, /finished all your speaking goals/);
});

test('progress requires grounded Korean speech and remains zero on silence, invalid evidence, or hint', async () => {
  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const session = await enter(handler);
  assert.equal(session.view.transcript, undefined);
  for (const answer of [undefined, ' ', clips.badQuote]) {
    const response = await handler(turn(session, 'goal-1', answer));
    const view = await response.json() as SessionView;
    assert.equal(view.activeGoal, 'goal-1');
    assert.equal(view.completed.length, 0);
    assert.equal(view.transcript, answer === undefined ? undefined : answer.trim() || null);
  }
  const wrongFormat = await handler(turn(session, 'goal-1', 'hello', randomUUID(), new Blob(['hi'], { type: 'text/plain' })));
  assert.equal(wrongFormat.status, 415);
});

test('deduplicates retries, isolates browser sessions, and starts a clean room on re-entry', async () => {
  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const entryId = randomUUID();
  const session = await enter(handler, 'comfortable', entryId);
  assert.equal(session.view.agenda.goals.length, 4);
  assert.equal((await enter(handler, 'comfortable', entryId, session.cookie)).sessionId, session.sessionId);
  const turnId = randomUUID();
  const first = await handler(turn(session, 'goal-1', clips.greeting, turnId)).then((r) => r.json());
  const replay = await handler(turn(session, 'goal-1', clips.greeting, turnId)).then((r) => r.json());
  assert.deepEqual(replay, first);
  assert.equal((await handler(turn(session, 'goal-1', clips.greeting))).status, 409);
  assert.equal((await handler(turn({ ...session, cookie: '' }, 'goal-2', clips.name))).status, 404);
  const fresh = await enter(handler, 'basic', randomUUID(), session.cookie);
  assert.notEqual(fresh.sessionId, session.sessionId);
  assert.equal(fresh.view.completed.length, 0);
  assert.equal(fresh.view.activeGoal, 'goal-1');
});

test('switching levels gets a new agenda, while retries preserve the original agenda', async () => {
  const planRequests: LevelId[] = [];
  const handler = createLessonHandler(fixtureProvider(() => ({
    async plan(level) {
      planRequests.push(level);
      return lessonRoom.plan(level);
    },
  })), fixtureVoice);
  const entryId = randomUUID();
  const [comfortable, duplicate] = await Promise.all([
    enter(handler, 'comfortable', entryId),
    enter(handler, 'comfortable', entryId),
  ]);
  assert.equal(duplicate.sessionId, comfortable.sessionId);
  const beginner = await enter(handler, 'beginner', randomUUID(), comfortable.cookie);
  assert.notEqual(beginner.sessionId, comfortable.sessionId);
  assert.deepEqual(planRequests, ['comfortable', 'beginner']);
  assert.equal(comfortable.view.agenda.goals.length, 4);
  assert.equal(beginner.view.agenda.goals.length, 2);
  assert.notEqual(beginner.view.agenda.goals[0].title, comfortable.view.agenda.goals[0].title);
  assert.equal(beginner.view.reply.prompt, beginner.view.agenda.goals[0].practice);
  assert.deepEqual(Object.keys(beginner.view.agenda.goals[0]), ['id', 'title', 'practice']);
  const hint = await handler(turn(beginner, 'goal-1')).then((response) => response.json()) as SessionView;
  assert.equal(hint.reply.english, modelAgenda('beginner').goals[0].hint);
  assert.deepEqual(hint.agenda, beginner.view.agenda);
  assert.equal(hint.completed.length, 0);
});

test('rejects invalid generated agendas and lets the learner retry lesson setup', async () => {
  let attempts = 0;
  const handler = createLessonHandler(fixtureProvider(() => ({
    async plan(level) {
      if (++attempts === 1) return readLessonPlan(JSON.stringify(modelAgenda('comfortable')), level);
      return lessonRoom.plan(level);
    },
  })), fixtureVoice);
  const entryId = randomUUID();
  const invalid = await handler(entryRequest('beginner', entryId));
  assert.equal(invalid.status, 502);
  assert.equal(invalid.headers.get('set-cookie'), null);
  assert.equal((await enter(handler, 'beginner', entryId)).view.agenda.goals.length, 2);
});

test('closing an active room aborts assessment and does not allow a late result to advance', async () => {
  const handler = createLessonHandler(fixtureProvider((signal) => ({
    async evaluate() {
      markStarted();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      return { transcript: clips.greeting, result: demonstrated(clips.greeting) };
    },
  })), fixtureVoice);
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const session = await enter(handler);
  const late = handler(turn(session, 'goal-1', clips.greeting));
  await started;
  assert.equal((await handler(turn(session, 'goal-1', clips.greeting))).status, 409);
  const response = await handler(new Request(`${base}/${session.sessionId}/end`, {
    method: 'POST', headers: { Cookie: session.cookie },
  }));
  const recap = await response.json() as Recap;
  assert.equal(recap.completed.length, 0);
  assert.equal((await late).status, 409);
});

test('voice retry uses the accepted reply and leaves assessment unchanged', async () => {
  let audioCalls = 0;
  const handler = createLessonHandler(fixtureProvider(), async (_reply, emit) => {
    if (++audioCalls === 1) throw new Error('Temporary voice failure');
    emit(new Uint8Array([4, 5, 6, 7]));
  });
  const session = await enter(handler);
  const view = await handler(turn(session, 'goal-1', clips.greeting)).then((r) => r.json()) as SessionView;
  assert.equal(view.completed.length, 1);
  const audio = () => handler(new Request('http://localhost' + view.audioPath, { headers: { Cookie: session.cookie } }));
  await assert.rejects((await audio()).arrayBuffer(), /Temporary voice failure/);
  const replay = await audio();
  assert.equal(replay.headers.get('content-type'), pcmAudioType);
  assert.deepEqual(await replay.bytes(), new Uint8Array([4, 5, 6, 7]));
  assert.deepEqual(await (await audio()).bytes(), new Uint8Array([4, 5, 6, 7]));
  assert.equal(audioCalls, 2);
  const opened = await handler(new Request(`${base}/${session.sessionId}/end`, { method: 'POST', headers: { Cookie: session.cookie } }));
  assert.equal(((await opened.json()) as Recap).completed.length, 1);
});

test('opening a lesson requires an Inworld key', async () => {
  const handler = createLessonHandler(createRealtimeProvider({}), fixtureVoice);
  const response = await handler(entryRequest('beginner'));
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Inworld API key/);
});

test('opening a lesson requires an ElevenLabs key and voice ID', async () => {
  for (const env of [{ ELEVENLABS_API_KEY: 'test' }, { ELEVENLABS_VOICE_ID: 'test' }]) {
    const handler = createLessonHandler(fixtureProvider(), createElevenLabsVoice(env));
    const response = await handler(entryRequest('beginner'));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /ElevenLabs API key.*voice ID/);
  }
});

test('coaching adds delivery cues only to the synthesized speech', async () => {
  const delivered: string[] = [];
  const voice = createElevenLabsVoice({ ELEVENLABS_API_KEY: 'test', ELEVENLABS_VOICE_ID: 'test' }, async (_url, init) => {
    delivered.push(JSON.parse(String(init?.body)).text);
    return new Response(new Uint8Array([1, 2]));
  });
  const handler = createLessonHandler(fixtureProvider(), voice);
  const session = await enter(handler);
  for (const answer of [clips.help, clips.greeting]) {
    const view = await handler(turn(session, 'goal-1', answer)).then((response) => response.json()) as SessionView;
    assert.equal(view.completed.length, 0);
    assert.deepEqual(Object.keys(view.reply), ['english', 'korean', 'prompt']);
    assert.doesNotMatch(JSON.stringify(view.reply), /\[(?:gently|encouraging)\]/);
    const audio = await handler(new Request(new URL(view.audioPath, base), { headers: { Cookie: session.cookie } }));
    assert.deepEqual(await audio.bytes(), new Uint8Array([1, 2]));
  }
  assert.deepEqual(delivered, [
    '[warmly] Here’s a polite greeting. 안녕하세요.',
    `[encouraging] Good practice. Now try it once more from memory. ${modelGoals[0].practice}`,
  ]);
});

test('records opening, trimmed speech, hint, and stripped tutor replies in server history', async () => {
  const handler = createLessonHandler(fixtureProvider(() => ({
    async evaluate(audio, context) {
      const evaluated = await lessonRoom.evaluate(audio, context);
      if (evaluated.transcript === clips.help && evaluated.result) {
        return {
          transcript: `  ${clips.help}  `,
          result: { ...evaluated.result, english: `[gently] ${evaluated.result.english}` },
        };
      }
      return evaluated;
    },
  })), fixtureVoice);

  const session = await enter(handler);
  assert.equal(session.view.messages.length, 1);
  assert.equal(session.view.messages[0].speaker, 'tutor');
  assert.deepEqual(Object.keys(session.view.messages[0].reply), ['english', 'korean', 'prompt']);
  assert.deepEqual(session.view.messages[0].reply, session.view.reply);

  const hintView = await handler(turn(session, 'goal-1')).then((r) => r.json()) as SessionView;
  assert.equal(hintView.messages.length, 3);
  assert.equal(hintView.messages[0].id, session.view.messages[0].id);
  assert.deepEqual(
    hintView.messages.slice(1).map((m) => (m.speaker === 'learner' ? { speaker: m.speaker, text: m.text, kind: m.kind } : m.speaker)),
    [{ speaker: 'learner', text: 'Asked for a hint', kind: 'hint' }, 'tutor'],
  );

  const explanationView = await handler(turn(session, 'goal-1', clips.help)).then((r) => r.json()) as SessionView;
  assert.equal(explanationView.messages.length, 5);
  const learnerSpeech = explanationView.messages[3];
  assert.equal(learnerSpeech.speaker, 'learner');
  assert.equal(learnerSpeech.kind, 'speech');
  assert.equal(learnerSpeech.text, clips.help);
  const tutorReply = explanationView.messages[4];
  assert.equal(tutorReply.speaker, 'tutor');
  assert.equal(tutorReply.reply.korean, '안녕하세요.');
  assert.deepEqual(Object.keys(tutorReply.reply), ['english', 'korean', 'prompt']);
  assert.doesNotMatch(JSON.stringify(explanationView.messages), /\[(?:warmly|gently|encouraging)\]/);

  const ids = explanationView.messages.map((message: ChatMessage) => message.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 3), hintView.messages.map((m) => m.id));
});

test('appends post-lesson challenge opening, learner speech, and tutor replies to the same stream', async () => {
  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const session = await enter(handler);
  const lessonEnd = await finishLesson(handler, session);
  const lessonCount = lessonEnd.messages.length;
  assert.equal(lessonCount, 5);

  const started = await handler(challengeRequest(session, 'start')).then((r) => r.json()) as Extract<ChallengeView, { status: 'active' }>;
  assert.equal(started.status, 'active');
  assert.equal(started.messages.length, lessonCount + 1);
  assert.deepEqual(started.messages.slice(0, lessonCount), lessonEnd.messages);
  const challengeOpening = started.messages[lessonCount];
  assert.equal(challengeOpening.speaker, 'tutor');
  assert.deepEqual(challengeOpening.reply, started.reply);

  const question = await handler(challengeTurn(session, 1, clips.help)).then((r) => r.json()) as Extract<ChallengeView, { status: 'active' }>;
  assert.equal(question.messages.length, lessonCount + 3);
  assert.deepEqual(
    question.messages.slice(lessonCount + 1).map((m) => (m.speaker === 'learner' ? { text: m.text, kind: m.kind } : m.reply)),
    [{ text: clips.help, kind: 'speech' }, question.reply],
  );

  const turn1 = await handler(challengeTurn(session, 1, clips.greeting)).then((r) => r.json()) as Extract<ChallengeView, { status: 'active' }>;
  assert.equal(turn1.turn, 2);
  assert.equal(turn1.messages.length, lessonCount + 5);

  const completed = await handler(challengeTurn(session, 2, clips.name)).then((r) => r.json()) as Extract<ChallengeView, { status: 'complete' }>;
  assert.equal(completed.status, 'complete');
  assert.equal(completed.messages.length, lessonCount + 7);
  const lastMessage = completed.messages.at(-1)!;
  assert.equal(lastMessage.speaker, 'tutor');
  assert.deepEqual(lastMessage.reply, completed.reply);

  const endedChallenge = await handler(challengeRequest(session, 'end')).then((r) => r.json()) as ChallengeView;
  assert.deepEqual(endedChallenge, { status: 'ended' });
});

test('preserves history idempotency, snapshot immutability, blank transcript filtering, and clean end state', async () => {
  const handler = createLessonHandler(fixtureProvider(() => ({
    async evaluate(audio, context) {
      const evaluated = await lessonRoom.evaluate(audio, context);
      if (!evaluated.transcript) return { transcript: '   ', result: null };
      return evaluated;
    },
    async assessChallenge(audio, context) {
      const assessed = await lessonRoom.assessChallenge(audio, context);
      if (!assessed.transcript) return { transcript: '   ', result: null };
      return assessed;
    },
  })), fixtureVoice);

  const entryId = randomUUID();
  const [session, duplicateEntry] = await Promise.all([
    enter(handler, 'beginner', entryId),
    enter(handler, 'beginner', entryId),
  ]);
  assert.deepEqual(duplicateEntry.view.messages, session.view.messages);
  assert.equal(session.view.messages.length, 1);

  const sequentialEntry = await enter(handler, 'beginner', entryId, session.cookie);
  assert.deepEqual(sequentialEntry.view.messages, session.view.messages);

  const blankLessonId = randomUUID();
  const blankLessonView = await handler(turn(session, 'goal-1', '   ', blankLessonId)).then((r) => r.json()) as SessionView;
  assert.equal(blankLessonView.messages.length, 2);
  assert.equal(blankLessonView.messages[1].speaker, 'tutor');
  assert.equal(blankLessonView.messages.some((m) => m.speaker === 'learner'), false);

  const turn1Id = randomUUID();
  const turn1View = await handler(turn(session, 'goal-1', clips.greeting, turn1Id)).then((r) => r.json()) as SessionView;
  const turn1Snapshot = structuredClone(turn1View);
  assert.equal(turn1View.messages.length, 4);

  const turn2View = await handler(turn(session, 'goal-2', clips.name)).then((r) => r.json()) as SessionView;
  assert.equal(turn2View.messages.length, 6);
  assert.deepEqual(turn1View.messages, turn1Snapshot.messages);

  const retriedTurn1 = await handler(turn(session, 'goal-1', clips.greeting, turn1Id)).then((r) => r.json()) as SessionView;
  assert.deepEqual(retriedTurn1, turn1Snapshot);

  const challengeStart = await handler(challengeRequest(session, 'start')).then((r) => r.json()) as Extract<ChallengeView, { status: 'active' }>;
  assert.equal(challengeStart.messages.length, 7);

  const blankChallengeView = await handler(challengeTurn(session, 1, '   ')).then((r) => r.json()) as Extract<ChallengeView, { status: 'active' }>;
  assert.equal(blankChallengeView.messages.length, 8);
  assert.equal(blankChallengeView.messages.at(-1)?.speaker, 'tutor');

  const challengeTurn1Id = randomUUID();
  const challengeTurn1 = await handler(challengeTurn(session, 1, clips.greeting, challengeTurn1Id)).then((r) => r.json()) as Extract<ChallengeView, { status: 'active' }>;
  const challengeTurn1Snapshot = structuredClone(challengeTurn1);
  assert.equal(challengeTurn1.messages.length, 10);

  const challengeTurn2 = await handler(challengeTurn(session, 2, clips.name)).then((r) => r.json()) as Extract<ChallengeView, { status: 'complete' }>;
  assert.equal(challengeTurn2.messages.length, 12);
  assert.deepEqual(challengeTurn1.messages, challengeTurn1Snapshot.messages);

  const retriedChallenge1 = await handler(challengeTurn(session, 1, clips.greeting, challengeTurn1Id)).then((r) => r.json()) as ChallengeView;
  assert.deepEqual(retriedChallenge1, challengeTurn1Snapshot);

  assert.deepEqual(await handler(challengeRequest(session, 'end')).then((r) => r.json()), { status: 'ended' });
  assert.deepEqual(await handler(challengeRequest(session, 'start')).then((r) => r.json()), { status: 'ended' });

  const recap = await handler(new Request(`${base}/${session.sessionId}/end`, {
    method: 'POST', headers: { Cookie: session.cookie },
  })).then((r) => r.json()) as Recap;
  assert.deepEqual(Object.keys(recap), ['completed', 'helpByGoal']);
  assert.equal(recap.completed.length, 2);
  const afterEnd = await handler(challengeRequest(session, 'start'));
  assert.equal(afterEnd.status, 409);
  assert.deepEqual(await afterEnd.json(), { error: 'This lesson has ended.' });
});
