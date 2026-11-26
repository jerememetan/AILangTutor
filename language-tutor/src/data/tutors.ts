export type Tutor = {
  id: string;
  name: string;
  language: string;
  flag: string;
  tone: string;
  modelPath?: string;
};

export const tutors: Tutor[] = [
  {
    id: 'vita',
    name: 'Han Jiwon',
    language: 'Korean',
    flag: '\u{1F1F0}\u{1F1F7}',
    tone: 'rose',
    modelPath: '/avatars/vita.vrm',
  },
  {
    id: 'victoria-rubin',
    name: 'Victoria Navarro',
    language: 'Spanish',
    flag: '\u{1F1EA}\u{1F1F8}',
    tone: 'amber',
    modelPath: '/avatars/victoria-rubin.vrm',
  },
  {
    id: 'sendagaya-shino',
    name: 'Noor de Vries',
    language: 'Dutch',
    flag: '\u{1F1F3}\u{1F1F1}',
    tone: 'blue',
    modelPath: '/avatars/sendagaya-shino.vrm',
  },
  {
    id: 'sakurada-fumiriya',
    name: 'Sakurada Ren',
    language: 'Japanese',
    flag: '\u{1F1EF}\u{1F1F5}',
    tone: 'sage',
    modelPath: '/avatars/sakurada-fumiriya.vrm',
  },
  {
    id: 'avatar-sample-b',
    name: 'Jamie Bennett',
    language: 'English',
    flag: '\u{1F1EC}\u{1F1E7}',
    tone: 'lilac',
    modelPath: '/avatars/avatar-sample-b.vrm',
  },
];
