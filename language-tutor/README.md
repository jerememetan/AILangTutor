# Verba

Verba is a speaking-first language tutor. The hackathon lesson pairs the learner with Han Jiwon for a Korean introduction in a waist-up avatar call. The roster includes four other tutor previews.

## Run the lesson locally

Use Node.js 22.20 or newer. Run these commands from `language-tutor/`.

```powershell
npm ci
if (-not (Test-Path .env.lesson.local)) { Copy-Item .env.example .env.lesson.local }
```

Add your Inworld Base64 API key to `.env.lesson.local` and start both processes in separate terminals.

```powershell
npm run dev:lesson
npm run dev
```

Open the Vite URL. Choose **Han Jiwon**, select **New to it**, and start the lesson. Turn on the mic, hold **Push to speak**, and release to send. You can also hold Space or Enter while the button has focus. If the browser blocks the first reply, select **Play tutor audio**.

Each new room generates a speaking agenda about meeting someone in Korean. **New to it** gets two short speaking goals, **Know a little** gets three familiar conversational goals, and **Comfortable speaking** gets four more challenging goals. The model also writes the grading criteria and hints for each goal. The agenda is stable for the call so the progress and recap refer to the same goals.

For a local production build, run `npm run build` and open [http://127.0.0.1:8787](http://127.0.0.1:8787) with the lesson server running.

## Voice lessons

Verba runs every voice lesson through Inworld Realtime. The only required setting is `INWORLD_API_KEY` with Realtime access. The default model is `openai/gpt-6-luna`, routed through Inworld, and Jiwon’s default voice is Olivia. The server keeps the key out of the browser and Git.

Verba asks the model to generate and validate a speaking agenda at the start of the call. When you release the button, Verba uploads one clip. The lesson’s server-side WebSocket sends it to Inworld for transcription and asks the model to assess the active goal. Verba checks that evidence used for progress appears in the learner’s transcript. Inworld speaks the verified reply, and Jiwon’s mouth follows the audio as the browser plays it.

The server caches accepted turns so a retry leaves progress consistent. The in-memory session lasts for one run and refresh starts a new lesson.

## Judge walkthrough

1. Open **Comfortable speaking** to see its four goals, then go back and start **New to it** to see the simpler two-goal agenda.
2. Ask “How do I say hello politely?” Jiwon should explain in English and say 안녕하세요. The goal stays at **0 of 2**.
3. Try the phrase. If Jiwon just modelled it, she asks you to recall it on the next prompt.
4. Follow the generated introduction prompt. For example, say 제 이름은 제레미예요 if she asks for your name.
5. Show the **2 of 2** recap and the goal where you asked for help.

`npm run test:lesson` exercises the lesson flow with simulated Inworld responses. `npm run build` checks TypeScript and the bundle. Before presenting, try the walkthrough in a browser with the real microphone and a configured Inworld key.
