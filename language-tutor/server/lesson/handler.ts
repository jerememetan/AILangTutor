import { randomUUID } from 'node:crypto';
import { koreanTutorId, levelIds, maxPcmBytes, minPcmBytes, pcmAudioType } from '../../src/lesson/lesson-contract.ts';
import type {
  ChallengeTaskResult, ChallengeTurn, ChallengeView, LevelId, Recap, SessionView,
} from '../../src/lesson/lesson-contract.ts';
import { challengeCueReply, challengeSummary, decideChallengeAttempt, pickChallengeGoals } from './challenge.ts';
import type { ChallengeGoals, ChallengeScenario } from './challenge.ts';
import type { SpokenReply, TutorVoice } from './elevenLabsVoice.ts';
import { applyTurn, currentGoal, newProgress } from './session.ts';
import type { LessonTurn, Progress } from './session.ts';
import type { LessonPlan } from './lessonPlan.ts';
import type { RealtimeProvider, RealtimeRoom } from './inworldRealtime.ts';

const prefix = '/api/lesson/sessions';
export const maxRequestBytes = maxPcmBytes + 16_384;
const idleMs = 30 * 60_000;
const maxSessions = 64;
const maxTurns = 60;
const token = /^[a-f0-9-]{36}$/i;
const cookieName = 'verba_lesson';

type PcmReply = {
  chunks: Uint8Array[];
  readers: Set<ReadableStreamDefaultController<Uint8Array>>;
  done: boolean;
};
type ReplyAudio = { reply: SpokenReply; pcm?: PcmReply };
type OpenChallengeView = Exclude<ChallengeView, { status: 'ended' }>;
type ChallengeSession = {
  goals: ChallengeGoals;
  scenario: ChallengeScenario;
  latest: OpenChallengeView;
  firstResult?: ChallengeTaskResult;
  turnResults: Map<string, OpenChallengeView>;
  pendingTurn: boolean;
};
type Session = {
  id: string;
  owner: string;
  entryId: string;
  level: LevelId;
  plan: LessonPlan;
  progress: Progress;
  latest: SessionView;
  turnResults: Map<string, SessionView>;
  audio: Map<string, ReplyAudio>;
  pendingTurn: boolean;
  ended: boolean;
  lastActivity: number;
  controller: AbortController;
  room: RealtimeRoom;
  challenge?: ChallengeSession | null;
  challengeStart?: Promise<ChallengeSession>;
};

const json = (data: unknown, status = 200, headers?: ConstructorParameters<typeof Headers>[0]) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
};
const problem = (status: number, error: string) => json({ error }, status);
const browserId = (request: Request) => request.headers.get('cookie')?.match(/(?:^|; )verba_lesson=([a-f0-9-]{36})(?:;|$)/i)?.[1];
const recap = ({ completed, helpByGoal }: Progress): Recap => ({ completed, helpByGoal });

function cacheReply(session: Pick<Session, 'id' | 'audio'>, reply: SpokenReply) {
  const id = randomUUID();
  session.audio.set(id, { reply });
  // Keep the current reply and a few recent replies for replay and network retries.
  if (session.audio.size > 4) {
    const oldest = session.audio.keys().next().value;
    if (oldest) session.audio.delete(oldest);
  }
  const { english, korean, prompt } = reply;
  return { reply: { english, korean, prompt }, audioPath: prefix + '/' + session.id + '/audio/' + id };
}

function writeView(session: Pick<Session, 'id' | 'audio' | 'plan' | 'progress'>, reply: SpokenReply): SessionView {
  return {
    ...recap(session.progress),
    agenda: { title: session.plan.title, goals: session.plan.goals.map(({ id, title, practice }) => ({ id, title, practice })) },
    activeGoal: currentGoal(session.plan, session.progress)?.id ?? null,
    ...cacheReply(session, reply),
  };
}

