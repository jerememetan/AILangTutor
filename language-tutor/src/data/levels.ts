export const levels = [
  { id: 'beginner', title: 'New to it', detail: 'I’m starting from the basics' },
  { id: 'basic', title: 'Know a little', detail: 'I can use a few words and phrases' },
  { id: 'comfortable', title: 'Comfortable speaking', detail: 'I want to sound more natural' },
];

export function getLevel(id: string | null) {
  return levels.find((level) => level.id === id) ?? levels[0];
}
