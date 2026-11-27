import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PickerRotationControl from '../components/PickerRotationControl';
import TutorAvatar from '../components/TutorAvatar';
import { tutorBackdrops } from '../data/tutorBackdrops';
import { tutors } from '../data/tutors';
import '../components/TutorStage.css';
import './TutorSelectButton.css';
import './TutorPickerPage.css';

const revealDuration = 260;

export default function TutorPickerPage() {
  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState<{ id?: string; previousId?: string }>({});
  const visibleTutorId = preview.id;
  const stageRef = useRef<HTMLDivElement>(null);
  const pickerRotation = useRef(0);
  const switchInProgress = useRef(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const showPreview = useCallback((id: string) => {
    setPreview((current) => (id === current.id ? current : { id, previousId: current.id }));
  }, []);
  const index = Math.max(
    0,
    tutors.findIndex((tutor) => tutor.id === params.get('tutor')),
  );
  const tutor = tutors[index];
  const previous = tutors[(index + tutors.length - 1) % tutors.length];
  const next = tutors[(index + 1) % tutors.length];
  const busy = isSwitching || visibleTutorId !== tutor.id;
  const switchTutor = useCallback((id: string) => {
    if (busy || switchInProgress.current) return;
    switchInProgress.current = true;
    setIsSwitching(true);
    setParams({ tutor: id }, { replace: true });
  }, [busy, setParams]);
  const visibleTutor = tutors.find((candidate) => candidate.id === visibleTutorId) ?? tutor;
  const backdrop = tutorBackdrops[visibleTutor.id];
  const previousBackdrop = preview.previousId ? tutorBackdrops[preview.previousId] : undefined;
  const preloadSources = useMemo(
    () => [next.modelPath, previous.modelPath].filter((src): src is string => Boolean(src)),
    [next, previous],
  );

  useLayoutEffect(() => {
    if (visibleTutorId !== tutor.id) return;
    const unlock = () => {
      switchInProgress.current = false;
      setIsSwitching(false);
    };
    if (!preview.previousId || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      unlock();
      return;
    }
    // Animate the existing canvas wrapper so the renderer and its cache survive every switch.
    const motion = stageRef.current?.animate?.(
      [{ opacity: 0.78, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: revealDuration, easing: 'ease-out' },
    );
    const timer = window.setTimeout(unlock, revealDuration);
    return () => {
      window.clearTimeout(timer);
      motion?.cancel();
    };
  }, [preview.previousId, tutor.id, visibleTutorId]);

  useEffect(() => {
    if (visibleTutorId !== tutor.id) return;
    for (const id of [next.id, previous.id]) {
      const neighbor = tutorBackdrops[id];
      if (neighbor) {
        const image = new Image();
        image.fetchPriority = 'low';
        image.src = neighbor;
      }
    }
  }, [next.id, previous.id, tutor.id, visibleTutorId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (!event.repeat) switchTutor(event.key === 'ArrowLeft' ? previous.id : next.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next.id, previous.id, switchTutor]);

  return (
    <main className={`tutor-showcase showcase-${visibleTutor.tone}`} aria-label="Choose your tutor">
      {previousBackdrop && <img className="showcase-backdrop" src={previousBackdrop} alt="" />}
      {backdrop && (
        <img
          key={backdrop}
          className={previousBackdrop ? 'showcase-backdrop showcase-backdrop-enter' : 'showcase-backdrop'}
          src={backdrop}
          alt=""
        />
      )}
      <div ref={stageRef} className="showcase-stage">
        <div className="showcase-floor" aria-hidden="true" />
        <div className="showcase-model" aria-hidden="true">
          <TutorAvatar
            tutor={tutor}
            showcase
            preloadSources={preloadSources}
            onPreviewReady={showPreview}
            pickerRotation={pickerRotation}
          />
        </div>
        <PickerRotationControl key={visibleTutor.id} rotation={pickerRotation} disabled={busy} />
      </div>
      <div className="showcase-loading" role="status">
        {visibleTutorId !== tutor.id && `Loading ${tutor.name}…`}
      </div>

      <button
        className="showcase-switch showcase-previous tutor-picker-glow"
        onClick={() => switchTutor(previous.id)}
        aria-disabled={busy}
        aria-label={`Previous tutor: ${previous.name}`}
      >
        <ChevronLeft />
      </button>
      <button
        className="showcase-switch showcase-next tutor-picker-glow"
        onClick={() => switchTutor(next.id)}
        aria-disabled={busy}
        aria-label={`Next tutor: ${next.name}`}
      >
        <ChevronRight />
      </button>

      <div className="showcase-footer">
        <h1 aria-live="polite" aria-atomic="true">
          {visibleTutor.name} <span>— {visibleTutor.language}</span>
        </h1>
        <Link className="showcase-select tutor-picker-glow" to={`/tutors/${visibleTutor.id}/level`}>
          Choose tutor
        </Link>
      </div>
    </main>
  );
}
