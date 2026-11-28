import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyChatHistory, updateChatHistory } from '../../src/lesson/chatHistory.ts';
import type { ChatMessage } from '../../src/lesson/lesson-contract.ts';

const opening = {
  audioPath: '/audio/opening',
  reply: { english: 'Welcome.', korean: null, prompt: 'Try a greeting.' },
};
const answer = {
  audioPath: '/audio/answer',
  reply: { english: 'Good greeting.', korean: null, prompt: 'Now tell me your name.' },
  transcript: '  안녕하세요  ',
};

test('reconstructs missing lesson history from the opening, speech, and tutor replies', () => {
  const started = updateChatHistory(emptyChatHistory, opening);
  const answered = updateChatHistory(started, answer);
  assert.deepEqual(answered.messages, [
    { id: '/audio/opening/tutor', speaker: 'tutor', reply: opening.reply },
    { id: '/audio/answer/learner', speaker: 'learner', text: '안녕하세요', kind: 'speech' },
    { id: '/audio/answer/tutor', speaker: 'tutor', reply: answer.reply },
  ]);
  assert.equal(started.messages.length, 1);
  assert.equal(updateChatHistory(answered, answer), answered);

  const silent = updateChatHistory(answered, { ...answer, audioPath: '/audio/silence', transcript: '  ' });
  assert.deepEqual(silent.messages.slice(answered.messages.length), [
    { id: '/audio/silence/tutor', speaker: 'tutor', reply: answer.reply },
  ]);
  assert.equal(updateChatHistory(silent, answer), silent);
});

test('uses the full server history when available and avoids duplicating its latest reply', () => {
  const messages: ChatMessage[] = [{ id: 'server-opening', speaker: 'tutor', reply: opening.reply }];
  const started = updateChatHistory(emptyChatHistory, { ...opening, messages });
  assert.deepEqual(started.messages, messages);
  assert.equal(updateChatHistory(started, opening), started);

  const hint = updateChatHistory(started, { ...answer, messages: null, transcript: undefined }, true);
  assert.deepEqual(hint.messages.slice(1), [
    { id: '/audio/answer/learner', speaker: 'learner', text: 'Asked for a hint', kind: 'hint' },
    { id: '/audio/answer/tutor', speaker: 'tutor', reply: answer.reply },
  ]);
  const snapshot = updateChatHistory(hint, { ...opening, messages });
  assert.deepEqual(snapshot.messages, messages);
});