function isUsableRecording(file: unknown): file is Blob {
  return file instanceof Blob && file.type === pcmAudioType &&
    file.size >= minPcmBytes && file.size <= maxPcmBytes && file.size % 2 === 0;
}

const endedChallenge: ChallengeView = { status: 'ended' };
const turnConflict = () => problem(409, 'This challenge turn is no longer active.');

function activeChallengeView(session: Session, turn: ChallengeTurn, reply: SpokenReply): OpenChallengeView {
  return { status: 'active', turn, ...cacheReply(session, reply) };
}

async function startChallenge(session: Session) {
  if (session.challenge === null) return json(endedChallenge);
  if (session.challenge) return json(session.challenge.latest);
  if (currentGoal(session.plan, session.progress)) return problem(409, 'Finish the lesson to start the challenge.');
  session.challengeStart ??= (async () => {
    const goals = pickChallengeGoals(session.plan, session.progress);
    const scenario = await session.room.planChallenge(session.level, goals);
    if (session.ended || session.controller.signal.aborted || session.challenge === null) {
      throw new Error('Challenge closed during setup.');
    }
    const latest = activeChallengeView(session, 1, challengeCueReply(scenario.cues[0], scenario.opening, 'warmly'));
    const challenge: ChallengeSession = { goals, scenario, latest, turnResults: new Map(), pendingTurn: false };
    session.challenge = challenge;
    return challenge;
  })().finally(() => {
    session.challengeStart = undefined;
    session.lastActivity = Date.now();
  });
  try {
    return json((await session.challengeStart).latest);
  } catch {
    if (session.ended || session.controller.signal.aborted || session.challenge === null) return turnConflict();
    return problem(502, 'Jiwon couldn’t prepare the challenge. Try starting it again.');
  }
}

async function submitChallengeTurn(request: Request, session: Session) {
  const form = await request.formData().catch(() => null);
  const id = form?.get('turnId');
  const submittedTurn = form?.get('turn');
  if (typeof id !== 'string' || !token.test(id) || (submittedTurn !== '1' && submittedTurn !== '2')) {
    return problem(400, 'The challenge turn is invalid.');
  }
  const challenge = session.challenge;
  if (!challenge || session.ended || session.controller.signal.aborted) return turnConflict();
  const cached = challenge.turnResults.get(id);
  if (cached) return json(cached);
  const { latest } = challenge;
  if (latest.status !== 'active' || String(latest.turn) !== submittedTurn || challenge.pendingTurn) return turnConflict();
  if (challenge.turnResults.size >= maxTurns) return problem(429, 'This challenge reached its turn limit.');
  const file = form?.get('audio');
  if (!isUsableRecording(file)) return problem(415, 'This recording could not be used. Try recording the same turn again.');

  const turn = latest.turn;
  const goal = challenge.goals[turn - 1];
  const cue = challenge.scenario.cues[turn - 1];
  const stillOpen = () => !session.ended && !session.controller.signal.aborted && session.challenge === challenge;
  challenge.pendingTurn = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!stillOpen()) return turnConflict();
    const { transcript, result } = await session.room.assessChallenge(bytes, { goal, cue, level: session.level });
    if (!stillOpen()) return turnConflict();
    const decision = decideChallengeAttempt(transcript, result);
    if (decision.kind === 'result') {
      const outcome = { title: goal.title, outcome: decision.outcome, quote: decision.quote, example: goal.example };
      if (turn === 1) {
        challenge.firstResult = outcome;
        challenge.latest = activeChallengeView(session, 2, challengeCueReply(challenge.scenario.cues[1], 'Thanks.', 'warmly'));
      } else {
        if (!challenge.firstResult) throw new Error('The first turn is missing.');
        const results: [ChallengeTaskResult, ChallengeTaskResult] = [challenge.firstResult, outcome];
        challenge.latest = { status: 'complete', results, ...cacheReply(session, challengeSummary(results)) };
      }
    } else {
      const lead = decision.kind === 'question'
        ? 'Try what you remember, or tell me if you’re unsure.'
        : 'I didn’t catch that clearly. Try recording again.';
      challenge.latest = activeChallengeView(session, turn, challengeCueReply(cue, lead, 'gently'));
    }
    challenge.turnResults.set(id, challenge.latest);
    return json(challenge.latest);
  } catch {
    if (!stillOpen()) return turnConflict();
    return problem(502, 'The challenge turn couldn’t be processed. Retry this turn.');
  } finally {
    challenge.pendingTurn = false;
    session.lastActivity = Date.now();
  }
}

