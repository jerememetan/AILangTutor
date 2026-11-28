import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { minPcmBytes, pcmAudioType } from '../../src/lesson/lesson-contract.ts';
import type { GoalId, LevelId, OpenLesson, Recap, SessionView } from '../../src/lesson/lesson-contract.ts';
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
const lessonRoom: RealtimeRoom = {
  async plan(level) { return readLessonPlan(JSON.stringify(modelAgenda(level)), level); },
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

async function enter(handler: ReturnType<typeof createLessonHandler>, level: LevelId = 'beginner', entryId = randomUUID(), priorCookie = '') {
  const response = await handler(entryRequest(level, entryId, priorCookie));
  assert.ok(response.ok);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? priorCookie;
  assert.ok(cookie);
  const { sessionId, view } = await response.json() as OpenLesson;
  return { cookie, sessionId, view };
}

function turn(session: Awaited<ReturnType<typeof enter>>, goal: GoalId, answer?: string, id = randomUUID(), clip?: Blob) {
  const body = new FormData();
  body.set('turnId', id);
  body.set('goalId', goal);
  body.set('kind', answer === undefined ? 'hint' : 'speech');
  if (answer !== undefined) body.set('audio', clip ?? transcriptAudio(answer), 'answer');
  return new Request(`${base}/${session.sessionId}/turns`, {
    method: 'POST', headers: { Cookie: session.cookie }, body,
  });
}

type ClientEvent = {
  type: string;
  session?: {
    model: string;
    output_modalities: string[];
    text_generation_config?: { reasoning: { effort: string } };
    audio: { input: { turn_detection: unknown }; output?: unknown };
    providerData: { auto_tool_response: boolean };
  };
  response?: { metadata: Record<string, string>; tool_choice: string; instructions: string; tools: { name: string }[] };
  item?: { call_id: string };
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
  const name = request.response?.tools[0].name;
  const response = { id: name, metadata: request.response?.metadata };
  socket.emit({ type: 'response.created', response });
  socket.emit({
    type: 'response.function_call_arguments.done', response_id: response.id,
    name, call_id: `call-${name}`, arguments: JSON.stringify(result),
  });
  socket.emit({ type: 'response.done', response: { ...response, status: 'completed' } });
}

const pcmClip = new Blob([new Uint8Array(minPcmBytes)], { type: pcmAudioType });

test('Inworld checks spoken evidence while ElevenLabs streams the welcome early and caches it for replay', async () => {
  let connections = 0;
  let synthesizedReplies = 0;
  let plans = 0;
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
          if (event.response?.tools[0].name === 'plan_speaking_lesson') {
            plans++;
            assert.match(event.response.instructions, /beginner.*exactly 2/);
            sendToolResult(socket, event, modelAgenda('beginner'));
          } else {
            assert.match(event.response?.instructions ?? '', /"id":"goal-1".*"criterion":"Use a polite Korean greeting."/);
            sendToolResult(socket, event, demonstrated(clips.greeting));
          }
          break;
        case 'conversation.item.create':
          assert.match(event.item?.call_id ?? '', /^call-(assess_speaking_goal|plan_speaking_lesson)$/);
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
        const isPlan = event.response?.tools[0].name === 'plan_speaking_lesson';
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
  assert.equal(explanation.reply.korean, '안녕하세요.');
  assert.equal((await say('goal-1', clips.greeting)).completed.length, 0);
  assert.equal((await say('goal-1', clips.greeting)).activeGoal, 'goal-2');
  assert.equal((await say('goal-2', clips.name)).activeGoal, 'goal-3');
  const final = await say('goal-3', clips.question);
  assert.equal(final.activeGoal, null);
  assert.deepEqual(final.completed.map((item) => item.quote), [clips.greeting, clips.name, clips.question]);
  assert.equal(final.helpByGoal['goal-1'], 'Asked for an explanation.');
  assert.match(final.reply.english, /finished all your speaking goals/);
});

test('progress requires grounded Korean speech and remains zero on silence, invalid evidence, or hint', async () => {
  const handler = createLessonHandler(fixtureProvider(), fixtureVoice);
  const session = await enter(handler);
  for (const answer of [undefined, ' ', clips.badQuote]) {
    const response = await handler(turn(session, 'goal-1', answer));
    const view = await response.json() as SessionView;
    assert.equal(view.activeGoal, 'goal-1');
    assert.equal(view.completed.length, 0);
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

test('coaching adds gentle and encouraging delivery only to the synthesized speech', async () => {
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
    `[gently] Here’s a polite greeting. 안녕하세요. [encouraging] ${modelGoals[0].practice}`,
    `[encouraging] Good practice. Now try it once more from memory. ${modelGoals[0].practice}`,
  ]);
});
