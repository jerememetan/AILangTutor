import { useCallback, useEffect, useRef, useState } from 'react';
import { maxAudioBytes, maxRecordingMs } from './lesson-contract';

const mimeTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];
const stopTracks = (stream?: MediaStream) => stream?.getTracks().forEach((track) => track.stop());
const constraints = { audio: { echoCancellation: true, noiseSuppression: true }, video: false };

type Capture = {
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: number;
  cancelled?: boolean;
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
    if (!turn || (turn.recorder?.state === 'inactive' && !cancel)) return;
    window.clearTimeout(turn.timer);
    if (cancel || !turn.recorder) {
      turn.cancelled = true;
      capture.current = null;
      stopTracks(turn.stream);
      setStatus('idle');
    }
    if (turn.recorder?.state === 'recording') {
      if (!cancel) setStatus('finishing');
      turn.recorder.stop();
    }
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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
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
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (capture.current !== turn) {
        stopTracks(stream);
        return;
      }
      turn.stream = stream;
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Unsupported audio format');
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      const chunks: Blob[] = [];
      turn.recorder = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => {
        if (capture.current !== turn) return;
        finish(true);
        setError('The microphone was interrupted. Hold to try again.');
      };
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
        if (capture.current !== turn) return;
        finish(true);
        setError('The microphone was disconnected. Reconnect it and try again.');
      }, { once: true }));
      recorder.onstop = () => {
        stopTracks(stream);
        if (capture.current !== turn || turn.cancelled) return;
        capture.current = null;
        setStatus('idle');
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (!blob.size || blob.size > maxAudioBytes) {
          setError('That recording could not be used. Hold to try again.');
          return;
        }
        submit(blob);
      };
      recorder.start();
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
