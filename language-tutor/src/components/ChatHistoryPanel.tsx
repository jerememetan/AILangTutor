import { useEffect, useId, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import type { ChatMessage } from '../lesson/lesson-contract';

const scrollThresholdPx = 48;

function isPureHangul(text: string): boolean {
  const trimmed = text.trim();
  return /\p{Script=Hangul}/u.test(trimmed) && /^[\p{Script=Hangul}\s\p{P}\p{N}]+$/u.test(trimmed);
}

export default function ChatHistoryPanel({
  tutorName,
  messages,
}: {
  tutorName: string;
  messages: readonly ChatMessage[];
}) {
  const headingId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    if (messages.length === 0) {
      stickToBottom.current = true;
      return;
    }
    const body = bodyRef.current;
    if (!body || !stickToBottom.current) return;
    body.scrollTop = body.scrollHeight;
  }, [messages.length]);

  function handleScroll() {
    const body = bodyRef.current;
    if (!body) return;
    const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
    stickToBottom.current = distanceFromBottom <= scrollThresholdPx;
  }

  return (
    <section className="lesson-history" aria-labelledby={headingId}>
      <header className="lesson-history-header">
        <div className="lesson-history-title">
          <MessageSquare size={18} aria-hidden="true" />
          <h2 id={headingId}>Chat history</h2>
        </div>
        {messages.length > 0 && (
          <span className="lesson-history-count">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        )}
      </header>

      <div className="lesson-history-body" ref={bodyRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <p className="lesson-history-empty">
            Your conversation with {tutorName} will appear here once the lesson begins.
          </p>
        ) : (
          <ol className="lesson-history-list" role="list" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => {
              if (message.speaker === 'tutor') {
                const korean = message.reply.korean?.trim();
                const englishAndPrompt = [message.reply.english, message.reply.prompt]
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li key={message.id} className="lesson-history-item is-tutor">
                    <span className="lesson-history-speaker">{tutorName}</span>
                    <div className="lesson-history-bubble">
                      {korean && <p className="lesson-history-hangul" lang="ko">{korean}</p>}
                      {englishAndPrompt && <p>{englishAndPrompt}</p>}
                    </div>
                  </li>
                );
              }

              return (
                <li key={message.id} className="lesson-history-item is-learner">
                  <span className="lesson-history-speaker">You</span>
                  <div className={`lesson-history-bubble${message.kind === 'hint' ? ' is-hint' : ''}`}>
                    <p lang={isPureHangul(message.text) ? 'ko' : undefined}>{message.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
