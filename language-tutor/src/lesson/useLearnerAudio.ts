import { useCallback, useEffect, useRef, useState } from 'react';
import { maxPcmBytes, maxRecordingMs, minPcmBytes } from './lesson-contract';
import { capturePcm } from './capturePcm';

const stopTracks = (stream?: MediaStream) => stream?.getTracks().forEach((track) => track.stop());
const enableTracks = (stream: MediaStream | undefined, active: boolean) =>
  stream?.getAudioTracks().forEach((track) => { track.enabled = active; });
const constraints = { audio: { echoCancellation: true, noiseSuppression: true }, video: false };

type Take = { timer?: number; finishing?: boolean };
type Microphone = {
  context: AudioContext;
  stream?: MediaStream;
  recorder?: Awaited<ReturnType<typeof capturePcm>>;
  take?: Take;
};

export function useLearnerAudio(submit: (blob: Blob) => void) {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'permission' | 'starting' | 'recording' | 'finishing'>('idle');
  const [error, setError] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const mic = useRef<Microphone | null>(null);
  const onSubmit = useRef(submit);

  useEffect(() => { onSubmit.current = submit; }, [submit]);

  const finish = useCallback((cancel = false) => {
    const device = mic.current;
    const take = device?.take;
    const recorder = device?.recorder;
    if (!device || !take || !recorder || (take.finishing && !cancel)) return;
    if (cancel || take.timer === undefined) {
      device.take = undefined;
      recorder.cancel();
      enableTracks(device.stream, false);
      window.clearTimeout(take.timer);
      setInputLevel(0);
      setStatus('idle');
      if (!cancel) setError('The microphone was still opening. Hold until Recording appears, then speak.');
      return;
    }

    take.finishing = true;
    window.clearTimeout(take.timer);
    setInputLevel(0);
    setStatus('finishing');
    const clip = recorder.finish();
    enableTracks(device.stream, false);
    void clip.then((blob) => {
      if (device.take !== take) return;
      device.take = undefined;
      setStatus('idle');
      if (blob.size < minPcmBytes || blob.size > maxPcmBytes) {
        setError('That recording was too short. Hold while speaking, then release to send.');
        return;
      }
      onSubmit.current(blob);
    }, () => {
      if (device.take !== take) return;
      device.take = undefined;
      setStatus('idle');
      setError('Recording could not finish. Hold the button to try again.');
    });
  }, []);

  const cancelHold = useCallback(() => {
    if (!mic.current?.take?.finishing) finish(true);
  }, [finish]);

  const cancel = useCallback(() => {
    const device = mic.current;
    if (device) {
      finish(true);
      mic.current = null;
      device.recorder?.dispose();
      stopTracks(device.stream);
      void device.context.close().catch(() => {});
    }
    setArmed(false);
    setInputLevel(0);
    setStatus('idle');
  }, [finish]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) cancelHold(); };
    window.addEventListener('blur', cancelHold);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', cancelHold);
      document.removeEventListener('visibilitychange', onVisibility);
      cancel();
    };
  }, [cancel, cancelHold]);

  async function toggle() {
    setError('');
    if (mic.current) {
      cancel();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' ||
      typeof AudioWorkletNode === 'undefined' || typeof OfflineAudioContext === 'undefined') {
      setError('Audio recording is unavailable here. Open the lesson in a supported browser on localhost or HTTPS.');
      return;
    }

    let device: Microphone | undefined;
    try {
      device = { context: new AudioContext() };
      const opened = device;
      mic.current = opened;
      setStatus('permission');
      const resumed = opened.context.resume().then(() => true, () => false);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      enableTracks(stream, false);
      if (mic.current !== opened) {
        stopTracks(stream);
        return;
      }
      opened.stream = stream;
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
        if (mic.current !== opened) return;
        cancel();
        setError('The microphone was disconnected. Reconnect it and turn the mic on again.');
      }, { once: true }));
      const recorder = await capturePcm(opened.context, stream, (peak) => {
        if (mic.current === opened && opened.take && !opened.take.finishing) setInputLevel(peak);
      });
      if (mic.current !== opened) {
        recorder.dispose();
        return;
      }
      opened.recorder = recorder;
      if (!await resumed) throw new Error('Microphone audio context did not start.');
      if (mic.current !== opened) return;
      setArmed(true);
      setStatus('idle');
    } catch (reason) {
      if (device && mic.current !== device) return;
      cancel();
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError';
      setError(denied
        ? 'Allow microphone access in your browser, then turn the mic on again.'
        : 'The microphone could not start. Check your input device, then turn the mic on again.');
    }
  }

  async function start() {
    const device = mic.current;
    const recorder = device?.recorder;
    if (!device || !recorder || device.take) return;
    setError('');
    const take: Take = {};
    device.take = take;
    try {
      if (device.context.state !== 'running') {
        setStatus('starting');
        await device.context.resume();
      }
      if (device.take !== take) return;
      recorder.start();
      enableTracks(device.stream, true);
      take.timer = window.setTimeout(() => finish(), maxRecordingMs);
      setStatus('recording');
    } catch {
      if (device.take !== take) return;
      finish(true);
      setError('Recording could not start. Turn the mic off and back on to try again.');
    }
  }

  return { armed, status, error, inputLevel, toggle, start, finish, cancel, cancelHold };
}
