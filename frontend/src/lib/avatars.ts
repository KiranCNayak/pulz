// Player avatars (Decision #74). The two lists mirror
// backend/src/domain/constants.ts — kept in sync manually like
// quizConstants.ts. The server only stores values from them, so anything
// else here would just come back as a random pick.

export type Avatar = { emoji: string; color: string }

export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🐸', '🐙', '🦁', '🐯', '🐨', '🐵', '🦄', '🐶',
  '🐱', '🐧', '🦉', '🐢', '🐝', '🦖', '🚀', '⚡', '🍕', '🎸',
] as const

/** Colour key -> background. Mid-dark tones so every emoji reads on
 * them, on both the ink stage and the light workspace. */
export const AVATAR_COLORS: Record<string, { hex: string; label: string }> = {
  red: { hex: '#e21b3c', label: 'Red' },
  orange: { hex: '#e0661f', label: 'Orange' },
  gold: { hex: '#d9a011', label: 'Gold' },
  green: { hex: '#26890c', label: 'Green' },
  teal: { hex: '#0e8a8a', label: 'Teal' },
  blue: { hex: '#1368ce', label: 'Blue' },
  pink: { hex: '#d6337a', label: 'Pink' },
  slate: { hex: '#586174', label: 'Slate' },
}

const AVATAR_KEY = 'pulz:avatar'

export function randomAvatar(): Avatar {
  const colors = Object.keys(AVATAR_COLORS)
  return {
    emoji: AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
  }
}

/** Last avatar this device joined with, so the next join starts on it. */
export function getSavedAvatar(): Avatar | null {
  try {
    const saved = JSON.parse(localStorage.getItem(AVATAR_KEY) ?? 'null') as Avatar | null
    if (saved && (AVATAR_EMOJIS as readonly string[]).includes(saved.emoji) && saved.color in AVATAR_COLORS) return saved
  } catch {
    // Unparseable — fall through to no saved avatar.
  }
  return null
}

export function saveAvatar(avatar: Avatar): void {
  localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar))
}
