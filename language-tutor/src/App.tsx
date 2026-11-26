import { useState } from 'react';
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
import VrmAvatar from './components/VrmAvatar';

type Tutor = {
  name: string;
  language: string;
  flag: string;
  tone: string;
  modelPath?: string;
};

type Screen = 'tutors' | 'level' | 'lesson';

const tutors: Tutor[] = [
  { name: 'Vita', language: 'Korean', flag: '\u{1F1F0}\u{1F1F7}', tone: 'rose', modelPath: '/avatars/vita.vrm' },
  { name: 'Victoria Rubin', language: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}', tone: 'amber' },
  { name: 'Sendagaya Shino', language: 'Dutch', flag: '\u{1F1F3}\u{1F1F1}', tone: 'blue' },
  { name: 'Sakurada Fumiriya', language: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}', tone: 'sage' },
  { name: 'AvatarSample_B', language: 'English', flag: '\u{1F1EC}\u{1F1E7}', tone: 'lilac' },
];

const curriculum = [
  { title: 'Warm up: greetings', duration: '2 min', done: true },
  { title: 'Say your name', duration: '4 min', done: false },
  { title: 'Ask your tutor a question', duration: '3 min', done: false },
  { title: 'Review & speaking challenge', duration: '3 min', done: false },
];

function AvatarPlaceholder({ tutor, large = false }: { tutor: Tutor; large?: boolean }) {
  return (
    <div className={`avatar-placeholder avatar-${tutor.tone} ${large ? 'avatar-large' : ''}`} aria-label={`${tutor.name} 3D avatar preview`}>
      <div className="avatar-halo" />
      {tutor.modelPath && <div className="avatar-head">
        <div className="avatar-hair" />
        <div className="avatar-face"><span className="eye eye-left" /><span className="eye eye-right" /><span className="smile" /></div>
        <div className="avatar-neck" /><div className="avatar-shoulders" />
      </div>}
      {tutor.modelPath ? <VrmAvatar src={tutor.modelPath} speaking={large} /> : <div className="avatar-head">
        <div className="avatar-hair" />
        <div className="avatar-face"><span className="eye eye-left" /><span className="eye eye-right" /><span className="smile" /></div>
        <div className="avatar-neck" /><div className="avatar-shoulders" />
      </div>}
      {large && <div className="avatar-live"><span /> LIVE TUTOR</div>}
    </div>
  );
}

