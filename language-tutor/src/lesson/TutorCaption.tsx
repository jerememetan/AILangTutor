import type { TutorReply } from './lesson-contract';
import { tutorSpeechText } from './tutor-speech';
import KoreanReading from './KoreanReading';

export default function TutorCaption({ reply }: { reply: TutorReply }) {
  return <p className="lesson-caption-text"><KoreanReading text={tutorSpeechText(reply)} /></p>;
}
