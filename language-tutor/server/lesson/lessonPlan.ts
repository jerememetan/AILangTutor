import type { AgendaGoal, GoalId, LevelId } from '../../src/lesson/lesson-contract.ts';

export type LessonGoal = AgendaGoal & {
  criterion: string;
  hint: string;
  example: string;
};

export type LessonPlan = {
  title: string;
  opening: string;
  goals: LessonGoal[];
};

const levels = {
  beginner: {
    count: 2,
    direction: 'Assume zero Korean. Use two single-phrase speaking goals for a first meeting. Start with a simple greeting and build toward saying a name. Give instructions in plain English.',
  },
  basic: {
    count: 3,
    direction: 'Assume a few familiar phrases. Use familiar polite speech, then ask the learner to use it in a short first-meeting exchange. Include a simple question the learner can ask.',
  },
  comfortable: {
    count: 4,
    direction: 'Assume the learner can already greet someone and say their name. Give richer, distinct goals for a first meeting, such as adding a personal detail, choosing register for the situation, asking a natural follow-up, and transferring what they know to a new conversation. Each goal is one spoken turn, at most two sentences.',
  },
} satisfies Record<LevelId, { count: number; direction: string }>;

export function planInstructions(level: LevelId) {
  return [
    'You are Han Jiwon, a Korean tutor. Plan a short spoken lesson about introducing yourself in Korean.',
    `The learner selected ${level}. Generate exactly ${levels[level].count} ordered goals. ${levels[level].direction}`,
    'Start by probing what the learner can say from memory. Sequence distinct, observable speaking tasks from easiest to hardest. The final task should apply what the learner practised in a slightly different situation at their level.',
    'Every goal has a short English title and one English prompt addressed to the learner. Ask for one spoken attempt at a time. Keep the target answer out of titles, prompts and the opening.',
    'Give each goal an assessment criterion that describes evidence in the learner’s Korean words and accepts valid variations. Include a small English hint and a short Hangul example for when the learner needs help. Keep examples out of the hint.',
    'Write a brief English welcome from Jiwon for the opening. The app will say the first goal prompt immediately after it. Keep the agenda title under 64 characters, and write plain text throughout.',
  ].join('\n');
}

const goalFields = {
  title: { type: 'string' },
  practice: { type: 'string' },
  criterion: { type: 'string' },
  hint: { type: 'string' },
  example: { type: 'string' },
};

export const planSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    opening: { type: 'string' },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: goalFields,
        required: Object.keys(goalFields),
      },
    },
  },
  required: ['title', 'opening', 'goals'],
};

function textField(value: unknown, limit: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw new Error('Lesson plan contains invalid text.');
  }
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function readLessonPlan(output: string, level: LevelId): LessonPlan {
  const plan = JSON.parse(output);
  if (!Array.isArray(plan?.goals) || plan.goals.length !== levels[level].count) {
    throw new Error('Lesson plan contains the wrong number of speaking goals.');
  }
  const opening = textField(plan.opening, 250);
  const title = textField(plan.title, 80);
  const seenTitles = new Set<string>();
  const goals = plan.goals.map((goal: Record<string, unknown> | null, index: number): LessonGoal => {
    const title = textField(goal?.title, 80);
    const practice = textField(goal?.practice, 200);
    const criterion = textField(goal?.criterion, 360);
    const hint = textField(goal?.hint, 180);
    const example = textField(goal?.example, 180);
    const normalizedTitle = title.toLowerCase();
    if (seenTitles.has(normalizedTitle) || !/\p{Script=Hangul}/u.test(example)) {
      throw new Error('Lesson plan needs distinct goals with Korean examples.');
    }
    seenTitles.add(normalizedTitle);
    return { id: `goal-${index + 1}` as GoalId, title, practice, criterion, hint, example };
  });
  return { title, opening, goals };
}
