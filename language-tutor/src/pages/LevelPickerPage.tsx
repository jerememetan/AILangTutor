import { useCallback, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import PickerRotationControl from '../components/PickerRotationControl';
import TutorAvatar from '../components/TutorAvatar';
import { getLevel, levels } from '../data/levels';
import { tutorBackdrops } from '../data/tutorBackdrops';
import type { Tutor } from '../data/tutors';
import '../components/TutorStage.css';
import './TutorSelectButton.css';
import './LevelPickerPage.css';

export default function LevelPickerPage() {
  const tutor = useOutletContext<Tutor>();
  const [searchParams, setSearchParams] = useSearchParams();
  const level = getLevel(searchParams.get('level'));
  const backdrop = tutorBackdrops[tutor.id];
  const rotation = useRef(0);
  const [previewReady, setPreviewReady] = useState(false);
  const markPreviewReady = useCallback(() => setPreviewReady(true), []);

  return (
    <main className={`level-stage-page showcase-${tutor.tone}`}>
      {backdrop && <img className="showcase-backdrop" src={backdrop} alt="" />}
      <Link className="level-back" to={`/?tutor=${tutor.id}`}>
        <ArrowLeft size={17} aria-hidden="true" /> All tutors
      </Link>

      <div className="level-stage-layout">
        <div className="level-stage">
          <div className="level-avatar">
            <div className="showcase-floor" aria-hidden="true" />
            <div className="showcase-model" aria-hidden="true">
              <TutorAvatar
                tutor={tutor}
                showcase
                pickerRotation={rotation}
                onPreviewReady={markPreviewReady}
              />
            </div>
            <PickerRotationControl rotation={rotation} disabled={!previewReady} showHint />
          </div>
          <p className="level-tutor-name">
            {tutor.name} <span>— {tutor.language}</span>
          </p>
        </div>

        <section className="level-panel" aria-labelledby="level-heading">
          <h1 id="level-heading">Choose your level</h1>
          <p className="level-question" id="level-question">
            How comfortable are you speaking {tutor.language}?
          </p>

          <fieldset className="level-choices" aria-labelledby="level-question">
            {levels.map((option) => (
              <label className="level-choice" key={option.id}>
                <input
                  type="radio"
                  name="tutor-level"
                  value={option.id}
                  checked={level.id === option.id}
                  onChange={() => setSearchParams({ level: option.id }, { replace: true })}
                />
                <span className="level-choice-indicator" aria-hidden="true" />
                <span className="level-choice-text">
                  <strong>{option.title}</strong>
                  <span>{option.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Link
            className="level-start tutor-picker-glow"
            to={`/tutors/${tutor.id}/lesson?level=${level.id}`}
          >
            Start lesson <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
