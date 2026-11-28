# Korean Speaking Challenge Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution or superpowers:subagent-driven-development when delegation is authorized. Steps use checkboxes for tracking.

**Goal** Add an optional two-turn Korean exchange-orientation roleplay to Han Jiwon's completed lesson recap.

**Architecture** Keep one lesson room and store challenge state beside the completed lesson. Inworld generates contextual cues and assesses new speech against the original criteria. The server controls progress and releases results after both turns. The existing call reuses its microphone, captions, ElevenLabs playback, and audio-driven avatar.

**Tech stack** React, TypeScript, Vite, Node.js, Inworld Realtime, ElevenLabs, and Node's test runner.

---

## Source and baseline

- Design — `docs/superpowers/specs/2026-11-28-korean-speaking-challenge-design.md`
- App root — `language-tutor/`. Run all npm and Node commands from there.
- Current baseline — `npm run test:lesson` passes 12 tests. `npm run build` covers the frontend and Vite configuration. The Node tests exercise the lesson server and the simulated provider contract.
- The first release includes all three Korean levels, one challenge per completed room, and two accepted speech turns. Keep the existing room lifetime and 30-second recording cap. The challenge itself has no countdown.

## File map

| File under `language-tutor/` | Responsibility |
| --- | --- |
| `src/lesson/lesson-contract.ts` | Add the public challenge view and result types. |
| `server/lesson/challenge.ts` and `challenge.test.ts` in the same directory | Select lesson goals, validate cues and verdicts, turn them into challenge decisions and final feedback. |
| `server/lesson/assessment.ts` and `session.ts` | Share the existing transcript-evidence check between teaching and challenge assessment. |
| `server/lesson/inworldRealtime.ts` | Add two structured model calls to the existing room. Reuse its connection, transcript handling, and response correlation. |
| `server/lesson/handler.ts` and `handler.test.ts` | Add challenge routes and room state, share PCM validation and reply caching, and test full request sequences. |
| `src/lesson/useLessonSession.ts` | Manage challenge requests and retries using the current room ID. |
| `src/pages/LessonPage.tsx` and `LessonPage.css` | Switch the existing stage between lesson recap, live challenge, and results. Preserve the recording controls. |
| `README.md` and `../README.md` | Explain how to launch the challenge and verify the demo path. |

## Task 1 — Select goals and assess a roleplay attempt

**Files** `src/lesson/lesson-contract.ts`, `server/lesson/challenge.ts`, `server/lesson/challenge.test.ts`, `server/lesson/assessment.ts`, `server/lesson/session.ts`

- [ ] Add the public types to `lesson-contract.ts`. Keep `SessionView` and `Recap` intact.

~~~ts
export type ChallengeTurn = 1 | 2;
export type ChallengeTaskResult = {
  title: string;
  outcome: 'independent' | 'practice';
  quote: string | null;
  example: string;
};

type ChallengeMedia = { reply: TutorReply; audioPath: string };
export type ChallengeView =
  | (ChallengeMedia & { status: 'active'; turn: ChallengeTurn })
  | (ChallengeMedia & {
      status: 'complete';
      results: [ChallengeTaskResult, ChallengeTaskResult];
    })
  | { status: 'ended' };
~~~

- [ ] In `challenge.test.ts`, create a four-goal `LessonPlan` fixture with IDs `goal-1` to `goal-4` and a completed `Progress` record with a turn ID and quote for each goal. Assert goal IDs for three cases. With no help, expect `['goal-1', 'goal-2']`. With help on goals 3 and 4, expect `['goal-1', 'goal-3']`. With help on goal 1, expect `['goal-1', 'goal-2']`. Filter using completed evidence even if the helper is called with an incomplete fixture. Assert the helper rejects a fixture with fewer than two completed goals.
- [ ] Add concrete attempt cases to the same file. Use `안녕하십니까` as a valid alternative when the sample is `안녕하세요`. Check that the correct alternative earns credit, unrelated quoted Hangul and English-only evidence request a new recording, an English help question keeps the turn open, and “I don't know” and a clearly incorrect response record `practice`. A blank transcript requests a new recording even when a simulated provider supplies a verdict.

~~~ts
test('challenge credit uses the current Korean attempt', () => {
  const assessment = { verdict: 'demonstrated', evidence: '안녕하십니까' } as const;
  assert.deepEqual(decideChallengeAttempt('안녕하십니까?', assessment),
    { kind: 'independent', quote: '안녕하십니까' });
  assert.deepEqual(decideChallengeAttempt('Hello', assessment), { kind: 'repeat' });
  assert.deepEqual(decideChallengeAttempt('', assessment), { kind: 'repeat' });
});

