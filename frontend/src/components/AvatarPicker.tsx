import { Avatar } from '@/components/Avatar'
import { AVATAR_COLORS, AVATAR_EMOJIS, type Avatar as AvatarValue } from '@/lib/avatars'
import { cn } from '@/lib/utils'

/**
 * Join-screen avatar chooser (Decision #74): a colour and an emoji, each a
 * native radio group (arrow keys, one tab stop) styled as circles, with a
 * live preview. A deliberately small v1 set — see lib/avatars.ts.
 */
export function AvatarPicker({ value, onChange }: { value: AvatarValue; onChange: (value: AvatarValue) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar avatar={value} className="size-16 text-4xl shadow-soft motion-safe:transition-colors motion-safe:duration-150" />
        <p className="text-sm text-muted-foreground">Pick a colour and a face. Everyone sees it next to your name.</p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(AVATAR_COLORS).map(([key, { hex, label }]) => (
            <label key={key} className="relative cursor-pointer">
              <input
                type="radio"
                name="avatar-color"
                value={key}
                checked={value.color === key}
                onChange={() => onChange({ ...value, color: key })}
                className="peer sr-only"
              />
              <span className="sr-only">{label}</span>
              <span
                aria-hidden="true"
                className="block size-9 rounded-full ring-offset-2 ring-offset-card transition-shadow duration-150 peer-checked:ring-[3px] peer-checked:ring-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring"
                style={{ backgroundColor: hex }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Face</legend>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {AVATAR_EMOJIS.map((emoji) => (
            <label key={emoji} className="cursor-pointer">
              <input
                type="radio"
                name="avatar-emoji"
                value={emoji}
                checked={value.emoji === emoji}
                onChange={() => onChange({ ...value, emoji })}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'grid aspect-square place-items-center rounded-full text-2xl transition-[background-color,box-shadow] duration-150 select-none hover:bg-muted',
                  'peer-checked:bg-muted peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring',
                )}
              >
                {emoji}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
