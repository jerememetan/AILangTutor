import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { GoalId, OpenLesson, Recap, SessionView } from '../../src/lesson/lesson-contract.ts';
import { createLessonHandler } from './handler.ts';
import { createProviders } from './providers.ts';
import type { LessonProviders } from './providers.ts';
import type { Assessment } from './session.ts';

const base = 'http://localhost/api/lesson/sessions';
const clips = {
  greeting: '안녕하십니까',
  name: '제 이름은 제레미예요',
  question: '성함이 어떻게 되세요?',
  help: 'How do I say hello politely?',
  badQuote: 'Hello',
};

const transcriptAudio = (text: string) => new Blob([text], { type: 'audio/webm' });
const demonstrated = (evidence: string): Assessment => ({
  verdict: 'demonstrated', evidence, english: 'Good practice.', korean: null, gaveExample: false,
});
const providers: LessonProviders = {
  async transcribe(clip) { return new TextDecoder().decode(clip.bytes); },
  async assess({ transcript }) {
    if (transcript === clips.help) {
      return { verdict: 'side-question', evidence: null, english: 'Here’s a polite greeting.', korean: '안녕하세요.', gaveExample: true };
    }
    return demonstrated(transcript === clips.badQuote ? clips.greeting : transcript);
  },
  async speak() { return new Uint8Array([1, 2, 3]).buffer; },
};

async function enter(handler: ReturnType<typeof createLessonHandler>, level = 'beginner', entryId = randomUUID(), priorCookie = '') {
  const response = await handler(new Request(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: priorCookie },
    body: JSON.stringify({ tutorId: 'vita', level, entryId }),
  }));
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

test('runs the beginner demo, English question, fresh Korean recall, three goals and recap', async () => {
  const handler = createLessonHandler(providers);
  const session = await enter(handler);
  assert.match(session.view.reply.english, /new to Korean/);
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
  const explanation = await say('greet', clips.help);
  assert.equal(explanation.completed.length, 0);
  assert.equal(explanation.reply.korean, '안녕하세요.');
  assert.equal((await say('greet', clips.greeting)).completed.length, 0);
  assert.equal((await say('greet', clips.greeting)).activeGoal, 'introduce-name');
  assert.equal((await say('introduce-name', clips.name)).activeGoal, 'ask-name');
  const final = await say('ask-name', clips.question);
  assert.equal(final.activeGoal, null);
  assert.deepEqual(final.completed.map((item) => item.quote), [clips.greeting, clips.name, clips.question]);
  assert.equal(final.helpByGoal.greet, 'Asked for an explanation.');
  assert.match(final.reply.english, /Han Jiwon/);
  assert.ok(final.reply.korean);
});

test('progress requires grounded Korean speech and remains zero on silence, invalid evidence, or hint', async () => {
  const handler = createLessonHandler({ ...providers, transcribe: async (clip) => new TextDecoder().decode(clip.bytes).trim() });
  const session = await enter(handler);
  for (const answer of [undefined, ' ', clips.badQuote]) {
    const response = await handler(turn(session, 'greet', answer));
    const view = await response.json() as SessionView;
    assert.equal(view.activeGoal, 'greet');
    assert.equal(view.completed.length, 0);
  }
  const wrongFormat = await handler(turn(session, 'greet', 'hello', randomUUID(), new Blob(['hi'], { type: 'text/plain' })));
  assert.equal(wrongFormat.status, 415);
});

test('deduplicates retries, isolates browser sessions, and starts a clean room on re-entry', async () => {
  const handler = createLessonHandler(providers);
  const entryId = randomUUID();
  const session = await enter(handler, 'comfortable', entryId);
  assert.ok(session.view.reply.korean);
  assert.equal((await enter(handler, 'comfortable', entryId, session.cookie)).sessionId, session.sessionId);
  const turnId = randomUUID();
  const first = await handler(turn(session, 'greet', clips.greeting, turnId)).then((r) => r.json());
  const replay = await handler(turn(session, 'greet', clips.greeting, turnId)).then((r) => r.json());
  assert.deepEqual(replay, first);
  assert.equal((await handler(turn(session, 'greet', clips.greeting))).status, 409);
  assert.equal((await handler(turn({ ...session, cookie: '' }, 'introduce-name', clips.name))).status, 404);
  const fresh = await enter(handler, 'basic', randomUUID(), session.cookie);
  assert.notEqual(fresh.sessionId, session.sessionId);
  assert.equal(fresh.view.completed.length, 0);
  assert.equal(fresh.view.activeGoal, 'greet');
});

