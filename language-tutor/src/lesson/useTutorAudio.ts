import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';

export function useTutorAudio(path: string | undefined, sound: boolean) {
  const [state, setState] = useState<{ path: string; status: Status }>();
  const [attempt, setAttempt] = useState(0);
  const player = useRef<{ play: () => void; dispose: () => void } | null>(null);
  const mouth = useRef(0);
  const stop = useCallback(() => {
    player.current?.dispose();
    player.current = null;
    mouth.current = 0;
  }, []);

  useEffect(() => {
    if (!path || !sound) return;
    const controller = new AbortController();
    let context: AudioContext | undefined;
    let audio: HTMLAudioElement | undefined;
    let objectUrl: string | undefined;
    let frame = 0;
    let playbackCheck = 0;
    const update = (status: Status) => {
      if (!controller.signal.aborted) setState({ path, status });
    };
    const dispose = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(playbackCheck);
      audio?.pause();
      if (context) void context.close().catch(() => {});
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mouth.current = 0;
    };
    update('loading');

    void (async () => {
      try {
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw new Error('Tutor voice unavailable');
        const bytes = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(bytes);
        const element = new Audio(objectUrl);
        audio = element;
        let analyser: AnalyserNode | undefined;
        let samples: Float32Array<ArrayBuffer> | undefined;
        if (typeof AudioContext !== 'undefined') {
          try {
            context = new AudioContext();
            analyser = context.createAnalyser();
            analyser.fftSize = 256;
            samples = new Float32Array(analyser.fftSize);
            context.createMediaElementSource(element).connect(analyser).connect(context.destination);
          } catch {
            analyser = undefined;
          }
        }
        const silence = () => {
          window.cancelAnimationFrame(frame);
          window.clearTimeout(playbackCheck);
          mouth.current = 0;
        };
        const animate = () => {
          if (!analyser || !samples || element.paused || element.ended || context?.state !== 'running') {
            mouth.current = 0;
          } else {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) sum += sample * sample;
            const level = Math.sqrt(sum / samples.length);
            mouth.current += (Math.min(0.92, Math.max(0, level - 0.008) * 5) - mouth.current) * 0.52;
          }
          frame = window.requestAnimationFrame(animate);
        };
        element.onplaying = () => {
          if (controller.signal.aborted) return;
          silence();
          update('playing');
          animate();
          // Some browsers allow media playback while the Web Audio output still needs a gesture.
          if (context?.state === 'suspended') {
            playbackCheck = window.setTimeout(() => {
              if (context?.state !== 'suspended' || controller.signal.aborted) return;
              element.pause();
              update('blocked');
            }, 150);
          }
        };
        element.onpause = silence;
        element.onwaiting = silence;
        element.onended = () => { silence(); update('idle'); };
        element.onerror = () => { silence(); update('error'); };
        const play = () => {
          if (context?.state === 'suspended') void context.resume().catch(() => {});
          void element.play().catch((error: DOMException) => {
            update(error.name === 'NotAllowedError' ? 'blocked' : 'error');
          });
        };
        player.current = { play, dispose };
        play();
      } catch {
        update('error');
      }
    })();
    return () => {
      dispose();
      player.current = null;
    };
  }, [path, sound, attempt]);

  const status = !path || !sound ? 'idle' : state?.path === path ? state.status : 'loading';
  return {
    mouth, status, stop,
    play: () => {
      if (status === 'blocked' && player.current) player.current.play();
      else setAttempt((current) => current + 1);
    },
  };
}
