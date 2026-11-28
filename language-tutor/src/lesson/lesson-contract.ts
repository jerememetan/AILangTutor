export const koreanTutorId = 'vita';
export const levelIds = ['beginner', 'basic', 'comfortable'] as const;
export type LevelId = (typeof levelIds)[number];

export const goals = {
  greet: { title: 'Greet Jiwon in Korean', practice: 'Try greeting Jiwon politely.' },
  'introduce-name': { title: 'Say your name in Korean', practice: 'Try introducing yourself by name.' },
  'ask-name': { title: 'Ask Jiwon’s name in Korean', practice: 'Try asking Jiwon for her name.' },
} as const;

export type GoalId = keyof typeof goals;
export const goalIds: readonly GoalId[] = ['greet', 'introduce-name', 'ask-name'];
export const maxRecordingMs = 30_000;
export const maxAudioBytes = 2_000_000;

export type TutorReply = { english: string; korean: string | null; prompt: string };
export type GoalEvidence = { goal: GoalId; turnId: string; quote: string };
export type Recap = {
  completed: GoalEvidence[];
  helpByGoal: Partial<Record<GoalId, string>>;
};

export type SessionView = Recap & {
  activeGoal: GoalId | null;
  reply: TutorReply;
  audioPath: string;
};

export type OpenLesson = { sessionId: string; view: SessionView };
