import type { GoalId, Recap } from '../../src/lesson/lesson-contract.ts';
import { groundedKoreanQuote } from './assessment.ts';
import type { SpokenReply } from './elevenLabsVoice.ts';
import type { LessonPlan } from './lessonPlan.ts';

export type Assessment = {
  verdict: 'demonstrated' | 'retry' | 'side-question' | 'discussion' | 'resume' | 'unclear';
  evidence: string | null;
  english: string;
  korean: string | null;
  gaveExample: boolean;
};

export type LessonTurn =
  | { id: string; goal: GoalId; kind: 'hint' | 'resume' }
  | { id: string; goal: GoalId | null; kind: 'speech'; transcript: string; result: Assessment | null };

export type Progress = Recap & { recallRequired: boolean; discussing: boolean };

export function currentGoal(plan: LessonPlan, progress: Progress) {
  return plan.goals[progress.completed.length];
}

export function newProgress(): Progress {
  return { completed: [], helpByGoal: {}, recallRequired: false, discussing: false };
}

export function applyTurn(plan: LessonPlan, progress: Progress, turn: LessonTurn): { progress: Progress; reply: SpokenReply } {
  const goal = currentGoal(plan, progress);
  if ((goal?.id ?? null) !== turn.goal || progress.completed.some((item) => item.turnId === turn.id)) {
    throw new Error('Turn does not belong to the active goal.');
  }
  const result = turn.kind === 'speech' ? turn.result : null;
  if (goal && (turn.kind === 'resume' || result?.verdict === 'resume')) {
    return {
      progress: { ...progress, discussing: false },
      reply: { delivery: 'warmly', english: "Let's pick up where we left off.", korean: null, prompt: goal.practice },
    };
  }
  if (result && result.verdict !== 'unclear' && (!goal || result.verdict === 'side-question' || result.verdict === 'discussion')) {
    const helped = goal && (result.verdict === 'side-question' || result.gaveExample);
    return {
      progress: {
        ...progress,
        discussing: true,
        helpByGoal: helped ? { ...progress.helpByGoal, [goal.id]: 'Asked for an explanation.' } : progress.helpByGoal,
        recallRequired: progress.recallRequired || Boolean(goal && result.gaveExample),
      },
      reply: { delivery: 'warmly', english: result.english, korean: result.korean, prompt: '' },
    };
  }
  if (!goal) {
    return {
      progress: { ...progress, discussing: true },
      reply: { delivery: 'gently', english: "I didn't catch that clearly. Could you say it again?", korean: null, prompt: '' },
    };
  }
  if (turn.kind === 'hint') {
    const previouslyHelped = Boolean(progress.helpByGoal[goal.id]);
    return {
      progress: { ...progress, discussing: false, helpByGoal: { ...progress.helpByGoal, [goal.id]: 'Practised with a hint.' }, recallRequired: progress.recallRequired || previouslyHelped },
      reply: {
        delivery: 'gently',
        english: previouslyHelped ? 'Here’s a Korean example you can practise.' : goal.hint,
        korean: previouslyHelped ? goal.example : null,
        prompt: goal.practice,
      },
    };
  }

  const quote = turn.kind === 'speech' && result?.verdict === 'demonstrated' && groundedKoreanQuote(turn.transcript, result.evidence);
  if (result?.verdict === 'demonstrated' && quote) {
    if (progress.recallRequired) {
      return {
        progress: { ...progress, discussing: false, recallRequired: false },
        reply: { delivery: 'encouraging', english: 'Good practice. Now try it once more from memory.', korean: null, prompt: goal.practice },
      };
    }
    const next = {
      ...progress,
      discussing: false,
      completed: [...progress.completed, { goal: goal.id, turnId: turn.id, quote }],
    };
    const nextGoal = currentGoal(plan, next);
    const hadHelp = Object.keys(next.helpByGoal).length > 0;
    return {
      progress: next,
      reply: {
        delivery: 'encouraging',
        english: nextGoal ? result.english : `${result.english} You finished all your speaking goals for this lesson.`,
        korean: result.korean,
        prompt: nextGoal?.practice ?? (hadHelp
          ? 'We can revisit a phrase you practised or talk about something new.'
          : 'Ask me anything about Korean, or try the speaking challenge.'),
      },
    };
  }
  if (!result || result.verdict === 'unclear' || result.verdict === 'demonstrated') {
    return {
      progress,
      reply: { delivery: 'gently', english: 'I didn’t catch that clearly. Could you try again?', korean: null, prompt: progress.discussing ? '' : goal.practice },
    };
  }
  return {
    progress: {
      ...progress,
      discussing: false,
      helpByGoal: { ...progress.helpByGoal, [goal.id]: 'Practised again after feedback.' },
      recallRequired: progress.recallRequired || result.gaveExample,
    },
    reply: { delivery: 'gently', english: result.english, korean: result.korean, prompt: goal.practice },
  };
}
