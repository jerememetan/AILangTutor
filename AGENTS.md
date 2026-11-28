# Verba (AILangTutor)

Verba is a speaking-first language tutor for an AI voice hackathon. The original use case is practising Korean before an exchange in Korea. The product is for anyone learning a language. Prioritize one complete, playable Korean lesson with Han Jiwon before expanding the roster.

## Learner experience

Open on a full-screen character picker with one tutor on stage. Left and right controls cycle through the roster. Label the selected tutor with its character name, an em dash, and its language, exactly as listed below. The other four tutors can remain roster previews for the hackathon.

- Han Jiwon — Korean
- Victoria Navarro — Spanish
- Noor de Vries — Dutch
- Sakurada Ren — Japanese
- Jamie Bennett — English

After selecting Han Jiwon, the learner picks a level and enters a one-on-one call. Keep Jiwon visible as a live animated 3D character, with a short lesson agenda beside her. She listens during the learner's turn and speaks during hers. Drive her mouth from the audio the learner actually hears, including stopping when playback stops.

## First lesson · Introduce yourself

Generate a Korean first-meeting agenda when the learner starts the lesson. Use two short speaking goals for New to it, three familiar conversational goals for Know a little, and four more demanding goals for Comfortable speaking. The model writes observable goals, prompts, short hints, examples, and grading criteria. Keep the agenda stable for the call and adapt the coaching to the learner’s actual responses.

1. Ask for one thing and wait for a spoken attempt. Give the learner a chance to recall the phrase.
2. Assess what they said against the current goal. Accept valid alternative wording. Acknowledge what worked, identify one specific gap if needed, and offer the smallest useful hint.
3. After a hint or correction, invite a fresh attempt. Advance the agenda when the learner demonstrates the objective. A tutor example, a button click, or the passage of time is insufficient evidence.
4. Handle side questions in context. If the learner asks “How do I say that politely?”, answer briefly, then invite them to try the same goal again.
5. Close by recalling what the learner demonstrated and what needed help. Later, adapt `create-mock-exam` into a spoken challenge using the objectives practised and difficulties observed in this lesson.

Use Jereme's `teach` skill as the reference for turn-taking, feedback, retries, and evidence of mastery. Its local source is `C:\Users\Jereme\.codex\skills\teach\SKILL.md`. The shared skills are maintained in [learning-skills](https://github.com/jerememetan/learning-skills).

## Working in this repository

The React application and its package lock live in `language-tutor/`. Run npm commands there. Use `npm ci` for a fresh checkout, `npm run dev` for the local app, and `npm run build` to check TypeScript and the production bundle. The frontend uses React, TypeScript, Vite, plain CSS, Lucide React, Three.js, and `@pixiv/three-vrm`.

Run `npm run dev:lesson` from `language-tutor/` to start the lesson API. Verba uses Inworld Realtime for transcription, lesson planning, assessment and coaching with an OpenAI model, and streamed tutor audio. Verba validates the assessment against the learner’s transcript and owns lesson progress. Set `INWORLD_API_KEY` in the server environment or `language-tutor/.env.lesson.local`. Use `npm run test:lesson` to run the lesson tests.

## Prototype baseline

- The React Router pages are the full-body tutor picker at `/`, the level picker at `/tutors/:tutorId/level`, and the call at `/tutors/:tutorId/lesson`. The `level` query parameter carries the selected level into the lesson. Han Jiwon has the Korean lesson. Other tutors show a preview from the lesson route.
- The call frames Jiwon waist-up. Holding **Push to speak** captures one learner turn, and release submits it. The server evaluates the answer for the active goal against the criteria generated for that room and stores progress in memory. Jiwon can coach in English, speak Korean examples, and return to the same goal after a question. Demonstrating every goal produces a recap. Refresh starts a new room and generates an agenda.
- The home viewer caches the current VRM and preloads the next and previous tutors. The current tutor stays on stage until the requested model loads. An illustration is available when WebGL is unavailable. The call uses actual tutor-audio amplitude for mouth motion.
- The production build, provider contract tests, and simulated lesson flow have passed. The live microphone, bilingual provider output, and 3D framing still need a browser rehearsal with configured accounts.
