/// <reference types="vite/client" />

import { maxRecordingMs, pcmAudioType, pcmSampleRate } from './lesson-contract';
import workletUrl from './lesson-pcm-worklet.js?url&no-inline';

export async function capturePcm(context: AudioContext, stream: MediaStream, onLevel: (peak: number) => void) {
  await context.audioWorklet.addModule(workletUrl);
  const source = context.createMediaStreamSource(stream);
  const recorder = new AudioWorkletNode(context, 'lesson-pcm', {
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { seconds: maxRecordingMs / 1000 },
  });
  // The worklet emits silence and uses a connected output so browsers keep processing it.
  source.connect(recorder).connect(context.destination);

  let take = 0;
  let delivery: { receive(samples: ArrayBuffer): void; cancel(): void } | undefined;
  recorder.port.onmessage = ({ data }: MessageEvent<{ take: number; peak?: number; samples?: ArrayBuffer }>) => {
    if (data.take !== take) return;
    if (data.peak !== undefined) onLevel(data.peak);
    else if (data.samples) delivery?.receive(data.samples);
  };
  let finished: Promise<Blob> | undefined;

  async function finish() {
    const samples = await new Promise<Float32Array<ArrayBuffer>>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        delivery = undefined;
        reject(new Error('Could not finish microphone recording.'));
      }, 1500);
      delivery = {
        receive(data) {
          delivery = undefined;
          window.clearTimeout(timeout);
          resolve(new Float32Array(data));
        },
        cancel() {
          delivery = undefined;
          window.clearTimeout(timeout);
          reject(new Error('Microphone recording cancelled.'));
        },
      };
      recorder.port.postMessage({ type: 'finish', take });
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
  }

  return {
    start() {
      finished = undefined;
      recorder.port.postMessage({ type: 'start', take: ++take });
    },
    finish() { return finished ??= finish(); },
    cancel() {
      delivery?.cancel();
      recorder.port.postMessage({ type: 'cancel', take });
    },
    dispose() {
      delivery?.cancel();
      source.disconnect();
      recorder.disconnect();
      recorder.port.close();
    },
  };
}
