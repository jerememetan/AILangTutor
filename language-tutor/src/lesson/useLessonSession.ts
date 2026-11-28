import { useEffect, useRef, useState } from 'react';
import { koreanTutorId } from './lesson-contract';
import type { GoalId, LevelId, OpenLesson, Recap, SessionView } from './lesson-contract';

const endpoint = '/api/lesson/sessions';
type PendingTurn = { id: string; goal: GoalId; audio?: Blob };

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const id = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const failedTurn = useRef<PendingTurn | null>(null);
  const ended = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const close = () => {
      controller.abort();
      request.current?.abort();
      request.current = null;
      failedTurn.current = null;
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
      } catch (reason) {
        if (!controller.signal.aborted && !ended.current) {
          setError(reason instanceof Error ? reason.message : 'The lesson could not start.');
        }
      }
    });
    return close;
  }, [entryId, level]);

  async function send(turn: PendingTurn) {
    if (!id.current || request.current || ended.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    setRetryable(false);
    failedTurn.current = null;
    const body = new FormData();
    body.set('turnId', turn.id);
    body.set('goalId', turn.goal);
    body.set('kind', turn.audio ? 'speech' : 'hint');
    if (turn.audio) body.set('audio', turn.audio, 'learner-audio');
    try {
      const next = await fetch(`${endpoint}/${id.current}/turns`, {
        method: 'POST', body, signal: controller.signal,
      }).then(readJson<SessionView>);
      if (!controller.signal.aborted && !ended.current) setView(next);
    } catch (reason) {
      if (controller.signal.aborted || ended.current) return;
      const newClipNeeded = reason instanceof LessonRequestError && [413, 415].includes(reason.status);
      failedTurn.current = newClipNeeded ? null : turn;
      setRetryable(!newClipNeeded);
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
    if (failedTurn.current) return;
    if (view?.activeGoal) void send({ id: crypto.randomUUID(), goal: view.activeGoal, audio });
  }

  function end() {
    if (ended.current) return;
    ended.current = true;
    request.current?.abort();
    request.current = null;
    failedTurn.current = null;
    setPending(false);
    setError('');
    setRetryable(false);
    setRecap({ completed: view?.completed ?? [], helpByGoal: view?.helpByGoal ?? {} });
    const session = id.current;
    id.current = null;
    if (!session) return;
    void fetch(`${endpoint}/${session}/end`, { method: 'POST', keepalive: true })
      .then(readJson<Recap>).then(setRecap).catch(() => {});
  }

  return {
    view, recap, pending, error, retryable, submit, end,
    retry: () => {
      if (failedTurn.current) void send(failedTurn.current);
      else if (!id.current && !ended.current) {
        setError('');
        setEntryId(crypto.randomUUID());
      }
    },
  };
}
