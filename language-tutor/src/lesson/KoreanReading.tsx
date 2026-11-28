import { koreanReadingTokens } from './korean-reading';

export default function KoreanReading({ text }: { text: string }) {
  return koreanReadingTokens(text).map(({ text, romanization }, index) => romanization ? (
    <span className="korean-reading" key={index}>
      <span className="korean-reading-text" lang="ko">{text}</span>
      <span className="korean-reading-guide" lang="ko-Latn">{romanization}</span>
    </span>
  ) : text);
}
