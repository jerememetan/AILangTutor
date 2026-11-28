import type { ChatMessage, SessionView } from './lesson-contract';

type ChatHistory = { messages: ChatMessage[]; lastReplyPath: string | null };
type HistoryView = Pick<SessionView, 'audioPath' | 'reply' | 'transcript'> & {
  messages?: ChatMessage[] | null;
};

export const emptyChatHistory: ChatHistory = { messages: [], lastReplyPath: null };

export function updateChatHistory(history: ChatHistory, view: HistoryView, askedForHint = false): ChatHistory {
  const { audioPath, reply } = view;
  if (Array.isArray(view.messages)) {
    return { messages: view.messages, lastReplyPath: audioPath };
  }

  // Older lesson servers send the latest transcript and reply without a history snapshot.
  const tutorId = audioPath + '/tutor';
  if (history.lastReplyPath === audioPath || history.messages.some((message) => message.id === tutorId)) {
    return history;
  }
  const transcript = view.transcript?.trim();
  const messages = [...history.messages];
  if (askedForHint) {
    messages.push({ id: audioPath + '/learner', speaker: 'learner', text: 'Asked for a hint', kind: 'hint' });
  } else if (transcript) {
    messages.push({ id: audioPath + '/learner', speaker: 'learner', text: transcript, kind: 'speech' });
  }
  messages.push({ id: tutorId, speaker: 'tutor', reply });
  return { messages, lastReplyPath: audioPath };
}
