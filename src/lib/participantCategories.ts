export type ParticipantCategory = { id: string; name: string }
export const DEFAULT_PARTICIPANT_CATEGORIES: ParticipantCategory[] = [
  { id: 'staff', name: 'MEC STAFF' },
  { id: 'student', name: 'MEC STUDENT' },
]
export function readParticipantCategories(payload: unknown): ParticipantCategory[] {
  if (!payload || typeof payload !== 'object') return DEFAULT_PARTICIPANT_CATEGORIES
  const value = (payload as { participant_categories?: unknown }).participant_categories
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return DEFAULT_PARTICIPANT_CATEGORIES
  const categories = value.filter((item): item is ParticipantCategory => Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' && Boolean(item.name.trim()))
  return categories.length === value.length ? categories : DEFAULT_PARTICIPANT_CATEGORIES
}
export function categoryName(categories: ParticipantCategory[], id: string) {
  return categories.find((category) => category.id === id)?.name ?? id
}
