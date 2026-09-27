import { cn } from '@/lib/utils'

/**
 * Full-viewport "stage" backdrop for the live gameplay screens players and
 * the room look at (Play, Display) — the fixed game look from Decision #61,
 * independent of the app's light/dark theme (see the `--stage*` tokens in
 * index.css).
 */
export function GameStage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-stage text-stage-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(124_58_237/0.35),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgb(236_72_153/0.18),transparent_55%)]"
      />
      <div className={cn('relative flex min-h-dvh flex-col', className)}>{children}</div>
    </div>
  )
}