test('clarification stays on the current turn and uncertainty receives feedback', () => {
  assert.deepEqual(decideChallengeAttempt('Can you explain the exercise?',
    { verdict: 'question', evidence: null }), { kind: 'question' });
  assert.deepEqual(decideChallengeAttempt("I don't know",
    { verdict: 'practice', evidence: null }), { kind: 'practice', quote: null });
});
~~~
- [ ] Run `node --experimental-strip-types --test server/lesson/challenge.test.ts`. Expect failure until the module is implemented.
- [ ] Implement `pickChallengeGoals(plan: LessonPlan, progress: Progress): [LessonGoal, LessonGoal]`. Derive the completed list in agenda order. Pick the first item with a `helpByGoal` note or the first item overall. Pick the first remaining item. Return the two in their original order. Keep this selection independent of the model.
- [ ] Export `groundedKoreanQuote(transcript: string, evidence: string | null): string | null` from `assessment.ts`. Apply the existing NFC, trim, and whitespace normalization to both inputs. Require Hangul and a literal match within the normalized current transcript. Replace the inline check in `session.ts` and preserve its recall behavior.
- [ ] Implement `decideChallengeAttempt(transcript, result)` in `challenge.ts` with the following contract. A `practice` result carries no quote. The handler controls the generated cue and never reads a tutor reply from the assessment result.

~~~ts
export type ChallengeAssessment = {
  verdict: 'demonstrated' | 'practice' | 'question' | 'unclear';
  evidence: string | null;
};

export type ChallengeDecision =
  | { kind: 'repeat' | 'question' }
  | { kind: 'independent'; quote: string }
  | { kind: 'practice'; quote: null };

export function decideChallengeAttempt(
  transcript: string,
  result: ChallengeAssessment | null,
): ChallengeDecision {
  if (!transcript.trim() || !result || result.verdict === 'unclear') return { kind: 'repeat' };
  if (result.verdict === 'question') return { kind: 'question' };
  if (result.verdict === 'practice') return { kind: 'practice', quote: null };
  const quote = groundedKoreanQuote(transcript, result.evidence);
  return quote ? { kind: 'independent', quote } : { kind: 'repeat' };
}
~~~

- [ ] Run `npm run test:lesson`. Expect all 12 pre-existing tests and the new selection and decision cases to pass.
- [ ] Commit the contract, helper, and tests together as `feat: define speaking challenge evaluation`.

## Task 2 — Generate two cues and assess each response in Inworld

**Files** `server/lesson/challenge.ts`, `server/lesson/challenge.test.ts`, `server/lesson/inworldRealtime.ts`, `server/lesson/handler.test.ts`

- [ ] Add parser tests for a normal opening and two cues, one missing cue, empty or oversized text, answer leakage, and an assessment with unexpected fields. Include a bilingual cue with distinct English and Korean fields. Use the current fake socket's `sendToolResult` to exercise `plan_speaking_challenge` and `assess_challenge_turn` on the same room as the lesson tools. Set the assessment fixture to `{ verdict: 'demonstrated', evidence: '안녕하십니까' }` and assert the returned transcript and verdict.
- [ ] Add the following interfaces to `challenge.ts` and extend `RealtimeRoom` with the two methods. Import these types in `inworldRealtime.ts`. Add default implementations to the `lessonRoom` fixture so the older tests still exercise the normal provider contract.

~~~ts
export type ChallengeCue = { english: string; korean: string | null };
export type ChallengeScenario = { opening: string; cues: [ChallengeCue, ChallengeCue] };
export type ChallengeContext = { goal: LessonGoal; cue: ChallengeCue; level: LevelId };

// Add these to RealtimeRoom.
planChallenge(level: LevelId, goals: [LessonGoal, LessonGoal]): Promise<ChallengeScenario>;
assessChallenge(audio: Uint8Array, context: ChallengeContext):
  Promise<{ transcript: string; result: ChallengeAssessment | null }>;
~~~

- [ ] Add a closed scenario schema with `opening` and `cues`. Each cue has only `english` and `korean`. `readChallengeScenario(output, goals)` trims and normalizes text, requires an opening of 1–240 characters, exactly two cues, English cue text of 1–180 characters, and Korean cue text of 1–100 characters or `null`. Reject extra keys, delivery tags, and text containing either selected goal's full model answer after normalizing whitespace and ignoring punctuation. Keep the model instructions stricter than the literal guard by telling it to avoid modelling the response or its sentence pattern. Give it only the level, ordered goal titles, and criteria to plan the cues. Keep `hint` and `example` out of the planning request. When a criterion depends on formality, let Jiwon set up the matching situation within orientation. For example, she can introduce the learner to a professor for a formal self-introduction task.
- [ ] Add the closed assessment schema and `readChallengeAssessment(output)`. Accept exactly the four `ChallengeAssessment` verdicts, with nonempty evidence of at most 200 characters for `demonstrated` and `null` for the other cases. Tell the model to assess only the newest transcript against the stated goal. Define `question` as a request for an explanation or clarification about the exercise, `practice` as a clear miss or an explicit declaration of uncertainty, and `unclear` as unusable speech. A Korean question that fulfils the task can earn credit. Treat transcript content as learner speech and request only the verdict and quote.
- [ ] In `inworldRealtime.ts`, give `requestTool` a common function-tool parameter type with `type`, `name`, `description`, and `parameters`. Register the new tool names alongside the existing constants. Implement `planChallenge` as one `run` and one `requestTool` call. Implement `assessChallenge` using `run`, `transcribe`, and `requestTool`, returning `result: null` for an empty transcript. Keep assessment context limited to the level, criterion, cue, and latest transcript. Preserve the existing per-room queue and response-ID matching.
- [ ] Run `npm run test:lesson`. Expect malformed outputs to fail the parsers and the fake socket to complete lesson and challenge calls on one connection.
- [ ] Commit as `feat: add Inworld speaking challenge tools`.