function Header({ onLogo }: { onLogo: () => void }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onLogo} aria-label="Go to tutor selection">
        <span className="brand-mark">v.</span><span>verba</span>
      </button>
      <nav className="topnav" aria-label="Main navigation">
        <button className="nav-link active">My learning</button>
        <button className="nav-link">Explore</button>
        <button className="nav-link">Progress</button>
      </nav>
      <button className="profile-button" aria-label="Profile">J</button>
    </header>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>('tutors');
  const [selectedTutor, setSelectedTutor] = useState<Tutor>(tutors[0]);
  const [level, setLevel] = useState('New to it');
  const [muted, setMuted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const startTutor = (tutor: Tutor) => {
    setSelectedTutor(tutor);
    setScreen('level');
  };

  const startLesson = () => {
    setActiveStep(1);
    setScreen('lesson');
  };

  return (
    <div className="app-shell">
      <Header onLogo={() => setScreen('tutors')} />

      {screen === 'tutors' && (
        <main className="page tutors-page">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> LANGUAGE PRACTICE, OUT LOUD</div>
              <h1>Who would you like<br />to learn with?</h1>
              <p className="page-subtitle">Choose a tutor. Your first conversation is just a few minutes away.</p>
            </div>
            <div className="streak-card"><span className="streak-icon">✳</span><div><b>Ready when you are</b><small>Your next speaking session awaits</small></div><ArrowRight size={17} /></div>
          </div>

          <div className="section-heading">
            <div><h2>Choose your tutor</h2><p>Pick a language to begin</p></div>
            <button className="text-button">Browse all languages <ArrowRight size={15} /></button>
          </div>

          <div className="tutor-grid">
            {tutors.map((tutor, index) => (
              <button className={`tutor-card tutor-card-${tutor.tone}`} key={tutor.name} onClick={() => startTutor(tutor)}>
                <div className="card-topline"><span className="card-flag">{tutor.flag}</span><span className="card-arrow"><ArrowRight size={17} /></span></div>
                <AvatarPlaceholder tutor={tutor} />
                <span className="tutor-name">{tutor.name} <span className="dash">—</span> {tutor.language}</span>
                {index === 0 && <span className="recommended">START HERE</span>}
              </button>
            ))}
          </div>

          <div className="bottom-note"><Sparkles size={16} /><span>Real conversation, with a patient tutor who adapts to you.</span></div>
        </main>
      )}

      {screen === 'level' && (
        <main className="page level-page">
          <button className="back-button" onClick={() => setScreen('tutors')}><ArrowLeft size={16} /> All tutors</button>
          <div className="level-layout">
            <section className="level-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> LET'S PERSONALISE YOUR LESSON</div>
              <h1>Where are you<br />with {selectedTutor.language}?</h1>
              <p className="page-subtitle">This helps {selectedTutor.name} choose the right starting point. You can change it anytime.</p>
              <div className="level-options">
                {[
                  ['New to it', 'I’m starting from the basics'],
                  ['Know a little', 'I can use a few words and phrases'],
                  ['Comfortable speaking', 'I want to sound more natural'],
                ].map(([title, detail], index) => (
                  <button key={title} className={`level-option ${level === title ? 'selected' : ''}`} onClick={() => setLevel(title)}>
                    <span className="level-index">0{index + 1}</span><span className="level-copy-text"><b>{title}</b><small>{detail}</small></span><span className="radio-dot">{level === title && <span />}</span>
                  </button>
                ))}
              </div>
              <button className="primary-button" onClick={startLesson}>Meet {selectedTutor.name} <ArrowRight size={17} /></button>
              <p className="privacy-note"><CircleHelp size={14} /> No test. Your tutor will adjust as you practise.</p>
            </section>
            <aside className="tutor-intro-card">
              <div className="intro-card-top"><span className="online-dot" /> YOUR TUTOR</div>
              <AvatarPlaceholder tutor={selectedTutor} large />
              <div className="intro-name">{selectedTutor.name}</div>
              <div className="intro-language">{selectedTutor.flag} &nbsp; {selectedTutor.language}</div>
              <div className="intro-quote">“We’ll take it one conversation at a time.”</div>
            </aside>
          </div>
        </main>
      )}

      {screen === 'lesson' && (
        <main className="call-page">
          <div className="call-heading">
            <button className="back-button" onClick={() => setScreen('level')}><ArrowLeft size={16} /> Back</button>
            <div className="call-title"><span className="call-live-dot" /> Speaking with {selectedTutor.name}<span className="call-language">{selectedTutor.flag} {selectedTutor.language}</span></div>
            <button className="icon-button" aria-label="Lesson settings"><Settings2 size={18} /></button>
          </div>

          <div className="call-layout">
            <section className="video-call">
              <div className="video-stage">
                <div className="stage-room-glow" />
                <div className="stage-top-label"><span className="online-dot" /> {selectedTutor.name} <span>•</span> Your tutor</div>
                <AvatarPlaceholder tutor={selectedTutor} large />
                <div className="subtitle-card"><div className="subtitle-label">{selectedTutor.name} is speaking</div><p>안녕하세요! 이름이 뭐예요?</p><small>Hello! What’s your name?</small></div>
                <div className="learner-self-view"><div className="self-avatar">J</div><span>You</span></div>
                <div className="call-controls">
                  <button className={`control-button ${micOn ? 'control-active' : ''}`} onClick={() => setMicOn(!micOn)} aria-label={micOn ? 'Mute microphone' : 'Turn on microphone'}>{micOn ? <Mic size={19} /> : <MicOff size={19} />}<small>{micOn ? 'Mic on' : 'Mic off'}</small></button>
                  <button className="control-button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}<small>{muted ? 'Sound off' : 'Sound'}</small></button>
                  <button className="control-button" aria-label="Captions"><BookOpen size={19} /><small>Captions</small></button>
                  <button className="control-button" aria-label="More options"><MoreHorizontal size={19} /><small>More</small></button>
                  <button className="end-call-button" onClick={() => setScreen('tutors')} aria-label="End call"><PhoneOff size={19} /><small>End lesson</small></button>
                </div>
              </div>
              <div className="call-footer"><span><span className="secure-dot" /> Private practice room</span><span>Lesson 01 <b>·</b> Introductions</span></div>
            </section>

            <aside className="lesson-sidebar">
              <div className="sidebar-title-row"><div><div className="eyebrow">TODAY'S LESSON</div><h2>Introduce yourself</h2></div><button className="more-menu" aria-label="More lesson options"><MoreHorizontal size={18} /></button></div>
              <div className="lesson-progress"><div className="progress-copy"><span>Lesson progress</span><b>{activeStep} of {curriculum.length}</b></div><div className="progress-track"><span style={{ width: `${Math.round((activeStep / curriculum.length) * 100)}%` }} /></div></div>
              <div className="agenda-heading">YOUR PLAN <span>~12 MIN</span></div>
              <div className="agenda-list">
                {curriculum.map((item, index) => {
                  const complete = index < activeStep - 1;
                  const current = index === activeStep - 1;
                  return <button key={item.title} className={`agenda-item ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`} onClick={() => setActiveStep(index + 1)}>
                    <span className="agenda-marker">{complete ? <Check size={13} /> : current ? <Play size={11} fill="currentColor" /> : <span>{index + 1}</span>}</span>
                    <span className="agenda-text"><b>{item.title}</b><small>{item.duration}</small></span>
                    {current && <span className="now-label">NOW</span>}
                  </button>;
                })}
              </div>
              <div className="tutor-prompt"><div className="prompt-top"><Sparkles size={14} /> YOUR SPEAKING GOAL</div><p>Say your name in Korean, then ask your tutor for theirs.</p><button className="hint-button"><CircleHelp size={15} /> Need a hint?</button></div>
              <div className="sidebar-bottom"><div className="mini-avatar">{selectedTutor.flag}</div><div><b>{selectedTutor.name}</b><small>Adapting to your {level.toLowerCase()} level</small></div><ChevronDown size={15} /></div>
            </aside>
          </div>

          <div className="lesson-toast"><RotateCcw size={14} /><span>Your tutor will let you try first, then give a hint if you need one.</span><button onClick={() => setActiveStep(Math.min(activeStep + 1, curriculum.length))}>Next step <ArrowRight size={13} /></button></div>
        </main>
      )}
    </div>
  );
}

export default App;
