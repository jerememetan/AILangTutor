import { pcmSampleRate } from '../../src/lesson/lesson-contract.ts';
import type { TutorReply } from '../../src/lesson/lesson-contract.ts';
import { tutorSpeechParts } from '../../src/lesson/tutor-speech.ts';

export type SpokenReply = TutorReply & { delivery: 'warmly' | 'gently' | 'encouraging' };
export type TutorVoice = (
  reply: SpokenReply, emit: (chunk: Uint8Array) => void, signal: AbortSignal,
) => Promise<void>;

function speechText(reply: SpokenReply) {
  return tutorSpeechParts(reply).map(({ kind, text }, index) => {
    const delivery = index === 0 ? `[${reply.delivery}] `
      : kind === 'prompt' && reply.delivery !== 'encouraging' ? '[encouraging] ' : '';
    return delivery + text;
  }).join(' ');
}

export function createElevenLabsVoice(env: NodeJS.ProcessEnv, fetcher = fetch): TutorVoice | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId) return null;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_${pcmSampleRate}`;
  return async (reply, emit, signal) => {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: speechText(reply), model_id: 'eleven_v4' }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`ElevenLabs could not start tutor audio (${response.status}).`);
    }

    const reader = response.body.getReader();
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value.byteLength) continue;
        bytes += value.byteLength;
        emit(value);
      }
      if (!bytes || bytes % 2 !== 0) throw new Error('ElevenLabs returned incomplete tutor audio.');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
}