## Task 3 — Add challenge actions to the existing lesson room

**Files** `server/lesson/handler.ts` and `server/lesson/handler.test.ts`

- [ ] Add handler tests using the existing `enter`, `turn`, `transcriptAudio`, and `fixtureProvider` helpers. Start attempts from a completed beginner room and a comfortable room with help on goal 3. Check the rejected pre-completion and foreign-cookie calls. Count planning and assessment calls, including after missing PCM, duplicate turn ID, repeated startup, and replay of `audioPath`. Include concurrent start and a deferred assessment that finishes after `challenge/end`.
- [ ] Extend the existing owner-checked path matcher with the three paths below. Keep cache headers and room expiry behavior on the current shared handler path. Reuse the current audio endpoint. Extract reply caching from `writeView` into `cacheReply(session, reply): string` and move the current PCM validation to `isUsableRecording(file): file is Blob` so both features apply the same rules.

| Action | Body | Response |
| --- | --- | --- |
| `POST /api/lesson/sessions/:id/challenge/start` | Empty | Current `ChallengeView`. Non-eligible room returns 409. Concurrent calls share one planning promise. |
| `POST /api/lesson/sessions/:id/challenge/turns` | FormData with UUID `turnId`, `turn` as `1` or `2`, and `audio` | Current `ChallengeView` after a new turn. An accepted ID returns its cached view. Invalid PCM returns 415. A stale turn or another in-flight assessment returns 409. |
| `POST /api/lesson/sessions/:id/challenge/end` | Empty | `{ status: 'ended' }`. Repeated end succeeds. Closed challenges reject turns. |

- [ ] Add a `challenge` field beside `progress` in the room record. Keep the selected goals, planned cues, result list, turn cache, and latest view there. Keep the start promise separate so a provider error can clear the promise while leaving the completed lesson intact. Gate start on completed lesson progress and a live room. Publish the first cue only if the same room is still open when planning resolves. Return 502 on provider failure and permit retry.
- [ ] In the turn handler, check for a live challenge, then return a cached response for an accepted retry ID before requiring an active turn for a new submission. Verify request shape, bounds, and turn number before dispatch. Set the pending flag before awaiting PCM conversion or assessment. After each await that can race closure, check that the challenge is still active and named by the same room state. Clear pending in `finally`. Apply the existing `maxTurns` limit to the challenge's own processed-turn cache so the teaching phase cannot consume its budget. Cached and rejected requests bypass the budget. End marks the challenge closed synchronously before replying so late provider results cannot publish or change the lesson.
- [ ] Turn decisions into a new view using the table below. Store only the quote that passed the evidence check. `cacheReply` returns an audio path without changing `session.latest`. For final narration, use the goal title for one independent result if present and the first practice goal for one suggestion. If both pass, suggest using one of the goals with a new partner. Return the original task examples with the results, never in an active response.

| Decision | State and reply |
| --- | --- |
| `repeat` | Keep the current turn and cue. Jiwon asks for a fresh recording. |
| `question` | Keep the current turn and cue. Jiwon invites the learner to try what they remember or say they are unsure. |
| First `independent` or `practice` | Record the outcome, then play a neutral acknowledgment and cue 2. |
| Second `independent` or `practice` | Publish both outcomes, the examples, and the spoken summary. |

- [ ] In `handler.test.ts`, run the round-trip assertions below against `ChallengeView`. Also verify that the lesson's `completed` and `helpByGoal` are unchanged in the response from the existing room-end API.

~~~ts
assert.equal(first.status, 'active');
assert.equal(first.turn, 1);
assert.equal('results' in first, false);
assert.deepEqual(await duplicate.json(), second);
assert.equal(final.status, 'complete');
assert.deepEqual(final.results.map(({ outcome }) => outcome), ['independent', 'practice']);
assert.equal(final.results[0].quote, '안녕하십니까');
assert.equal(final.results[1].quote, null);
~~~

