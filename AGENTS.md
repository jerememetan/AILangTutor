# Verba (AILangTutor)

Verba is a speaking-first language tutor for an AI voice hackathon. The original use case is practising Korean before an exchange in Korea. The product is for anyone learning a language. Prioritize one complete, playable Korean lesson with Vita before expanding the roster.

## Learner experience

Open on the character picker. Each card's only text should be its character name, an em dash, and its language, exactly as listed below. The other four tutors can remain roster previews for the hackathon.

- Vita — Korean
- Victoria Rubin — Spanish
- Sendagaya Shino — Dutch
- Sakurada Fumiriya — Japanese
- AvatarSample_B — English

After selecting Vita, the learner picks a level and enters a one-on-one call. Keep Vita visible as a live animated 3D character, with a short lesson agenda beside her. She listens during the learner's turn and speaks during hers. Drive her mouth from the audio the learner actually hears, including stopping when playback stops.

## First lesson · Introduce yourself

The learner should be able to greet Vita, say their name, and ask hers in Korean. Show those observable goals in the agenda. Use the selected level to choose the first prompt, then adapt to the learner's actual responses.

1. Ask for one thing and wait for a spoken attempt. Give the learner a chance to recall the phrase.
2. Assess what they said against the current goal. Accept valid alternative wording. Acknowledge what worked, identify one specific gap if needed, and offer the smallest useful hint.
3. After a hint or correction, invite a fresh attempt. Advance the agenda when the learner demonstrates the objective. A tutor example, a button click, or the passage of time is insufficient evidence.
4. Handle side questions in context. If the learner asks “How do I say that politely?”, answer briefly, then invite them to try the same goal again.
5. Close by recalling what the learner demonstrated and what needed help. Later, adapt `create-mock-exam` into a spoken challenge using the objectives practised and difficulties observed in this lesson.

Use Jereme's `teach` skill as the reference for turn-taking, feedback, retries, and evidence of mastery. Its local source is `C:\Users\Jereme\.codex\skills\teach\SKILL.md`. The shared skills are maintained in [learning-skills](https://github.com/jerememetan/learning-skills).

## Working in this repository

The React application and its package lock live in `language-tutor/`. Run npm commands there. Use `npm ci` for a fresh checkout, `npm run dev` for the local app, and `npm run build` to check TypeScript and the production bundle. The frontend uses React, TypeScript, Vite, plain CSS, Lucide React, Three.js, and `@pixiv/three-vrm`.

Inworld, ElevenLabs, and OpenAI are the intended providers. Their responsibilities are open. Keep provider credentials on the server and out of browser code and `VITE_*` variables.

## Prototype baseline · 2026-11-26

- `language-tutor/src/App.tsx` owns the picker, level selection, call controls, captions, and agenda. All five cards currently reach the same scripted room. The chosen level changes a label. The mic and sound controls toggle local UI state, and agenda clicks or **Next step** move the displayed progress.
- The captions and speaking goal are fixtures. **Need a hint?** has no handler. There is no microphone capture, voice connection, backend, database, or assessment of spoken attempts.
- `language-tutor/src/components/VrmAvatar.tsx` expects a licensed model at `language-tutor/public/avatars/vita.vrm`. The current checkout supplies an illustrated fallback. With a model present, the viewer supports idle motion and a time-driven mouth animation. Audio synchronization is still to build.

When reporting what works, distinguish the interactions tested in the running app from the target lesson above. Update the baseline as the demo becomes playable.
