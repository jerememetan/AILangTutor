import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import TutorAvatar from '../components/TutorAvatar';
import { getLevel } from '../data/levels';
import type { Tutor } from '../data/tutors';

const curriculum = [
  { title: 'Warm up: greetings', duration: '2 min' },
  { title: 'Say your name', duration: '4 min' },
  { title: 'Ask your tutor a question', duration: '3 min' },
  { title: 'Review & speaking challenge', duration: '3 min' },
];

export default function LessonPage() {
  const tutor = useOutletContext<Tutor>();
  const [searchParams] = useSearchParams();
  const level = getLevel(searchParams.get('level'));
  const navigate = useNavigate();
  const [muted, setMuted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  return (
    <main className="call-page">
      <div className="call-heading">
        <Link className="back-button" to={`/tutors/${tutor.id}/level?level=${level.id}`}>
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="call-title">
          <span className="call-live-dot" /> Speaking with {tutor.name}
          <span className="call-language">
            {tutor.flag} {tutor.language}
          </span>
        </div>
        <button className="icon-button" aria-label="Lesson settings">
          <Settings2 size={18} />
        </button>
      </div>

      <div className="call-layout">
        <section className="video-call">
          <div className="video-stage">
            <div className="stage-room-glow" />
            <div className="stage-top-label">
              <span className="online-dot" /> {tutor.name} <span>•</span> Your tutor
            </div>
            <TutorAvatar tutor={tutor} large />
            <div className="subtitle-card">
              <div className="subtitle-label">{tutor.name} is speaking</div>
              <p>안녕하세요! 이름이 뭐예요?</p>
              <small>Hello! What’s your name?</small>
            </div>
            <div className="learner-self-view">
              <div className="self-avatar">J</div>
              <span>You</span>
            </div>
            <div className="call-controls">
              <button
                className={`control-button ${micOn ? 'control-active' : ''}`}
                onClick={() => setMicOn(!micOn)}
                aria-label={micOn ? 'Mute microphone' : 'Turn on microphone'}
              >
                {micOn ? <Mic size={19} /> : <MicOff size={19} />}
                <small>{micOn ? 'Mic on' : 'Mic off'}</small>
              </button>
              <button
                className="control-button"
                onClick={() => setMuted(!muted)}
                aria-label={muted ? 'Turn sound on' : 'Mute sound'}
              >
                {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                <small>{muted ? 'Sound off' : 'Sound'}</small>
              </button>
              <button className="control-button" aria-label="Captions">
                <BookOpen size={19} />
                <small>Captions</small>
              </button>
              <button className="control-button" aria-label="More options">
                <MoreHorizontal size={19} />
                <small>More</small>
              </button>
              <button
                className="end-call-button"
                onClick={() => navigate('/')}
                aria-label="End call"
              >
                <PhoneOff size={19} />
                <small>End lesson</small>
              </button>
            </div>
          </div>
          <div className="call-footer">
            <span>
              <span className="secure-dot" /> Private practice room
            </span>
            <span>
              Lesson 01 <b>·</b> Introductions
            </span>
          </div>
        </section>

        <aside className="lesson-sidebar">
          <div className="sidebar-title-row">
            <div>
              <div className="eyebrow">TODAY'S LESSON</div>
              <h2>Introduce yourself</h2>
            </div>
            <button className="more-menu" aria-label="More lesson options">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="lesson-progress">
            <div className="progress-copy">
              <span>Lesson progress</span>
              <b>
                {activeStep} of {curriculum.length}
              </b>
            </div>
            <div className="progress-track">
              <span style={{ width: `${Math.round((activeStep / curriculum.length) * 100)}%` }} />
            </div>
          </div>
          <div className="agenda-heading">
            YOUR PLAN <span>~12 MIN</span>
          </div>
          <div className="agenda-list">
            {curriculum.map((item, index) => {
              const complete = index < activeStep - 1;
              const current = index === activeStep - 1;
              return (
                <button
                  key={item.title}
                  className={`agenda-item ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}
                  onClick={() => setActiveStep(index + 1)}
                >
                  <span className="agenda-marker">
                    {complete ? (
                      <Check size={13} />
                    ) : current ? (
                      <Play size={11} fill="currentColor" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </span>
                  <span className="agenda-text">
                    <b>{item.title}</b>
                    <small>{item.duration}</small>
                  </span>
                  {current && <span className="now-label">NOW</span>}
                </button>
              );
            })}
          </div>
          <div className="tutor-prompt">
            <div className="prompt-top">
              <Sparkles size={14} /> YOUR SPEAKING GOAL
            </div>
            <p>Say your name in Korean, then ask your tutor for theirs.</p>
            <button className="hint-button">
              <CircleHelp size={15} /> Need a hint?
            </button>
          </div>
          <div className="sidebar-bottom">
            <div className="mini-avatar">{tutor.flag}</div>
            <div>
              <b>{tutor.name}</b>
              <small>Adapting to your {level.title.toLowerCase()} level</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </aside>
      </div>

      <div className="lesson-toast">
        <RotateCcw size={14} />
        <span>Your tutor will let you try first, then give a hint if you need one.</span>
        <button onClick={() => setActiveStep(Math.min(activeStep + 1, curriculum.length))}>
          Next step <ArrowRight size={13} />
        </button>
      </div>
    </main>
  );
}
