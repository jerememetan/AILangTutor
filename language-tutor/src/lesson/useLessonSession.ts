import { useEffect, useRef, useState } from 'react';
import { koreanTutorId } from './lesson-contract';
import type { ChallengeTurn, ChallengeView, GoalId, LevelId, OpenLesson, Recap, SessionView } from './lesson-contract';

const endpoint = '/api/lesson/sessions';
const turnTimeoutMs = 50_000;
const setupTimeoutMs = 90_000;
type PendingTurn = { id: string; goal: GoalId; audio?: Blob };
type LessonAction =
  | { type: 'lesson-turn'; turn: PendingTurn }
  | { type: 'challenge-start' }
  | { type: 'challenge-end' }
  | { type: 'challenge-turn'; id: string; turn: ChallengeTurn; audio: Blob };

function actionRequest(action: LessonAction): { path: string; body?: FormData } {
  if (action.type === 'challenge-start') return { path: 'challenge/start' };
  if (action.type === 'challenge-end') return { path: 'challenge/end' };

  const body = new FormData();
  if (action.type === 'challenge-turn') {
    body.set('turnId', action.id);
    body.set('turn', String(action.turn));
    body.set('audio', action.audio, 'learner-audio');
    return { path: 'challenge/turns', body };
  }
  const { id, goal, audio } = action.turn;
  body.set('turnId', id);
  body.set('goalId', goal);
  body.set('kind', audio ? 'speech' : 'hint');
  if (audio) body.set('audio', audio, 'learner-audio');
  return { path: 'turns', body };
}

class LessonRequestError extends Error {
  readonly status: number;
  readonly currentView?: SessionView | ChallengeView;

  constructor(status: number, message: string, currentView?: SessionView | ChallengeView) {
    super(message);
    this.status = status;
    this.currentView = currentView;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => null);
  throw new LessonRequestError(response.status, body?.error ?? 'The lesson connection was interrupted. Try again.', body?.view);
}

