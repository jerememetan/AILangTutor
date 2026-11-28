/// <reference types="vite/client" />

import { maxRecordingMs, pcmAudioType, pcmSampleRate } from './lesson-contract';
import workletUrl from './lesson-pcm-worklet.js?url&no-inline';

export async function capturePcm(context: AudioContext, stream: MediaStream) {
  await context.audioWorklet.addModule(workletUrl);
  if (context.state !== 'running') throw new Error('Microphone audio context is not running.');
  const source = context.createMediaStreamSource(stream);
  const recorder = new AudioWorkletNode(context, 'lesson-pcm', {
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { seconds: maxRecordingMs / 1000 },
  });
  // The worklet emits silence and uses a connected output so browsers keep processing it.
  source.connect(recorder).connect(context.destination);

  return async () => {
    source.disconnect();
    const samples = await new Promise<Float32Array<ArrayBuffer>>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Could not finish microphone recording.')), 1500);
      recorder.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        window.clearTimeout(timeout);
        recorder.port.close();
        resolve(new Float32Array(data));
      };
      recorder.port.postMessage('finish');
    });
    const count = Math.floor(samples.length * pcmSampleRate / context.sampleRate);
    if (!count) return new Blob([], { type: pcmAudioType });
    const resampler = new OfflineAudioContext(1, count, pcmSampleRate);
    const input = resampler.createBuffer(1, samples.length, context.sampleRate);
    input.copyToChannel(samples, 0);
    const clip = resampler.createBufferSource();
    clip.buffer = input;
    clip.connect(resampler.destination);
    clip.start();
    const rendered = (await resampler.startRendering()).getChannelData(0);
    const pcm = new DataView(new ArrayBuffer(rendered.length * 2));
    rendered.forEach((sample, index) => {
      const level = Math.max(-1, Math.min(1, sample));
      pcm.setInt16(index * 2, level * (level < 0 ? 32768 : 32767), true);
    });
    return new Blob([pcm.buffer], { type: pcmAudioType });
  };
}
