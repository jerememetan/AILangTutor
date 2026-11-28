# Verba

Verba is a speaking-first language tutor built for an AI voice hackathon. Pick a tutor, choose your level, and practise in a one-on-one call with a 3D avatar. The idea grew out of wanting to practise Korean before an exchange in Korea.

## Tutor picker demo

![Verba’s tutor picker switching between Han Jiwon and Victoria Navarro](docs/media/verba-tutor-picker.gif)

[Watch the full video](docs/media/verba-tutor-picker.mp4)

## What you can try

The playable lesson is a first meeting in Korean with Han Jiwon. Each call generates a new speaking agenda. **New to it** starts with two short goals, **Know a little** gets three conversational goals, and **Comfortable speaking** gets four more challenging goals.

Hold **Push to speak**, then release to send. Answer the current goal in Korean or ask Jiwon about a phrase, politeness, or learning Hangul. You can ask follow-ups, select **Resume speaking goal** when you're ready, and keep talking after the goals are done. A goal checks off when your answer demonstrates it. Four other tutors are available to preview in the character picker.

After you demonstrate the lesson goals, select **Try a speaking challenge** from the recap. Meet Jiwon as an exchange buddy and use two skills you just practised. You can retry a missed prompt or skip it and review it in the results. The results show which skills you demonstrated and give an example for each.

## Run locally

Use Node.js 22.20 or newer. From the repository root, run the following in PowerShell.

```powershell
cd language-tutor
npm ci
if (-not (Test-Path .env.lesson.local)) { Copy-Item .env.example .env.lesson.local }
```

Fill in `INWORLD_API_KEY`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID` in `language-tutor/.env.lesson.local`. Use the voice ID for **Anna Kim · Tender, Calm and Clear**. The [app README](language-tutor/README.md#run-the-lesson-locally) shows where to find it. From `language-tutor/`, run `npm run dev:lesson` and `npm run dev` in separate terminals.

Open the URL printed by Vite and choose **Han Jiwon → New to it → Start lesson**. Turn on the mic and allow browser access. If playback is blocked, select **Play tutor audio**.

## How it works

React, TypeScript, and Vite run the app. Three.js renders the VRM tutor and animates her mouth from the audio the browser plays. A Node.js server uses Inworld Realtime for transcription, lesson planning, and assessment. ElevenLabs streams Jiwon’s replies with delivery cues for greetings, hints, and encouragement.

From `language-tutor/`, run `npm run test:lesson` for the lesson tests with simulated provider responses and `npm run build` for the TypeScript check and production bundle.

See the [app README](language-tutor/README.md) for the demo walkthrough and the [avatar notes](language-tutor/public/avatars/README.md) for model setup.
