import { useCallback, useEffect, useRef, useState } from 'react';
import { pcmAudioType, pcmSampleRate } from './lesson-contract';

type Status = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';

export function useStreamingTutorAudio(path: string | undefined, sound: boolean) {
  const [state, setState] = useState<{ path: string; status: Status }>();
  const [attempt, setAttempt] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const player = useRef<{ play: () => void; dispose: () => void } | null>(null);
  const mouth = useRef(0);

  const stop = useCallback(() => {
    player.current?.dispose();
    player.current = null;
    mouth.current = 0;
  }, []);

  useEffect(() => () => {
    stop();
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.close().catch(() => {});
  }, [stop]);

  useEffect(() => {
    if (!path || !sound) return;
    const update = (status: Status) => setState({ path, status });
    let context: AudioContext;
    try {
      context = contextRef.current ??= new AudioContext();
    } catch {
      update('error');
      return;
    }

    const controller = new AbortController();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(context.destination);
    const samples = new Float32Array(analyser.fftSize);
    const sources = new Set<AudioBufferSourceNode>();
    let frame = 0;
    let nextStart = 0;
    let lastByte: number | undefined;
    let started = false;
    let finished = false;

    const animate = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const level = Math.sqrt(sum / samples.length);
      mouth.current += (Math.min(0.92, Math.max(0, level - 0.008) * 5) - mouth.current) * 0.52;
      frame = window.requestAnimationFrame(animate);
    };
    const silence = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      mouth.current = 0;
    };
    const dispose = () => {
      controller.abort();
      context.removeEventListener('statechange', begin);
      for (const source of sources) {
        source.onended = null;
        source.stop();
        source.disconnect();
      }
      sources.clear();
      analyser.disconnect();
      silence();
    };
    const settle = () => {
      if (sources.size || controller.signal.aborted) return;
      silence();
      if (finished) update('idle');
    };

    function queue(chunk: Uint8Array) {
      let bytes = chunk;
      if (lastByte !== undefined) {
        bytes = new Uint8Array(chunk.length + 1);
        bytes[0] = lastByte;
        bytes.set(chunk, 1);
      }
      lastByte = bytes.length % 2 ? bytes[bytes.length - 1] : undefined;
      const count = Math.floor(bytes.length / 2);
      if (!count) return;
      const data = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
      const buffer = context.createBuffer(1, count, pcmSampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < count; index++) channel[index] = data.getInt16(index * 2, true) / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
        settle();
      };
      if (nextStart <= context.currentTime) nextStart = context.currentTime + 0.045;
      source.start(nextStart);
      nextStart += buffer.duration;
      update('playing');
      if (!frame) animate();
    }

    async function streamAudio(url: string) {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || !response.body || response.headers.get('content-type') !== pcmAudioType) {
          throw new Error('Tutor voice unavailable.');
        }
        const reader = response.body.getReader();
        try {
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done || controller.signal.aborted) break;
            if (value.length) queue(value);
          }
        } finally {
          reader.releaseLock();
        }
        if (controller.signal.aborted) return;
        if (!nextStart || lastByte !== undefined) throw new Error('Tutor audio was incomplete.');
        finished = true;
        settle();
      } catch {
        if (controller.signal.aborted) return;
        dispose();
        update('error');
      }
    }

    function begin() {
      if (!path || started || controller.signal.aborted || context.state !== 'running') return;
      started = true;
      update('loading');
      void streamAudio(path);
    }
    const play = () => {
      if (context.state === 'running') begin();
      else void context.resume().then(begin).catch(() => {
        if (!controller.signal.aborted) update('blocked');
      });
    };
    context.addEventListener('statechange', begin);
    player.current = { play, dispose };
    if (context.state !== 'running') update('blocked');
    play();
    return stop;
  }, [path, sound, attempt, stop]);

  const status = !path || !sound ? 'idle' : state?.path === path ? state.status : 'loading';
  return {
    mouth, status, stop,
    play: () => {
      if (status === 'blocked') player.current?.play();
      else setAttempt((current) => current + 1);
    },
  };
}
