import type { Avatar as AvatarValue } from '@/lib/avatars'
import { AVATAR_COLORS } from '@/lib/avatars'
import { cn } from '@/lib/utils'

/**
 * A player's emoji on their chosen colour (Decision #74), always a circle
 * (DESIGN_SYSTEM.md §4). Decorative: the name next to it is what's read
 * out. Size it with a `size-*` and a `text-*` class from the caller.
 * Results saved before avatars existed have none, so `name`'s initial
 * stands in. `dancing` is the winner's bop on a podium (Decision #76).
 */
export function Avatar({
  avatar,
  name,
  dancing,
  className,
}: {
  avatar?: AvatarValue | null
  name?: string
  dancing?: boolean
  className?: string
}) {
  const color = avatar ? AVATAR_COLORS[avatar.color]?.hex : undefined
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid size-8 shrink-0 place-items-center rounded-full leading-none select-none',
        !avatar && 'bg-muted font-bold text-muted-foreground uppercase',
        dancing && 'motion-safe:animate-[avatar-dance_900ms_ease-in-out_infinite]',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {avatar ? avatar.emoji : (name?.trim().charAt(0) ?? '')}
    </span>
  )
}
