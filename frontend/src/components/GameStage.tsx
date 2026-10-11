import { cn } from '@/lib/utils'

/**
 * Full-viewport "stage" backdrop for the live gameplay screens players and
 * the room look at (Play, Display): Midnight Ink with a faint dot grid and a
 * soft neutral spotlight, so the answer tiles are the only saturated colour
 * on screen (DESIGN_SYSTEM.md §1, Decision #68). Fixed and independent of
 * the app's light/dark theme (see the `--stage*` tokens in index.css).
 * Pads for notches/home indicators on phones.
 */
export function GameStage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-stage text-stage-foreground [color-scheme:dark]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgb(255_255_255/0.07),transparent)]"
      />
      <div
        className={cn(
          'relative flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
