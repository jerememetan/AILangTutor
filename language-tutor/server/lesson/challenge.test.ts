import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideChallengeAttempt, pickChallengeGoals, readChallengeAssessment, readChallengeScenario,
} from './challenge.ts';
import { readLessonPlan } from './lessonPlan.ts';
import type { Progress } from './session.ts';

const plan = readLessonPlan(JSON.stringify({
  title: 'A first meeting',
  opening: 'Hi there!',
  goals: [
    ['Greet someone', '안녕하세요'],
    ['Say your name', '저는 지원이에요'],
    ['Say where you are from', '저는 싱가포르에서 왔어요'],
    ['Ask a follow-up', '무슨 음악을 좋아하세요?'],
  ].map(([title, example]) => ({ title, example, practice: 'Try the phrase.', hint: 'Think of the situation.', criterion: title })),
}), 'comfortable');

const progress: Progress = {
  completed: plan.goals.map(({ id, example }) => ({ goal: id, turnId: id, quote: example })),
  helpByGoal: {},
  recallRequired: false,
};

const scenario = {
  opening: 'You just arrived at orientation.',
  cues: [
    { english: 'Greet your new exchange buddy.', korean: null },
    { english: 'Now tell me your name.', korean: '이름이 뭐예요?' },
  ],
};

test('chooses two completed goals in order and prioritizes the earliest one that needed help', () => {
  const ids = (state: Progress) => pickChallengeGoals(plan, state).map(({ id }) => id);
  assert.deepEqual(ids(progress), ['goal-1', 'goal-2']);
  assert.deepEqual(ids({ ...progress, helpByGoal: { 'goal-3': 'Asked for help', 'goal-4': 'Had a hint' } }),
    ['goal-1', 'goal-3']);
  assert.deepEqual(ids({ ...progress, completed: progress.completed.slice(1) }), ['goal-2', 'goal-3']);
  assert.throws(() => ids({ ...progress, completed: progress.completed.slice(0, 1) }));
});

test('accepts a new Korean phrasing only if the evidence is in the current recording transcript', () => {
  const assessment = { verdict: 'demonstrated', evidence: '안녕하십니까' } as const;
  assert.deepEqual(decideChallengeAttempt('안녕하십니까?', assessment),
    { kind: 'result', outcome: 'independent', quote: '안녕하십니까' });
  assert.deepEqual(decideChallengeAttempt('Hello', assessment), { kind: 'repeat' });
  assert.deepEqual(decideChallengeAttempt('Hello', { ...assessment, evidence: 'Hello' }), { kind: 'repeat' });
  assert.deepEqual(decideChallengeAttempt('', assessment), { kind: 'repeat' });
  assert.deepEqual(decideChallengeAttempt('Can you explain?', { verdict: 'question', evidence: null }), { kind: 'question' });
  assert.deepEqual(decideChallengeAttempt("I don't know", { verdict: 'practice', evidence: null }),
    { kind: 'result', outcome: 'practice', quote: null });
});

test('rejects malformed challenge cues and examples leaked to the active view', () => {
  const goals = pickChallengeGoals(plan, progress);
  const parse = (value: unknown) => readChallengeScenario(JSON.stringify(value), goals);
  assert.deepEqual(parse(scenario), scenario);
  assert.throws(() => parse({ ...scenario, cues: [scenario.cues[0]] }));
  assert.throws(() => parse({ ...scenario, opening: '  ' }));
  assert.throws(() => parse({ ...scenario, opening: 'x'.repeat(241) }));
  assert.throws(() => parse({ ...scenario, opening: '[gently] Welcome to orientation.' }));
  assert.throws(() => parse({ ...scenario, opening: 'Try saying 안녕 하세요!' }), /reveals/);
  assert.throws(() => parse({ ...scenario, opening: '저는 지원이에요.' }), /reveals/);
  assert.throws(() => parse({ ...scenario, cues: [scenario.cues[0], { english: 'Ask me.', korean: 'Hello.' }] }));
});

test('challenge assessment output carries a verdict and evidence with no coaching fields', () => {
  const parse = (value: unknown) => readChallengeAssessment(JSON.stringify(value));
  const result = { verdict: 'demonstrated', evidence: '안녕하십니까' };
  assert.deepEqual(parse(result), result);
  assert.throws(() => parse({ ...result, reply: 'Good job' }));
  assert.throws(() => parse({ ...result, evidence: '   ' }));
  assert.throws(() => parse({ ...result, verdict: 'question' }));
  assert.deepEqual(parse({ verdict: 'unclear', evidence: null }), { verdict: 'unclear', evidence: null });
});
