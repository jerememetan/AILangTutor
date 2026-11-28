import { romanize } from 'es-hangul';

const hangul = /\p{Script=Hangul}/u;

export function koreanReadingTokens(text: string) {
  return text.normalize('NFC').split(/(\p{Script=Hangul}+)/u).filter(Boolean).map((text) => ({
    text,
    romanization: hangul.test(text) ? romanize(text) : null,
  }));
}