function streamReply(audio: ReplyAudio, voice: TutorVoice, signal: AbortSignal) {
  if (!audio.pcm) {
    const pcm: PcmReply = { chunks: [], readers: new Set(), done: false };
    audio.pcm = pcm;
    let bytes = 0;
    void voice(audio.reply, (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > maxPcmBytes) throw new Error('Tutor audio is too long.');
      pcm.chunks.push(chunk);
      for (const reader of pcm.readers) reader.enqueue(chunk);
    }, signal).then(() => {
      pcm.done = true;
      for (const reader of pcm.readers) reader.close();
      pcm.readers.clear();
    }, (error: unknown) => {
      audio.pcm = undefined;
      for (const reader of pcm.readers) reader.error(error);
      pcm.readers.clear();
    });
  }

  const pcm = audio.pcm;
  let reader: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of pcm.chunks) controller.enqueue(chunk);
      if (pcm.done) controller.close();
      else pcm.readers.add(controller);
      reader = controller;
    },
    cancel() { pcm.readers.delete(reader); },
  });
  return new Response(body, { headers: { 'Content-Type': pcmAudioType, 'Cache-Control': 'no-store' } });
}

export function createLessonHandler(provider: RealtimeProvider | null, voice: TutorVoice | null) {
  const sessions = new Map<string, Session>();
  const planning = new Map<string, Promise<Session>>();

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (request.headers.has('origin') && request.headers.get('origin') !== url.origin)) {
      return problem(403, 'Open the lesson from Verba.');
    }
    if (!provider) return problem(503, 'Live voice requires an Inworld API key on the lesson server.');
    if (!voice) return problem(503, 'Configure an ElevenLabs API key and Jiwon’s voice ID on the lesson server.');
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivity <= (session.ended ? 60_000 : idleMs)) continue;
      session.controller.abort();
      sessions.delete(id);
    }

    const owner = browserId(request);
    const { pathname } = url;
    if (pathname === prefix && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { level?: unknown; entryId?: unknown; tutorId?: unknown } | null;
      const level = levelIds.find((id) => id === body?.level);
      const entryId = body?.entryId;
      if (body?.tutorId !== koreanTutorId || !level || typeof entryId !== 'string' || !token.test(entryId)) {
        return problem(400, 'Choose a valid level for Jiwon.');
      }
      const existing = [...sessions.values()].find((candidate) =>
        owner && candidate.owner === owner && candidate.entryId === entryId);
      if (existing) return json({ sessionId: existing.id, view: existing.latest });
      const key = `${owner ?? ''}/${entryId}`;
      let pending = planning.get(key);
      if (!pending) {
        if (sessions.size + planning.size >= maxSessions) return problem(503, 'The practice room is busy. Try again shortly.');
        pending = (async () => {
          const controller = new AbortController();
          try {
            const room = provider.room(controller.signal);
            const plan = await room.plan(level);
            const start = {
              id: randomUUID(), plan, progress: newProgress(), audio: new Map<string, ReplyAudio>(), room,
            };
            const session: Session = {
              ...start, owner: owner ?? randomUUID(), entryId, level,
              latest: writeView(start, {
                delivery: 'warmly',
                english: plan.opening,
                korean: null,
                prompt: plan.goals[0].practice,
              }),
              turnResults: new Map(), pendingTurn: false, ended: false, lastActivity: Date.now(), controller,
            };
            sessions.set(session.id, session);
            return session;
          } catch (error) {
            controller.abort();
            throw error;
          }
        })().finally(() => planning.delete(key));
        planning.set(key, pending);
      }

      try {
        const session = await pending;
        const cookie = `${cookieName}=${session.owner}; HttpOnly; SameSite=Strict; Path=/api/lesson${url.protocol === 'https:' ? '; Secure' : ''}`;
        return json({ sessionId: session.id, view: session.latest }, 201, { 'Set-Cookie': cookie });
      } catch {
        return problem(502, 'Jiwon couldn’t prepare your speaking goals. Try starting the lesson again.');
      }
    }

    const match = pathname.match(/^\/api\/lesson\/sessions\/([a-f0-9-]{36})\/(turns|end|audio\/([a-f0-9-]{36})|challenge\/(?:start|turns|end))$/i);
    const session = match && sessions.get(match[1]);
    if (!session || !owner || owner !== session.owner) {
      return problem(404, 'This lesson is unavailable. Return to the level picker to start again.');
    }
    session.lastActivity = now;
    if (match[2] === 'end' && request.method === 'POST') {
      session.ended = true;
      session.controller.abort();
      session.audio.clear();
      session.turnResults.clear();
      session.challenge = null;
      return json(recap(session.progress));
    }
    if (session.ended) return problem(409, 'This lesson has ended.');

    if (match[3] && request.method === 'GET') {
      const audio = session.audio.get(match[3]);
      if (!audio) return problem(404, 'This reply is unavailable.');
      return streamReply(audio, voice, session.controller.signal);
    }

    if (request.method === 'POST') {
      switch (match[2]) {
        case 'challenge/start':
          return startChallenge(session);
        case 'challenge/turns':
          return submitChallengeTurn(request, session);
        case 'challenge/end':
          if (session.challenge === undefined && !session.challengeStart) return turnConflict();
          session.challenge = null;
          return json(endedChallenge);
      }
    }

    if (match[2] !== 'turns' || request.method !== 'POST') return problem(405, 'Use a supported lesson action.');
    const form = await request.formData().catch(() => null);
    const id = form?.get('turnId');
    const kind = form?.get('kind');
    const file: unknown = form?.get('audio');
    if (!form || typeof id !== 'string' || !token.test(id) || (kind !== 'speech' && kind !== 'hint')) {
      return problem(400, 'The turn is invalid. Try a new turn.');
    }
    const cached = session.turnResults.get(id);
    if (cached) return json(cached);
    const goal = currentGoal(session.plan, session.progress);
    if (session.ended || !goal || form.get('goalId') !== goal.id || session.pendingTurn) {
      return problem(409, 'This turn is no longer active.');
    }
    if (session.turnResults.size >= maxTurns) return problem(429, 'This lesson reached its turn limit. Start a new lesson to keep practising.');
    if (kind === 'speech' && !isUsableRecording(file)) {
      return problem(415, 'This recording could not be used. Hold the button while you speak, then try again.');
    }

    session.pendingTurn = true;
    try {
      let turn: LessonTurn = { id, goal: goal.id, kind: 'hint' };
      if (kind === 'speech' && file instanceof Blob) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const context = {
          goal, level: session.level, previousReply: session.latest.reply, priorHelp: session.progress.helpByGoal[goal.id],
        };
        turn = { id, goal: goal.id, kind, ...await session.room.evaluate(bytes, context) };
      }
      if (session.ended || session.controller.signal.aborted) return problem(409, 'This lesson has ended.');
      const { progress, reply } = applyTurn(session.plan, session.progress, turn);
      session.progress = progress;
      session.latest = writeView(session, reply);
      session.turnResults.set(id, session.latest);
      return json(session.latest);
    } catch {
      if (session.ended) return problem(409, 'This lesson has ended.');
      return problem(502, 'The turn couldn’t be processed. Retry this turn.');
    } finally {
      session.pendingTurn = false;
      session.lastActivity = Date.now();
    }
  };
}
