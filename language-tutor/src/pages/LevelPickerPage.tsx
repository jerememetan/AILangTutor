import { Link, useSearchParams, useOutletContext } from 'react-router';
import { ArrowLeft, ArrowRight, CircleHelp } from 'lucide-react';
import TutorAvatar from '../components/TutorAvatar';
import { getLevel, levels } from '../data/levels';
import type { Tutor } from '../data/tutors';

export default function LevelPickerPage() {
  const tutor = useOutletContext<Tutor>();
  const [searchParams, setSearchParams] = useSearchParams();
  const level = getLevel(searchParams.get('level'));

  return (
    <main className="page level-page">
      <Link className="back-button" to="/">
        <ArrowLeft size={16} /> All tutors
      </Link>
      <div className="level-layout">
        <section className="level-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> LET'S PERSONALISE YOUR LESSON
          </div>
          <h1>
            Where are you
            <br />
            with {tutor.language}?
          </h1>
          <p className="page-subtitle">
            This helps {tutor.name} choose the right starting point. You can change it anytime.
          </p>
          <div className="level-options">
            {levels.map((option, index) => (
              <button
                key={option.id}
                className={`level-option ${level.id === option.id ? 'selected' : ''}`}
                aria-pressed={level.id === option.id}
                onClick={() => setSearchParams({ level: option.id }, { replace: true })}
              >
                <span className="level-index">0{index + 1}</span>
                <span className="level-copy-text">
                  <b>{option.title}</b>
                  <small>{option.detail}</small>
                </span>
                <span className="radio-dot">{level.id === option.id && <span />}</span>
              </button>
            ))}
          </div>
          <Link className="primary-button" to={`/tutors/${tutor.id}/lesson?level=${level.id}`}>
            Meet {tutor.name} <ArrowRight size={17} />
          </Link>
          <p className="privacy-note">
            <CircleHelp size={14} /> No test. Your tutor will adjust as you practise.
          </p>
        </section>
        <aside className="tutor-intro-card">
          <div className="intro-card-top">
            <span className="online-dot" /> YOUR TUTOR
          </div>
          <TutorAvatar tutor={tutor} large />
          <div className="intro-name">{tutor.name}</div>
          <div className="intro-language">
            {tutor.flag} &nbsp; {tutor.language}
          </div>
          <div className="intro-quote">“We’ll take it one conversation at a time.”</div>
        </aside>
      </div>
    </main>
  );
}
