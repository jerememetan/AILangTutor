import { goalIds, goals } from '../../src/lesson/lesson-contract.ts';
import type { GoalId, LevelId, Recap, TutorReply } from '../../src/lesson/lesson-contract.ts';

export const rubric: Record<GoalId, { criterion: string; hint: string; example: string }> = {
  greet: {
    criterion: 'Uses an appropriate Korean greeting to start this lesson, e.g. 안녕하세요 or 안녕하십니까.',
    hint: 'Try the polite greeting you would use when meeting someone.',
    example: '안녕하세요.',
  },
  'introduce-name': {
    criterion: 'Gives their name as a Korean self-introduction, e.g. 저는 민지예요 or 제 이름은 민지입니다. Accept names in any script.',
    hint: 'Put your name in a short Korean sentence that introduces you.',
    example: '제 이름은 민지예요.',
  },
  'ask-name': {
    criterion: 'In Korean, asks this tutor for her name, e.g. 이름이 뭐예요? or 성함이 어떻게 되세요?',
    hint: 'Use the Korean word for name and turn it into a polite question.',
    example: '이름이 뭐예요?',
  },
};

const alreadyDemonstrated: Record<GoalId, string> = {
  greet: 'You greeted me in Korean. Nicely done.',
  'introduce-name': 'You introduced yourself in Korean. Nice to meet you!',
  'ask-name': 'You asked my name in Korean. My name is Han Jiwon.',
};

const opening: Record<LevelId, TutorReply> = {
  beginner: {
    english: 'Hi, I’m Jiwon! Let’s practise introducing yourself. Can you greet me in Korean? If you’re new to Korean, ask me how in English.',
    korean: null,
    prompt: '',
  },
  basic: {
    english: 'Hi, I’m Jiwon. Imagine we just met at school. Try greeting me politely in Korean from memory.',
    korean: null,
    prompt: '',
  },
  comfortable: {
    english: 'Imagine this is our first meeting. How would you greet me politely?',
    korean: '처음 만났을 때 어떻게 인사할까요?',
    prompt: '',
  },
};

export function openingReply(level: LevelId) {
  return opening[level];
}

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

export function currentGoal(progress: Progress) {
  return goalIds[progress.completed.length] ?? null;
}

export function newProgress(): Progress {
  return { completed: [], helpByGoal: {}, recallRequired: false };
}

const normalize = (line: string) => line.normalize('NFC').trim().replace(/\s+/gu, ' ');

export function applyTurn(progress: Progress, turn: LessonTurn): { progress: Progress; reply: TutorReply } {
  const goal = currentGoal(progress);
  if (!goal || goal !== turn.goal || progress.completed.some((item) => item.turnId === turn.id)) {
    throw new Error('Turn does not belong to the active goal.');
  }
  if (turn.kind === 'hint') {
    const previouslyHelped = Boolean(progress.helpByGoal[goal]);
    return {
      progress: { ...progress, helpByGoal: { ...progress.helpByGoal, [goal]: 'Practised with a hint.' }, recallRequired: progress.recallRequired || previouslyHelped },
      reply: {
        english: previouslyHelped ? 'Here’s a Korean example you can practise.' : rubric[goal].hint,
        korean: previouslyHelped ? rubric[goal].example : null,
        prompt: goals[goal].practice,
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
        reply: { english: 'Good practice. Now try it once more from memory.', korean: null, prompt: goals[goal].practice },
      };
    }
    const next = {
      ...progress,
      completed: [...progress.completed, { goal, turnId: turn.id, quote }],
    };
    const nextGoal = currentGoal(next);
    const hadHelp = Object.keys(next.helpByGoal).length > 0;
    return {
      progress: next,
      reply: {
        english: nextGoal ? alreadyDemonstrated[goal] : `${alreadyDemonstrated[goal]} You can now greet someone, introduce yourself, and ask their name in Korean.`,
        korean: nextGoal ? null : '제 이름은 한지원이에요.',
        prompt: nextGoal ? goals[nextGoal].practice : hadHelp
          ? 'Next time, try recalling the phrases you practised with help.'
          : 'Try the same introduction with a new conversation partner.',
      },
    };
  }
  if (!result || result.verdict === 'unclear' || result.verdict === 'demonstrated') {
    return {
      progress,
      reply: { english: 'I didn’t catch that clearly. Could you try again?', korean: null, prompt: goals[goal].practice },
    };
  }
  return {
    progress: {
      ...progress,
      helpByGoal: { ...progress.helpByGoal, [goal]: result.verdict === 'side-question' ? 'Asked for an explanation.' : 'Practised again after feedback.' },
      recallRequired: progress.recallRequired || result.gaveExample,
    },
    reply: { english: result.english, korean: result.korean, prompt: goals[goal].practice },
  };
}
