import { useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { ArrowLeft, Captions, Check, CircleHelp, Mic, MicOff, PhoneOff, Play, Volume2, VolumeX } from 'lucide-react';
import TutorAvatar from '../components/TutorAvatar';
import { getLevel } from '../data/levels';
import type { Tutor } from '../data/tutors';
import { koreanTutorId } from '../lesson/lesson-contract';
import type { LevelId, Recap } from '../lesson/lesson-contract';
import { useLearnerAudio } from '../lesson/useLearnerAudio';
import { useLessonSession } from '../lesson/useLessonSession';
import { useStreamingTutorAudio } from '../lesson/useStreamingTutorAudio';
import '../components/TutorStage.css';
import './LessonPage.css';

export default function LessonPage() {
  const tutor = useOutletContext<Tutor>();
  const [search] = useSearchParams();
  const level = getLevel(search.get('level')).id;
  const back = `/tutors/${tutor.id}/level?level=${level}`;
  if (tutor.id !== koreanTutorId) {
    return (
      <main className="lesson-room lesson-preview">
        <Link className="lesson-back" to={back}><ArrowLeft aria-hidden="true" size={17} /> Back</Link>
        <h1>{tutor.name} — {tutor.language}</h1>
        <p>Try the live Korean lesson with Han Jiwon.</p>
        <Link className="lesson-link" to={`/tutors/${koreanTutorId}/level`}>Choose a Korean level</Link>
      </main>
    );
  }
  return <LessonRoom key={level} tutor={tutor} level={level} back={back} />;
}

function LessonRoom({ tutor, level, back }: { tutor: Tutor; level: LevelId; back: string }) {
  const session = useLessonSession(level);
  const mic = useLearnerAudio(session.submit);
  const [captions, setCaptions] = useState(true);
  const [sound, setSound] = useState(true);
  const { view, recap, pending } = session;
  const agenda = view?.agenda;
  const audioPath = recap ? undefined : view?.audioPath;
  const tutorAudio = useStreamingTutorAudio(audioPath, sound);
  const speaking = tutorAudio.status === 'playing';
  const loadingAudio = tutorAudio.status === 'loading';
  const activeGoal = view?.activeGoal;
  const activePrompt = agenda?.goals.find((goal) => goal.id === activeGoal)?.practice;
  const holding = mic.status === 'starting' || mic.status === 'recording';
  const capturing = holding || mic.status === 'finishing';
  const ready = Boolean(activeGoal && !recap && !pending && !session.retryable && !speaking && !loadingAudio);
  const progress: Recap = recap ?? view ?? { completed: [], helpByGoal: {} };
  const finished = Boolean(view && !activeGoal);
  const reply = view?.reply;
  const message = session.error || mic.error;
  const state = recap ? 'Lesson ended'
    : speaking ? 'Jiwon is speaking'
    : holding ? mic.status === 'starting' ? 'Opening microphone…' : 'Recording · release to send'
    : pending || mic.status === 'finishing' ? 'Processing your turn…'
    : loadingAudio ? 'Preparing Jiwon’s audio…'
    : finished ? 'Lesson complete'
    : view ? 'Your turn' : session.error ? 'Lesson unavailable' : 'Planning your lesson…';

  function end() {
    mic.cancel();
    tutorAudio.stop();
    session.end();
  }

  return (
    <main className="lesson-room">
      <div className="lesson-heading">
        <Link className="lesson-back" to={back} onClick={(event) => {
          if (!recap && (capturing || pending || progress.completed.length > 0) &&
            !window.confirm('Leave this call and return to level selection?')) event.preventDefault();
        }}><ArrowLeft aria-hidden="true" size={17} /> Back</Link>
        <h1>{agenda?.title ?? 'Korean practice'}</h1>
        <span>{tutor.language}</span>
      </div>

      <div className="lesson-layout">
        <section className="lesson-call" aria-label="Tutor call">
          <div className="lesson-video">
            <div className="lesson-avatar"><TutorAvatar tutor={tutor} large mouth={tutorAudio.mouth} /></div>
            <p className="lesson-name">{tutor.name}</p>
            <div className="lesson-media-state" role="status">{state}</div>
          </div>
          {captions && reply && !recap && (
            <div className="lesson-captions" aria-label="Tutor captions">
              {reply.korean && <p className="lesson-hangul" lang="ko">{reply.korean}</p>}
              <p>{reply.english} {reply.prompt}</p>
            </div>
          )}
          <div className="lesson-dock">
            <button type="button" className="lesson-control" aria-pressed={mic.armed}
              disabled={!view || Boolean(recap) || finished} onClick={() => void mic.toggle()}>
              {mic.armed ? <Mic size={19} /> : <MicOff size={19} />}
              <span>{mic.armed ? 'Mic on' : mic.status === 'permission' ? 'Opening…' : 'Mic off'}</span>
            </button>
            <button type="button" className="lesson-control" aria-pressed={sound}
              disabled={Boolean(recap) || (!sound && capturing)}
              onClick={() => { if (sound) tutorAudio.stop(); setSound(!sound); }}>
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
              <span>{sound ? 'Sound' : 'Sound off'}</span>
            </button>
            <button type="button" className="lesson-control" aria-pressed={captions}
              onClick={() => setCaptions(!captions)}>
              <Captions size={19} /><span>Captions</span>
            </button>
            <button type="button" className="lesson-control lesson-end" disabled={Boolean(recap)} onClick={end}>
              <PhoneOff size={19} /><span>End lesson</span>
            </button>
          </div>
          {!recap && (
            <div className="lesson-turn">
              {activeGoal && (
                <button
                  type="button"
                  className={`lesson-push${holding ? ' is-recording' : ''}`}
                  disabled={!holding && (!mic.armed || !ready || mic.status === 'finishing')}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    if (!event.isPrimary || event.button !== 0 || !ready) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    void mic.start();
                  }}
                  onPointerUp={() => mic.finish()}
                  onPointerCancel={() => mic.finish(true)}
                  onLostPointerCapture={() => { if (holding) mic.finish(); }}
                  onKeyDown={(event) => {
                    if (event.key !== ' ' && event.key !== 'Enter') return;
                    event.preventDefault();
                    if (!event.repeat && ready) void mic.start();
                  }}
                  onKeyUp={(event) => {
                    if (event.key !== ' ' && event.key !== 'Enter') return;
                    event.preventDefault();
                    mic.finish();
                  }}
                  onBlur={() => mic.finish(true)}
                ><Mic size={18} aria-hidden="true" />{holding ? 'Release to send' : 'Push to speak'}</button>
              )}
              {(tutorAudio.status === 'blocked' || tutorAudio.status === 'error') && (
                <button type="button" className="lesson-secondary" disabled={capturing || pending} onClick={tutorAudio.play}>
                  <Play size={15} aria-hidden="true" /> {tutorAudio.status === 'blocked' ? 'Play tutor audio' : 'Retry tutor audio'}
                </button>
              )}
              {activeGoal && !mic.armed && !message && <small>Turn on your mic to speak.</small>}
              {message && <p className="lesson-error" role="alert">{message}</p>}
              {session.error && (!view || session.retryable) && (
                <button type="button" className="lesson-secondary" onClick={session.retry}>
                  {session.retryable ? 'Retry turn' : 'Retry lesson setup'}
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="lesson-agenda" aria-label={recap || finished ? 'Lesson recap' : 'Lesson goals'}>
          <h2>{recap || finished ? 'Lesson recap' : 'Speaking goals'}</h2>
          {agenda && <>
            <p className="lesson-count" aria-live="polite">{progress.completed.length} of {agenda.goals.length} completed</p>
            <progress value={progress.completed.length} max={agenda.goals.length} aria-label="Speaking goals completed" />
            <ol className="lesson-goals">
              {agenda.goals.map((goal, index) => {
                const complete = progress.completed.some((item) => item.goal === goal.id);
                const current = !recap && activeGoal === goal.id;
                return (
                  <li key={goal.id} aria-current={current ? 'step' : undefined} className={complete ? 'lesson-goal-complete' : undefined}>
                    <span className="lesson-goal-marker" aria-hidden="true">{complete ? <Check size={14} /> : index + 1}</span>
                    <div>
                      <strong>{goal.title}</strong>
                      {(recap || finished) && <small>{[complete ? 'Demonstrated' : 'Still to practise', progress.helpByGoal[goal.id]].filter(Boolean).join(' · ')}</small>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>}
          {(recap || finished) ? (
            <div className="lesson-next">
              {finished && !recap && <p>{reply?.prompt}</p>}
              <Link className="lesson-link" to={`/?tutor=${tutor.id}`}>Back to tutors</Link>
            </div>
          ) : activeGoal && (
            <div className="lesson-next">
              <p>{reply?.prompt || activePrompt}</p>
              {!captions && (!sound || tutorAudio.status === 'blocked' || tutorAudio.status === 'error') && reply && (
                <div className="lesson-text-fallback">
                  <p>{reply.english}</p>
                  {reply.korean && <p lang="ko">{reply.korean}</p>}
                </div>
              )}
              <button type="button" className="lesson-secondary" disabled={!ready || capturing}
                onClick={() => session.submit()}><CircleHelp size={16} aria-hidden="true" /> Need a hint?</button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
