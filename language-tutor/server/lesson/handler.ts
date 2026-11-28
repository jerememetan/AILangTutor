import { randomUUID } from 'node:crypto';
import { koreanTutorId, levelIds, maxAudioBytes } from '../../src/lesson/lesson-contract.ts';
import type { Recap, SessionView, TutorReply } from '../../src/lesson/lesson-contract.ts';
import { audioEncodings } from './providers.ts';
import type { AcceptedAudio, LessonProviders } from './providers.ts';
import { applyTurn, currentGoal, newProgress, openingReply } from './session.ts';
import type { LessonTurn, Progress } from './session.ts';
import type { LevelId } from '../../src/lesson/lesson-contract.ts';

const prefix = '/api/lesson/sessions';
export const maxRequestBytes = maxAudioBytes + 16_384;
const idleMs = 30 * 60_000;
const maxSessions = 64;
const maxTurns = 60;
const token = /^[a-f0-9-]{36}$/i;
const cookieName = 'verba_lesson';

type ReplyAudio = { reply: TutorReply; pending?: Promise<ArrayBuffer> };
type Session = {
  id: string;
  owner: string;
  entryId: string;
  level: LevelId;
  progress: Progress;
  latest: SessionView;
  turnResults: Map<string, SessionView>;
  audio: Map<string, ReplyAudio>;
  pendingTurn: boolean;
  ended: boolean;
  lastActivity: number;
  controller: AbortController;
};

const json = (data: unknown, status = 200, headers?: HeadersInit) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
};
const problem = (status: number, error: string) => json({ error }, status);
const browserId = (request: Request) => request.headers.get('cookie')?.match(/(?:^|; )verba_lesson=([a-f0-9-]{36})(?:;|$)/i)?.[1];
const recap = ({ completed, helpByGoal }: Progress): Recap => ({ completed, helpByGoal });

function writeView(session: Pick<Session, 'id' | 'audio' | 'progress'>, reply: TutorReply): SessionView {
  const id = randomUUID();
  session.audio.set(id, { reply });
  // Keep the current reply and a few recent replies for replay and network retries.
  if (session.audio.size > 4) {
    const oldest = session.audio.keys().next().value;
    if (oldest) session.audio.delete(oldest);
  }
  return {
    ...recap(session.progress),
    activeGoal: currentGoal(session.progress),
    reply,
    audioPath: `${prefix}/${session.id}/audio/${id}`,
  };
}

export function createLessonHandler(providers: LessonProviders | null) {
  const sessions = new Map<string, Session>();

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (request.headers.has('origin') && request.headers.get('origin') !== url.origin)) {
      return problem(403, 'Open the lesson from Verba.');
    }
    if (!providers) return problem(503, 'Live voice is unavailable. Add the lesson provider credentials on the server.');
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivity <= (session.ended ? 60_000 : idleMs)) continue;
      session.controller.abort();
      sessions.delete(id);
    }

    const owner = browserId(request);
    const { pathname } = url;
    if (pathname === prefix && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const level = levelIds.find((id) => id === body?.level);
      if (body?.tutorId !== koreanTutorId || !level || typeof body.entryId !== 'string' || !token.test(body.entryId)) {
        return problem(400, 'Choose a valid level for Jiwon.');
      }
      const existing = [...sessions.values()].find((candidate) =>
        owner && candidate.owner === owner && candidate.entryId === body.entryId);
      if (existing) return json({ sessionId: existing.id, view: existing.latest });
      if (sessions.size >= maxSessions) return problem(503, 'The practice room is busy. Try again shortly.');

      const start = { id: randomUUID(), progress: newProgress(), audio: new Map<string, ReplyAudio>() };
      const session: Session = {
        ...start, owner: owner ?? randomUUID(), entryId: body.entryId, level,
        latest: writeView(start, openingReply(level)), turnResults: new Map(),
        pendingTurn: false, ended: false, lastActivity: now,
        controller: new AbortController(),
      };
      sessions.set(session.id, session);
      const cookie = `${cookieName}=${session.owner}; HttpOnly; SameSite=Strict; Path=/api/lesson${url.protocol === 'https:' ? '; Secure' : ''}`;
      return json({ sessionId: session.id, view: session.latest }, 201, { 'Set-Cookie': cookie });
    }

    const match = pathname.match(/^\/api\/lesson\/sessions\/([a-f0-9-]{36})\/(turns|end|audio\/([a-f0-9-]{36}))$/i);
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
      return json(recap(session.progress));
    }
    if (session.ended) return problem(409, 'This lesson has ended.');

    if (match[3] && request.method === 'GET') {
      const audio = session.audio.get(match[3]);
      if (!audio) return problem(404, 'This reply is unavailable.');
      audio.pending ??= providers.speak(audio.reply, session.controller.signal);
      try {
        const bytes = await audio.pending;
        return new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      } catch {
        audio.pending = undefined;
        return problem(502, 'Jiwon’s audio could not play. Try playing it again.');
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
    const goal = currentGoal(session.progress);
    if (session.ended || !goal || form.get('goalId') !== goal || session.pendingTurn) {
      return problem(409, 'This turn is no longer active.');
    }
    if (session.turnResults.size >= maxTurns) return problem(429, 'This lesson reached its turn limit. Start a new lesson to keep practising.');
    const type = file instanceof Blob ? file.type.split(';')[0] : '';
    if (kind === 'speech' && (!(file instanceof Blob) || !file.size ||
      file.size > maxAudioBytes || !Object.hasOwn(audioEncodings, type))) {
      return problem(415, 'This recording could not be used. Try saying it again.');
    }

    session.pendingTurn = true;
    try {
      let turn: LessonTurn = { id, goal, kind: 'hint' };
      if (kind === 'speech' && file instanceof Blob) {
        const signal = session.controller.signal;
        const clip = { type: type as AcceptedAudio, bytes: new Uint8Array(await file.arrayBuffer()) };
        const transcript = await providers.transcribe(clip, signal);
        signal.throwIfAborted();
        const result = transcript ? await providers.assess({
          goal, level: session.level, transcript, previousReply: session.latest.reply, priorHelp: session.progress.helpByGoal[goal],
        }, signal) : null;
        turn = { id, goal, kind, transcript, result };
      }
      if (session.ended || session.controller.signal.aborted) return problem(409, 'This lesson has ended.');
      const { progress, reply } = applyTurn(session.progress, turn);
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
