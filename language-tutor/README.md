# Verba

Verba is a speaking-first language tutor. The hackathon lesson pairs the learner with Han Jiwon for a Korean introduction in a waist-up avatar call. The roster includes four other tutor previews.

## Run the lesson locally

Use Node.js 22.20 or newer. Run these commands from `language-tutor/`.

```powershell
npm ci
if (-not (Test-Path .env.lesson.local)) { Copy-Item .env.example .env.lesson.local }
```

Fill in `.env.lesson.local` and start both processes in separate terminals.

```powershell
npm run dev:lesson
npm run dev
```

Open the Vite URL. Choose **Han Jiwon**, select **New to it**, and start the lesson. Turn on the mic, hold **Push to speak**, and release to send. You can also hold Space or Enter while the button has focus. If the browser blocks the first reply, select **Play tutor audio**.

For a local production build, run `npm run build` and open [http://127.0.0.1:8787](http://127.0.0.1:8787) with the lesson server running.

## Add the provider credentials

The example file lists the required variables. The server loads the local file and keeps keys out of the browser and Git.

| Provider | Variables | Role |
| --- | --- | --- |
| Inworld | `INWORLD_API_KEY` | Transcribes each submitted clip. Use the Base64 API credential for Inworld Basic authentication. |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_LESSON_MODEL` | Evaluates the transcript against the active goal and writes short English coaching with Korean examples. The default model is `gpt-4o-mini`. |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Speaks the English guidance and Korean phrases with a multilingual voice. Choose a voice you can preview in both languages. |

The implementation lives in `server/lesson/providers.ts`. `server/lesson/handler.ts` runs transcription, assessment, and progress updates in order. It caches accepted turns so a retry leaves progress consistent. The mouth animation follows the amplitude of actual tutor playback. The in-memory session lasts for one run and refresh starts a new lesson.

## Judge walkthrough

1. Open the beginner lesson and ask “How do I say hello politely?”
2. Hear Jiwon explain in English and say 안녕하세요. The goal stays at **0 of 3**.
3. Try the phrase. If Jiwon just modelled it, she asks you to repeat it from memory on the next prompt.
4. Introduce yourself with 제 이름은 제레미예요 and ask Jiwon’s name with 이름이 뭐예요? Use one turn for each goal.
5. Show the **3 of 3** recap and the goal where you asked for help.

`npm run test:lesson` exercises the session and provider request formats with simulated provider responses. `npm run build` checks TypeScript and the bundle. Before presenting, try the walkthrough in a browser with the real microphone and configured provider accounts.
