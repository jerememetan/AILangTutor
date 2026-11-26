# Verba — speaking-first language tutor

An early browser prototype for a language-learning app built around live conversation with an animated tutor. The lesson room is designed like a video call and keeps a teach-style lesson plan visible beside the conversation.

## Start locally

```bash
npm install
npm run dev
```

## Current prototype

- Tutor selection cards for Korean, Spanish, Dutch, Japanese, and English.
- Level selection before a lesson.
- A video-call-style Korean lesson room with captions, call controls, a learner goal, and a step-by-step lesson agenda.
- Lesson checklist interaction to preview progress through the teaching plan.

The tutor characters are temporary animated placeholders. The Korean tutor stage is configured to load `/avatars/vita.vrm` when that licensed file is added under `public/avatars/`; no VRM assets are included yet. The starter renderer includes idle motion and a simple speaking mouth animation, but mouth movement is not synchronized to audio yet.

## Planned integration seams

- **OpenAI:** adaptive teaching loop, lesson planning, corrections, and learner progress.
- **Inworld:** tutor character orchestration, conversational state, and/or real-time speech components.
- **ElevenLabs:** tutor voice generation and streaming.
- **VRM runtime:** render the rigged tutor and drive facial/body animation from speech and tutor state.

Keep provider keys on a server-side API, never in `VITE_*` client variables. Check hackathon rules and each model's license before bundling or redistributing a VRM.