test('closing an active room aborts assessment and does not allow a late result to advance', async () => {
  const handler = createLessonHandler({
    ...providers,
    assess: async (_input, signal) => {
      markStarted();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      return demonstrated(clips.greeting);
    },
  });
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const session = await enter(handler);
  const late = handler(turn(session, 'greet', clips.greeting));
  await started;
  assert.equal((await handler(turn(session, 'greet', clips.greeting))).status, 409);
  const response = await handler(new Request(`${base}/${session.sessionId}/end`, {
    method: 'POST', headers: { Cookie: session.cookie },
  }));
  const recap = await response.json() as Recap;
  assert.equal(recap.completed.length, 0);
  assert.equal((await late).status, 409);
});

test('voice retry uses the accepted reply and leaves assessment unchanged', async () => {
  let audioCalls = 0;
  const handler = createLessonHandler({
    ...providers,
    async speak() {
      if (++audioCalls === 1) throw new Error('Temporary voice failure');
      return new Uint8Array([4, 5, 6]).buffer;
    },
  });
  const session = await enter(handler);
  const view = await handler(turn(session, 'greet', clips.greeting)).then((r) => r.json()) as SessionView;
  assert.equal(view.completed.length, 1);
  const audio = () => handler(new Request('http://localhost' + view.audioPath, { headers: { Cookie: session.cookie } }));
  assert.equal((await audio()).status, 502);
  assert.equal((await audio()).headers.get('content-type'), 'audio/mpeg');
  assert.equal((await audio()).status, 200);
  assert.equal(audioCalls, 2);
  const opened = await handler(new Request(`${base}/${session.sessionId}/end`, { method: 'POST', headers: { Cookie: session.cookie } }));
  assert.equal(((await opened.json()) as Recap).completed.length, 1);
});

test('provider adapters use the expected endpoints, authentication, and bilingual playback text', async () => {
  assert.equal(createProviders({}), null);
  const calls: [string, RequestInit | undefined][] = [];
  const adapters = createProviders({
    INWORLD_API_KEY: 'inworld', OPENAI_API_KEY: 'openai', ELEVENLABS_API_KEY: 'elevenlabs', ELEVENLABS_VOICE_ID: 'jiwon',
  }, async (url, options) => {
    calls.push([String(url), options]);
    if (calls.length === 1) return Response.json({ transcription: { isFinal: true, transcript: clips.greeting } });
    if (calls.length === 2) return Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(demonstrated(clips.greeting)) }] }],
    });
    return new Response(new Uint8Array([1, 2, 3]));
  });
  assert.ok(adapters);
  const signal = new AbortController().signal;
  const transcript = await adapters.transcribe({ type: 'audio/webm', bytes: new Uint8Array([1, 2, 3]) }, signal);
  const reply = { english: 'Here’s a polite greeting.', korean: '안녕하세요.', prompt: 'Try it.' };
  const evaluation = await adapters.assess({ goal: 'greet', level: 'beginner', transcript, previousReply: reply }, signal);
  assert.equal(evaluation.evidence, clips.greeting);
  assert.equal((await adapters.speak(reply, signal)).byteLength, 3);
  assert.equal(calls[0][0], 'https://api.inworld.ai/stt/v1/transcribe');
  assert.equal(new Headers(calls[0][1]?.headers).get('authorization'), 'Basic inworld');
  assert.equal(JSON.parse(String(calls[0][1]?.body)).transcribeConfig.audioEncoding, 'WEBM');
  assert.equal(new Headers(calls[1][1]?.headers).get('authorization'), 'Bearer openai');
  assert.equal(JSON.parse(String(calls[1][1]?.body)).store, false);
  assert.equal(new Headers(calls[2][1]?.headers).get('xi-api-key'), 'elevenlabs');
  assert.equal(JSON.parse(String(calls[2][1]?.body)).text, 'Here’s a polite greeting. 안녕하세요. Try it.');
});