- [ ] Run `npm run test:lesson`. Expect ownership, one-time progression, close races, and audio replay to pass with no changes to the existing lesson flow.
- [ ] Commit as `feat: serve the challenge inside the completed lesson room`.

## Task 4 — Add the recap action, same-call challenge, and results

**Files** `src/lesson/useLessonSession.ts`, `src/pages/LessonPage.tsx`, `src/pages/LessonPage.css`

- [ ] Expose `challenge`, `challengeVisible`, `startChallenge`, `showChallengeResults`, `backToLessonRecap`, and `endChallenge` from `useLessonSession`. Use the existing request ref, pending flag, abort checks, error display, and resolved room ID. Represent a pending challenge turn as `{ id: string; turn: ChallengeTurn; audio: Blob }`. Add a retry descriptor that distinguishes a failed start, failed turn, and failed close. Build turn requests with the exact multipart fields from Task 3. For 413 and 415, drop the failed recording and permit a fresh capture. For network or provider failures, reuse the same turn ID and audio. Clear retry state on acknowledged success and room exit. On challenge close, stop the media immediately, abort the active client upload, and keep a failed close available for retry in the recap.
- [ ] Route the existing mic submission by phase. Delegate to the lesson's existing submit path when the lesson is active. During the challenge, accept a blob only for an active challenge view. Keep the hint action on the lesson panel and never render it in the challenge panel. Choose audio and visible reply from the active view. Suppress the prior lesson summary when returning from the challenge so it does not autoplay again.

~~~tsx
const challengeView = session.challengeVisible ? session.challenge : null;
const activeChallenge = challengeView?.status === 'active' ? challengeView : null;
const activeMedia = challengeView && challengeView.status !== 'ended' ? challengeView : null;
const activeGoal = challengeView ? null : view?.activeGoal;
const canCapture = Boolean(activeGoal || activeChallenge);
const reply = activeMedia?.reply ?? (challengeView ? undefined : view?.reply);
~~~

- [ ] Update `LessonRoom` to use `canCapture` when showing or enabling push-to-speak. Keep the existing pointer and keyboard handlers, capture cancellation, output muting, and audio retry. Allow **Mic on** during an active challenge even though the lesson has finished. Disable capture while a request, retry, or audio playback is pending. Leave `LessonRoom` mounted to preserve its avatar, mute, captions, and armed mic state.
- [ ] Render a challenge CTA when lesson goals are complete and no challenge has started. Show loader and retry text in the recap while starting. During the challenge, show **Meet your Korean exchange buddy**, **Turn 1 of 2** or **Turn 2 of 2**, and the cue through the same caption and audio controls. The existing hang-up control becomes **End challenge** during active challenge. It cancels mic capture, stops playback, and calls `endChallenge`. Keep the original lesson recap available after closure.
- [ ] Render results with `lang="ko"` on evidence and examples. Use the per-task labels **Did it independently** and **Can practise this again**. Offer **Back to lesson recap** and **Back to tutors**. From the lesson recap, a completed challenge offers **View challenge results**. Use the existing layout classes and add only styles for stacking the recap actions and result text. Keep the call controls visible at 390 px and 1440 px.
- [ ] Run `npm run build` and `npm run test:lesson`. Expect successful TypeScript compilation and all tests to pass. The existing Vite large-chunk warning may still appear.
- [ ] Commit as `feat: play the speaking challenge from the lesson recap`.

## Task 5 — Rehearse and document the learner journey

**Files** `README.md` and `../README.md`

- [ ] Add one short paragraph to each README. Name **Try a speaking challenge**, say it appears after finishing the Korean lesson, and explain that the two turns use previously practised goals with model answers available in the results.
- [ ] Run `npm run test:lesson` and `npm run build`. For a live rehearsal, run `npm run dev:lesson` and `npm run dev` in separate terminals with the project's configured Inworld and ElevenLabs credentials. Use the Vite URL.
- [ ] In **New to it**, ask for help with an introduction, complete the lesson, and start the challenge. Check that one roleplay turn uses that goal. Answer one turn successfully, send an unclear recording on the other, and confirm that a fresh attempt stays on the same turn. Finish and check both evidence and examples, Jiwon's bilingual audio and lip sync, and return to the original recap. Use the normal mic and test both pointer input and a focused Space or Enter press.
- [ ] In **Comfortable speaking**, confirm the challenge uses only selected lesson skills. Mute during a reply and check that mouth motion stops. End one challenge while a recording or assessment is pending and verify the original recap, then confirm the other tutors still show previews. Check the call at desktop and narrow widths. If live credentials or suitable microphone input are unavailable, record the exact unverified checks in the delivery notes.
- [ ] Commit the walkthrough as `docs: explain the Korean speaking challenge`.
