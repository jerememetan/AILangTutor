import { useCallback, useEffect, useRef, useState } from 'react';
import { maxPcmBytes, maxRecordingMs, minPcmBytes } from './lesson-contract';
import { capturePcm } from './capturePcm';

const stopTracks = (stream?: MediaStream) => stream?.getTracks().forEach((track) => track.stop());
const constraints = { audio: { echoCancellation: true, noiseSuppression: true }, video: false };

type Capture = {
  stream?: MediaStream;
  context?: AudioContext;
  stop?: () => void;
  timer?: number;
  finishing?: boolean;
};

export function useLearnerAudio(submit: (blob: Blob) => void) {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'permission' | 'starting' | 'recording' | 'finishing'>('idle');
  const [error, setError] = useState('');
  const enabled = useRef(false);
  const permission = useRef<AbortController | null>(null);
  const capture = useRef<Capture | null>(null);

  const finish = useCallback((cancel = false) => {
    const turn = capture.current;
    if (!turn || (turn.finishing && !cancel)) return;
    window.clearTimeout(turn.timer);
    if (cancel || !turn.stop) {
      capture.current = null;
      stopTracks(turn.stream);
      if (turn.context) void turn.context.close().catch(() => {});
      setStatus('idle');
      return;
    }
    turn.finishing = true;
    setStatus('finishing');
    turn.stop();
  }, []);

  const cancel = useCallback(() => {
    permission.current?.abort();
    permission.current = null;
    enabled.current = false;
    finish(true);
    setArmed(false);
    setStatus('idle');
  }, [finish]);

  useEffect(() => {
    const cancelOnBlur = () => finish(true);
    const onVisibility = () => { if (document.hidden) cancelOnBlur(); };
    window.addEventListener('blur', cancelOnBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', cancelOnBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      cancel();
    };
  }, [cancel, finish]);

  async function toggle() {
    setError('');
    if (enabled.current || permission.current) {
      cancel();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' ||
      typeof AudioWorkletNode === 'undefined' || typeof OfflineAudioContext === 'undefined') {
      setError('Audio recording is unavailable here. Open the lesson in a supported browser on localhost or HTTPS.');
      return;
    }
    const request = new AbortController();
    permission.current = request;
    setStatus('permission');
    try {
      stopTracks(await navigator.mediaDevices.getUserMedia(constraints));
      if (request.signal.aborted) return;
      enabled.current = true;
      setArmed(true);
    } catch {
      if (!request.signal.aborted) setError('Allow microphone access in your browser, then turn the mic on again.');
    } finally {
      if (permission.current === request) {
        permission.current = null;
        setStatus('idle');
      }
    }
  }

  async function start() {
    if (!enabled.current || capture.current) return;
    setError('');
    const turn: Capture = {};
    capture.current = turn;
    setStatus('starting');
    try {
      const context = new AudioContext();
      turn.context = context;
      void context.resume().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (capture.current !== turn) {
        stopTracks(stream);
        return;
      }
      turn.stream = stream;
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
        if (capture.current !== turn) return;
        finish(true);
        setError('The microphone was disconnected. Reconnect it and try again.');
      }, { once: true }));
      const complete = (blob: Blob) => {
        if (capture.current !== turn) return;
        capture.current = null;
        stopTracks(stream);
        void context.close().catch(() => {});
        setStatus('idle');
        if (blob.size < minPcmBytes || blob.size > maxPcmBytes) {
          setError('That recording could not be used. Hold to try again.');
          return;
        }
        submit(blob);
      };

      const finishPcm = await capturePcm(context, stream);
      if (capture.current !== turn) return;
      turn.stop = () => {
        const pending = finishPcm();
        stopTracks(stream);
        void pending.then(complete, () => {
          if (capture.current !== turn) return;
          finish(true);
          setError('That recording could not be used. Hold to try again.');
        });
      };
      setStatus('recording');
      turn.timer = window.setTimeout(() => finish(), maxRecordingMs);
    } catch {
      if (capture.current !== turn) return;
      finish(true);
      setError('Recording could not start. Check the microphone and hold to try again.');
    }
  }

  return { armed, status, error, toggle, start, finish, cancel };
}
