import { useEffect, useRef, useState } from 'react';
import { koreanTutorId } from './lesson-contract';
import type { ChatMessage, ChallengeTurn, ChallengeView, GoalId, LevelId, OpenLesson, Recap, SessionView } from './lesson-contract';

const endpoint = '/api/lesson/sessions';
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

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => null);
  throw new LessonRequestError(response.status, body?.error ?? 'The lesson connection was interrupted. Try again.');
}

export function useLessonSession(level: LevelId) {
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const [view, setView] = useState<SessionView | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [challenge, setChallenge] = useState<ChallengeView | null>(null);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [pending, setPending] = useState(false);
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
      try {
        const opened = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorId: koreanTutorId, level, entryId }),
          signal: controller.signal,
        }).then(readJson<OpenLesson>);
        if (controller.signal.aborted || ended.current) {
          void fetch(`${endpoint}/${opened.sessionId}/end`, { method: 'POST', keepalive: true }).catch(() => {});
          return;
        }
        id.current = opened.sessionId;
        setView(opened.view);
        setMessages(opened.view.messages);
      } catch (reason) {
        if (!controller.signal.aborted && !ended.current) {
          setError(reason instanceof Error ? reason.message : 'The lesson could not start.');
        }
      }
    });
    return close;
  }, [entryId, level]);

  async function send(action: LessonAction) {
    if (!id.current || request.current || ended.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    setFailedAction(null);
    retryAction.current = null;
    const { path, body } = actionRequest(action);
    try {
      const response = await fetch(`${endpoint}/${id.current}/${path}`, {
        method: 'POST', body, signal: controller.signal,
      });
      if (action.type === 'lesson-turn') {
        const next = await readJson<SessionView>(response);
        if (!controller.signal.aborted && !ended.current) {
          setView(next);
          setMessages(next.messages);
        }
      } else {
        const next = await readJson<ChallengeView>(response);
        if (!controller.signal.aborted && !ended.current) {
          setChallenge(next);
          setChallengeVisible(next.status !== 'ended');
          if (next.status !== 'ended') setMessages(next.messages);
        }
      }
    } catch (reason) {
      if (controller.signal.aborted || ended.current) return;
      const canRetry = !(reason instanceof LessonRequestError &&
        ([413, 415].includes(reason.status) || (reason.status === 429 && action.type === 'challenge-turn')));
      retryAction.current = canRetry ? action : null;
      setFailedAction(canRetry ? action.type : null);
      setError(reason instanceof Error ? reason.message : 'The turn could not be sent.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function submit(audio?: Blob) {
    // An unacknowledged result may have advanced the server. Resolve it before starting another turn.
    if (retryAction.current) return;
    if (challengeVisible) {
      if (audio && challenge?.status === 'active') {
        void send({ type: 'challenge-turn', id: crypto.randomUUID(), turn: challenge.turn, audio });
      }
    } else if (view?.activeGoal) {
      void send({ type: 'lesson-turn', turn: { id: crypto.randomUUID(), goal: view.activeGoal, audio } });
    }
  }

  function startChallenge() {
    if (view && !view.activeGoal && !recap && !challenge && !retryAction.current) {
      void send({ type: 'challenge-start' });
    }
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
    view, recap, messages, pending, error, failedAction, submit, end, challenge, challengeVisible,
    startChallenge, endChallenge,
    showChallengeResults: () => { if (challenge?.status === 'complete') setChallengeVisible(true); },
    backToLessonRecap: () => setChallengeVisible(false),
    retry: () => {
      if (retryAction.current) void send(retryAction.current);
      else if (!id.current && !ended.current) {
        setError('');
        setMessages([]);
        setEntryId(crypto.randomUUID());
      }
    },
  };
}
