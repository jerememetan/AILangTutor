import type { GoalId, Recap, TutorReply } from '../../src/lesson/lesson-contract.ts';
import type { LessonPlan } from './lessonPlan.ts';

export type Assessment = {
  verdict: 'demonstrated' | 'retry' | 'side-question' | 'unclear';
  evidence: string | null;
  english: string;
  korean: string | null;
  gaveExample: boolean;
};

export type LessonTurn =
  | { id: string; goal: GoalId; kind: 'hint' }
  | { id: string; goal: GoalId; kind: 'speech'; transcript: string; result: Assessment | null };

export type Progress = Recap & { recallRequired: boolean };

export function currentGoal(plan: LessonPlan, progress: Progress) {
  return plan.goals[progress.completed.length];
}

export function newProgress(): Progress {
  return { completed: [], helpByGoal: {}, recallRequired: false };
}

const normalize = (line: string) => line.normalize('NFC').trim().replace(/\s+/gu, ' ');

export function applyTurn(plan: LessonPlan, progress: Progress, turn: LessonTurn): { progress: Progress; reply: TutorReply } {
  const goal = currentGoal(plan, progress);
  if (!goal || goal.id !== turn.goal || progress.completed.some((item) => item.turnId === turn.id)) {
    throw new Error('Turn does not belong to the active goal.');
  }
  if (turn.kind === 'hint') {
    const previouslyHelped = Boolean(progress.helpByGoal[goal.id]);
    return {
      progress: { ...progress, helpByGoal: { ...progress.helpByGoal, [goal.id]: 'Practised with a hint.' }, recallRequired: progress.recallRequired || previouslyHelped },
      reply: {
        english: previouslyHelped ? 'Here’s a Korean example you can practise.' : goal.hint,
        korean: previouslyHelped ? goal.example : null,
        prompt: goal.practice,
      },
    };
  }

  const result = turn.result;
  const quote = normalize(result?.evidence ?? '');
  if (
    result?.verdict === 'demonstrated' && /\p{Script=Hangul}/u.test(quote) &&
    normalize(turn.transcript).includes(quote)
  ) {
    if (progress.recallRequired) {
      return {
        progress: { ...progress, recallRequired: false },
        reply: { english: 'Good practice. Now try it once more from memory.', korean: null, prompt: goal.practice },
      };
    }
    const next = {
      ...progress,
      completed: [...progress.completed, { goal: goal.id, turnId: turn.id, quote }],
    };
    const nextGoal = currentGoal(plan, next);
    const hadHelp = Object.keys(next.helpByGoal).length > 0;
    return {
      progress: next,
      reply: {
        english: nextGoal ? result.english : `${result.english} You finished all your speaking goals for this lesson.`,
        korean: result.korean,
        prompt: nextGoal?.practice ?? (hadHelp
          ? 'Next time, try recalling the phrases you practised with help.'
          : 'Try using what you practised with a new conversation partner.'),
      },
    };
  }
  if (!result || result.verdict === 'unclear' || result.verdict === 'demonstrated') {
    return {
      progress,
      reply: { english: 'I didn’t catch that clearly. Could you try again?', korean: null, prompt: goal.practice },
    };
  }
  return {
    progress: {
      ...progress,
      helpByGoal: { ...progress.helpByGoal, [goal.id]: result.verdict === 'side-question' ? 'Asked for an explanation.' : 'Practised again after feedback.' },
      recallRequired: progress.recallRequired || result.gaveExample,
    },
    reply: { english: result.english, korean: result.korean, prompt: goal.practice },
  };
}