export function useLessonSession(level: LevelId) {
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const [view, setView] = useState<SessionView | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [challenge, setChallenge] = useState<ChallengeView | null>(null);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [canRecordAgain, setCanRecordAgain] = useState(false);
  const [roomExpired, setRoomExpired] = useState(false);
  const [error, setError] = useState('');
  const [failedAction, setFailedAction] = useState<LessonAction['type'] | null>(null);
  const id = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const retryAction = useRef<LessonAction | null>(null);
  const ended = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const close = () => {
      controller.abort();
      request.current?.abort();
      request.current = null;
      retryAction.current = null;
      if (!id.current) return;
      void fetch(`${endpoint}/${id.current}/end`, { method: 'POST', keepalive: true }).catch(() => {});
      id.current = null;
    };
    // Strict Mode cleans up the first mount before the browser needs to open a room.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const timeout = AbortSignal.timeout(setupTimeoutMs);
      try {
        const opened = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorId: koreanTutorId, level, entryId }),
          signal: AbortSignal.any([controller.signal, timeout]),
        }).then(readJson<OpenLesson>);
        if (controller.signal.aborted || ended.current) {
          void fetch(`${endpoint}/${opened.sessionId}/end`, { method: 'POST', keepalive: true }).catch(() => {});
          return;
        }
        id.current = opened.sessionId;
        setView(opened.view);
      } catch (reason) {
        if (!controller.signal.aborted && !ended.current) {
          setError(timeout.aborted ? 'Lesson setup took too long. Try again.'
            : reason instanceof Error ? reason.message : 'The lesson could not start.');
        }
      }
    });
    return close;
  }, [entryId, level]);

  async function send(action: LessonAction) {
    if (!id.current || request.current || ended.current) return;
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(turnTimeoutMs);
    request.current = controller;
    setPending(true);
    setError('');
    setFailedAction(null);
    const recording = action.type === 'challenge-turn' ||
      (action.type === 'lesson-turn' && Boolean(action.turn.audio));
    setCanRecordAgain(recording);
    retryAction.current = null;
    try {
      const { path, body } = actionRequest(action);
      const response = await fetch(`${endpoint}/${id.current}/${path}`, {
        method: 'POST', body, signal: AbortSignal.any([controller.signal, timeout]),
      });
      if (action.type === 'lesson-turn') {
        const next = await readJson<SessionView>(response);
        if (!controller.signal.aborted && !ended.current) setView(next);
      } else {
        const next = await readJson<ChallengeView>(response);
        if (!controller.signal.aborted && !ended.current) {
          setChallenge(next);
          setChallengeVisible(next.status !== 'ended');
        }
      }
      if (!controller.signal.aborted) setCanRecordAgain(false);
    } catch (reason) {
      if (controller.signal.aborted || ended.current) return;
      if (reason instanceof LessonRequestError && reason.status === 409 && reason.currentView) {
        const current = reason.currentView;
        if (action.type === 'lesson-turn' && 'agenda' in current) setView(current);
        else if (action.type === 'challenge-turn' && 'status' in current) {
          setChallenge(current);
          setChallengeVisible(current.status !== 'ended');
        }
        setCanRecordAgain(false);
        setError(reason.message);
        return;
      }
      const expired = reason instanceof LessonRequestError && reason.status === 404;
      const canRetry = !(reason instanceof LessonRequestError && [400, 404, 413, 415, 429].includes(reason.status));
      setRoomExpired(expired);
      retryAction.current = canRetry ? action : null;
      setFailedAction(canRetry ? action.type : null);
      setCanRecordAgain(canRetry && recording);
      setError(timeout.aborted ? (recording ? 'The turn took too long. Retry it or record again.' : 'That request took too long. Try again.')
        : reason instanceof Error ? reason.message : 'The turn could not be sent.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function submit(audio?: Blob) {
    // An unacknowledged result may have advanced the server. Resolve it before starting another turn.
    if (retryAction.current || roomExpired) return;
    if (challengeVisible) {
      if (audio && challenge?.status === 'active') {
        void send({ type: 'challenge-turn', id: crypto.randomUUID(), turn: challenge.turn, audio });
      }
    } else if (view?.activeGoal) {
      void send({ type: 'lesson-turn', turn: { id: crypto.randomUUID(), goal: view.activeGoal, audio } });
    }
  }

  function startChallenge() {
    if (view && !view.activeGoal && !recap && !challenge && !retryAction.current && !roomExpired) {
      void send({ type: 'challenge-start' });
    }
  }

  function recordAgain() {
    if (!canRecordAgain) return;
    request.current?.abort();
    request.current = null;
    retryAction.current = null;
    setPending(false);
    setCanRecordAgain(false);
    setFailedAction(null);
    setError('');
  }

  function restartLesson() {
    if (!roomExpired) return;
    setView(null);
    setChallenge(null);
    setChallengeVisible(false);
    setRoomExpired(false);
    setError('');
    setEntryId(crypto.randomUUID());
  }

  function endChallenge() {
    if (challenge?.status !== 'active') return;
    request.current?.abort();
    request.current = null;
    setChallenge({ status: 'ended' });
    setChallengeVisible(false);
    void send({ type: 'challenge-end' });
  }

  function end() {
    if (ended.current) return;
    ended.current = true;
    request.current?.abort();
    request.current = null;
    retryAction.current = null;
    setPending(false);
    setError('');
    setFailedAction(null);
    setCanRecordAgain(false);
    setRoomExpired(false);
    setChallengeVisible(false);
    setChallenge(null);
    setRecap({ completed: view?.completed ?? [], helpByGoal: view?.helpByGoal ?? {} });
    const session = id.current;
    id.current = null;
    if (!session) return;
    void fetch(`${endpoint}/${session}/end`, { method: 'POST', keepalive: true })
      .then(readJson<Recap>).then(setRecap).catch(() => {});
  }

  return {
    view, recap, pending, error, failedAction, submit, end, challenge, challengeVisible,
    startChallenge, endChallenge, recordAgain, canRecordAgain, roomExpired, restartLesson,
    showChallengeResults: () => { if (challenge?.status === 'complete') setChallengeVisible(true); },
    backToLessonRecap: () => setChallengeVisible(false),
    retry: () => {
      if (retryAction.current) void send(retryAction.current);
      else if (!id.current && !ended.current) {
        setError('');
        setEntryId(crypto.randomUUID());
      }
    },
  };
}
