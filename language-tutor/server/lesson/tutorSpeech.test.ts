import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tutorSpeechText } from '../../src/lesson/tutor-speech.ts';
import { koreanReadingTokens } from '../../src/lesson/korean-reading.ts';
import { createElevenLabsVoice } from './elevenLabsVoice.ts';
import type { SpokenReply } from './elevenLabsVoice.ts';

test('captions and voice use the same English, Korean and prompt sequence without speaking the reading guide', async () => {
  const reply: SpokenReply = {
    delivery: 'gently', english: 'Try this greeting.', korean: '안녕하세요.', prompt: 'Now you try.',
  };
  let spoken = '';
  const voice = createElevenLabsVoice({ ELEVENLABS_API_KEY: 'test', ELEVENLABS_VOICE_ID: 'test' }, async (_url, init) => {
    spoken = JSON.parse(String(init?.body)).text;
    return new Response(new Uint8Array([1, 2]));
  })!;
  await voice(reply, () => {}, new AbortController().signal);
  assert.equal(tutorSpeechText(reply), 'Try this greeting. 안녕하세요. Now you try.');
  assert.equal(spoken.replace(/\[(?:gently|encouraging)\] /gu, ''), tutorSpeechText(reply));
  assert.doesNotMatch(spoken, /annyeonghaseyo/);
});

test('Korean reading annotations preserve mixed language speech, punctuation and word spacing', () => {
  const text = 'Say “안녕하세요”, then ask: 커피 두 잔 주세요.';
  const tokens = koreanReadingTokens(text);
  assert.equal(tokens.map(({ text }) => text).join(''), text);
  assert.deepEqual(tokens.filter(({ romanization }) => romanization).map(({ romanization }) => romanization), [
    'annyeonghaseyo', 'keopi', 'du', 'jan', 'juseyo',
  ]);
  assert.equal(koreanReadingTokens('감사합니다')[0].romanization, 'gamsahamnida');
  assert.equal(koreanReadingTokens('한국어')[0].romanization, 'hangugeo');
  assert.deepEqual(koreanReadingTokens('Welcome!'), [{ text: 'Welcome!', romanization: null }]);
});

test('reference audio captions contain only the Korean reference, including composed Hangul readings', () => {
  const reply = { english: '', korean: '커피 두 잔 주세요.', prompt: '' };
  assert.equal(tutorSpeechText(reply), reply.korean);
  assert.equal(tutorSpeechText({ english: '  Welcome. ', korean: null, prompt: '' }), 'Welcome.');
  assert.equal(koreanReadingTokens('안녕하세요'.normalize('NFD'))[0].romanization, 'annyeonghaseyo');
});
