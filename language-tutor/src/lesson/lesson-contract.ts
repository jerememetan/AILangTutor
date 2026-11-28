export const koreanTutorId = 'vita';
export const levelIds = ['beginner', 'basic', 'comfortable'] as const;
export type LevelId = (typeof levelIds)[number];

export type GoalId = `goal-${number}`;
export type AgendaGoal = { id: GoalId; title: string; practice: string };
export type LessonAgenda = { title: string; goals: readonly AgendaGoal[] };
export const maxRecordingMs = 30_000;
export const pcmSampleRate = 24_000;
export const pcmAudioType = 'application/x-verba-pcm';
export const minPcmBytes = pcmSampleRate * 2 / 10;
export const maxPcmBytes = pcmSampleRate * 2 * maxRecordingMs / 1000;

export type TutorReply = { english: string; korean: string | null; prompt: string };
export type ChatMessage =
  | { id: string; speaker: 'tutor'; reply: TutorReply }
  | { id: string; speaker: 'learner'; text: string; kind: 'speech' | 'hint' };
export type GoalEvidence = { goal: GoalId; turnId: string; quote: string };
export type Recap = {
  completed: GoalEvidence[];
  helpByGoal: Partial<Record<GoalId, string>>;
};

export type SessionView = Recap & {
  agenda: LessonAgenda;
  activeGoal: GoalId | null;
  discussing?: boolean;
  reply: TutorReply;
  audioPath: string;
  messages: ChatMessage[];
  transcript?: string | null;
};

export type OpenLesson = { sessionId: string; view: SessionView };

export type ChallengeTurn = 1 | 2;
export type ChallengeTaskResult = {
  title: string;
  outcome: 'independent' | 'practice';
  quote: string | null;
  example: string;
};

type ChallengeMedia = { reply: TutorReply; audioPath: string; messages: ChatMessage[]; transcript?: string | null };
export type ChallengeView =
  | (ChallengeMedia & { status: 'active'; turn: ChallengeTurn; canSkip?: boolean })
  | (ChallengeMedia & { status: 'complete'; results: [ChallengeTaskResult, ChallengeTaskResult] })
  | { status: 'ended' };
