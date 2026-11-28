# Korean speaking challenge

## Goal

After completing **Introduce yourself** with Han Jiwon, the learner can use what they practised in a short roleplay at Korean exchange orientation. The challenge adapts Jereme's `create-mock-exam` approach by using the lesson as the source material, prioritizing a skill that needed help, and showing model answers after the learner has had a chance to respond.

## Learner experience

1. The completed lesson recap offers **Try a speaking challenge** beside **Back to tutors**. Ending a lesson before completing its speaking goals shows the regular recap. Starting a challenge is always optional.
2. The call stays open with Jiwon, the existing microphone and audio settings, and the push-to-speak control. Jiwon sets the scene as a fellow student at exchange orientation and gives the first cue. The challenge shows which of the two turns is active. It is designed to take about a minute and gives the learner time to think.
3. Each turn gives the learner one clear thing to say. Jiwon acknowledges the first response in character and gives the second cue. She saves corrections, example answers, and assessment results for the end. An English question about the exercise gets a brief instruction to try what they remember or say they are unsure. The turn stays open. A clear “I don't know” counts as an attempt the learner can review afterward.
4. After both attempts, the results show each task and whether the learner **Did it independently** or **Can practise this again**. Show a transcript excerpt when it supports a demonstrated result and a short example for each task. Jiwon speaks a brief summary that names one success if there is one and suggests one next step. **Back to lesson recap** and **Back to tutors** are available from the results.

For example, a beginner who asked for help saying their name could greet Jiwon at orientation and then answer when she asks their name. A learner at **Comfortable speaking** could give a personal detail or ask a follow-up question if their lesson covered those skills. In each case, the exchange is new and the assessed skills come from the completed lesson.

## Challenge planning and assessment

- Select two distinct completed goals from the server-owned lesson plan. Include the earliest goal that needed help if any did, then fill the second slot with the earliest remaining completed goal. Present the chosen goals in lesson order so the exchange builds from the simpler task. If no goal needed help, use the first two. All three levels have at least two goals.
- Ask the existing Inworld room to write a short opening and one in-character or English scene cue per selected goal, at the learner's chosen level. Supply the two goals in order. Keep the original goals, criteria, and examples on the server. The generated cues can change the situation and wording while preserving what each goal asks the learner to demonstrate. Validate the response shape, cue count, and text lengths before using it. A cue can establish the situation or ask a question but cannot include the selected goal's answer. Callouts and instructions stay short enough to work in audio.
- Assess each spoken answer against its selected goal's original criterion. Accept valid alternatives. Apply the existing check that evidence must contain Hangul and match the current transcript. A grounded assessment can demonstrate the goal. A clearly captured answer that misses the criterion, or an explicit admission of uncertainty, records a task to practise. Silence, unreadable speech, and a claimed quote that fails the evidence check lead to a re-record on the same turn. A genuine Korean question can demonstrate a goal that asks the learner to ask one.
- During the challenge, Jiwon's spoken replies come from the scenario cues and short neutral acknowledgments. The assessment response supplies the verdict and evidence for the server. The lesson's hint, model-answer, and recall rules remain available in the teaching flow.

## Session and recovery

- Keep challenge state in the same in-memory room under the existing browser ownership and expiry rules. Store the chosen goals, active challenge turn, accepted turn IDs, and challenge result separately from lesson progress. The lesson recap is read-only after completion. The browser receives the current cue and turn status, with examples and assessment results released only after both attempts.
- Add challenge start, turn, and end actions to the lesson API. Starting is available only for a completed, open room. A repeated start returns the existing challenge state without resetting it. Reuse the current PCM upload, Inworld transcription, ElevenLabs playback, captions, and lip sync. Use a separate assessment prompt for challenge turns. The server is responsible for choosing the next turn and verifying that a submission belongs to the active challenge turn.
- A failed start leaves the lesson recap available with a retry action. A network or provider error during submission offers a retry of the same recording and turn ID. Repeating a processed submission returns the acknowledged result. A playback failure offers audio retry without reassessment or a change to progress. A recording that cannot be assessed offers a fresh capture of the same turn.
- **End challenge** stops recording and playback and returns to the completed lesson recap. The server closes the challenge and discards any assessment that arrives after closure. The recap then omits the start action. After a completed challenge, returning to the lesson recap offers **View challenge results**. Leaving the call ends the room and discards challenge state on cleanup. The feature needs no account or persistent audio storage.

## Acceptance checks

| Scenario | Expected result |
| --- | --- |
| Complete a lesson at any level | The recap offers the challenge. Starting keeps the same call and opens a two-turn roleplay. |
| Complete a lesson after asking for help | The challenge includes a goal that needed help and uses the same criterion in a new situation. |
| Give a valid alternative Korean response | The result credits independent use and shows evidence from the current attempt. |
| Miss the criterion with clear speech or say “I don't know” | The roleplay can continue. The result identifies that goal as a practice opportunity and shows an example. |
| Send silence or unreadable speech, or receive invalid evidence | Jiwon asks for a fresh recording on the same turn. The challenge records no result for that attempt. |
| Retry after a failed request or repeat a submission | The challenge accepts a successful turn once. Audio retry plays the existing reply without regrading. |
| End the challenge or return to the recap | The completed lesson recap retains the original goals and evidence. An in-flight result cannot change a closed challenge. |

Use simulated provider tests for selection, assessment, retry, and recap isolation. In a live browser, verify the microphone, bilingual prompts, Jiwon's lip sync, and the full flow from a lesson hint to an independent roleplay response.
