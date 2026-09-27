import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type CountdownProps = {
  /** Client-clock epoch ms — see lib/questionTimer.ts's questionDeadline. */
  deadline: number
  durationSeconds: number
  /** Freezes the ring (question locked early by the host). */
  stopped?: boolean
  size?: 'default' | 'large'
  className?: string
}

const RADIUS = 20
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const URGENT_SECONDS = 5

/** Draining countdown ring for the active question. Inherits its color
 * from `currentColor`, so it works on the fixed game stage and on the
 * theme-aware Host page alike. For the final seconds it becomes a solid
 * red disc with a scale "tick" — an opacity pulse read as faded, not
 * urgent, at half its cycle. */
export function Countdown({ deadline, durationSeconds, stopped, size = 'default', className }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (stopped) return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [stopped])

  const remainingMs = Math.max(0, deadline - now)
  // Round up while running (a question never shows 0 while still open);
  // round down once stopped, since the last tick before a time-up
  // auto-lock would otherwise freeze the ring on "1".
  const seconds = stopped ? Math.floor(remainingMs / 1000) : Math.ceil(remainingMs / 1000)
  const fraction = durationSeconds > 0 ? Math.min(1, remainingMs / (durationSeconds * 1000)) : 0
  const urgent = !stopped && seconds <= URGENT_SECONDS

  return (
    <div
      role="timer"
      aria-label={`${seconds} seconds left`}
      className={cn(
        'relative grid shrink-0 place-items-center',
        size === 'large' ? 'size-28 text-4xl' : 'size-14 text-lg',
        urgent && 'rounded-full bg-[#e21b3c] text-white motion-safe:animate-[countdown-tick_1s_ease-in-out_infinite]',
        className,
      )}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={4} />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <span className="font-bold tabular-nums">{seconds}</span>
    </div>
  )
}
