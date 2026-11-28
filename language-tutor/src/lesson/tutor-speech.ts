import type { TutorReply } from './lesson-contract.ts';

export function tutorSpeechParts(reply: TutorReply) {
  return (['english', 'korean', 'prompt'] as const).flatMap((kind) => {
    const text = reply[kind]?.trim();
    return text ? [{ kind, text }] : [];
  });
}

export function tutorSpeechText(reply: TutorReply) {
  return tutorSpeechParts(reply).map(({ text }) => text).join(' ');
}
