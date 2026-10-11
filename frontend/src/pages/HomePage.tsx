import { ArrowRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnswerGrid } from '@/components/AnswerGrid'
import { toAnswerOptions } from '@/components/answerStyles'
import { AppShell } from '@/components/AppShell'
import { Wordmark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

// The sample question shown in the hero preview and the phone cell — real
// AnswerGrid components, not screenshots (DESIGN_SYSTEM.md §5).
const SAMPLE_OPTIONS = toAnswerOptions([
  { id: 'a', text: 'Jupiter' },
  { id: 'b', text: 'Saturn' },
  { id: 'c', text: 'Neptune' },
  { id: 'd', text: 'Uranus' },
])
const SAMPLE_TALLY = { a: 9, b: 14, c: 2, d: 3 }

// Points for a correct answer on a 20s question, straight from the scoring
// formula (PRD §5, Decision #67): round(1000 - 500 * t / 20).
const SCORING_EXAMPLES = [0.4, 1.2, 6, 14].map((seconds) => ({
  seconds,
  points: Math.round(1000 - 500 * (seconds / 20)),
}))

const SAMPLE_STANDINGS = [
  { name: 'Priya', score: 4870 },
  { name: 'Mateo', score: 4615 },
  { name: 'Jonah', score: 4590 },
]

const MEDAL = ['bg-medal-gold', 'bg-medal-silver', 'bg-medal-bronze']

/** Landing page at `/`: the two ways in (host a quiz, join a game) and a
 * short tour of what the room sees. */
export function HomePage() {
  useDocumentTitle()

  return (
    <AppShell>
      <Hero />
      <Tour />
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <Wordmark className="text-base text-foreground" markClassName="size-7 rounded-lg p-[4px]" />
          <p>Live quiz games for classrooms, teams and parties.</p>
        </div>
      </footer>
    </AppShell>
  )
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pt-20 lg:pb-24">
      <div className="flex flex-col items-start gap-7 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
        <h1 className="font-display text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-6xl lg:text-[4.25rem]">
          Quiz night, live on every screen.
        </h1>
        <p className="max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
          Build a quiz, put it on the big screen, and let everyone play from their phone. No accounts, no installs.
        </p>
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
          <Button size="xl" render={<Link to="/create" />}>
            <Plus aria-hidden="true" strokeWidth={2.5} />
            Create a quiz
          </Button>
          <HeroJoinForm />
        </div>
      </div>

      <DisplayPreview />
    </section>
  )
}

/** Inline "have a code?" entry; hands the code to /join so the player only
 * has to add their name. */
function HeroJoinForm() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  return (
    <form
      className="flex w-full items-center gap-2 sm:w-auto"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = code.trim().toUpperCase()
        navigate(trimmed ? `/join?code=${encodeURIComponent(trimmed)}` : '/join')
      }}
    >
      <label htmlFor="home-join-code" className="sr-only">
        Join code
      </label>
      <Input
        id="home-join-code"
        name="joinCode"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={6}
        placeholder="Game PIN…"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className="h-14 w-full font-mono text-lg tracking-[0.2em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case sm:w-44"
      />
      <Button type="submit" variant="outline" size="icon-lg" className="size-14 shrink-0" aria-label="Join game">
        <ArrowRight aria-hidden="true" className="size-5" />
      </Button>
    </form>
  )
}

/** A miniature of the projector Display mid-reveal, built from the real
 * game components. */
function DisplayPreview() {
  return (
    <figure className="relative motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-700">
      <div className="relative overflow-hidden rounded-3xl bg-stage p-5 text-stage-foreground shadow-lift ring-1 ring-black/5 sm:p-7 dark:ring-white/10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-3xl bg-dot-grid opacity-70" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-stage-line">
            Question 3 <span className="text-stage-muted">of 10</span>
          </span>
          <span className="rounded-full bg-stage-correct px-3.5 py-1.5 text-sm font-bold">Everyone answered!</span>
        </div>
        <p className="relative mt-6 mb-5 text-center font-display text-2xl leading-tight font-bold sm:text-3xl">
          Which planet has the most known moons?
        </p>
        <AnswerGrid
          className="relative"
          options={SAMPLE_OPTIONS}
          reveal={{ correctOptionId: 'b', tally: SAMPLE_TALLY }}
          tileClassName="min-h-16 text-base sm:min-h-20 sm:text-lg"
        />
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted-foreground">
        What the room sees on the projector after each question.
      </figcaption>
    </figure>
  )
}

function Tour() {
  return (
    <section aria-labelledby="tour-heading" className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 id="tour-heading" className="max-w-xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Built for a room full of people.
        </h2>

        <div className="mt-10 grid gap-4 md:grid-cols-6 md:grid-rows-[auto_auto]">
          <TourCell
            className="bg-stage text-stage-foreground md:col-span-3 md:row-span-2"
            title="Phones become buzzers"
            body="Players tap the shape they see on the big screen. No reading, just speed."
            dark
          >
            <div className="mx-auto mt-6 w-full max-w-[15rem] rounded-[2rem] md:my-auto md:pt-0 bg-black/40 p-2.5 ring-1 ring-white/10">
              <div className="rounded-[1.6rem] bg-stage-raised p-3">
                <div className="mb-3 flex items-center justify-between px-1 text-xs font-semibold text-stage-muted">
                  <span>Q 3/10</span>
                  <span className="grid size-8 place-items-center rounded-full ring-2 ring-white/70 font-display text-sm text-white">
                    12
                  </span>
                </div>
                <AnswerGrid options={SAMPLE_OPTIONS} shapeOnly className="auto-rows-fr" tileClassName="min-h-24 sm:min-h-24 [&_svg]:size-10 sm:[&_svg]:size-10" />
              </div>
            </div>
          </TourCell>

          <TourCell
            className="md:col-span-3"
            title="Faster answers score more"
            body="Every correct answer earns 1,000 down to 500 points, by when the server receives it."
          >
            <dl className="mt-5 grid grid-cols-4 gap-2">
              {SCORING_EXAMPLES.map((example) => (
                <div key={example.seconds} className="rounded-xl bg-muted px-3 py-3">
                  <dt className="text-xs font-medium text-muted-foreground tabular-nums">{example.seconds}s</dt>
                  <dd className="font-display text-xl font-bold tabular-nums sm:text-2xl">{example.points}</dd>
                </div>
              ))}
            </dl>
          </TourCell>

          <TourCell
            className="bg-dot-grid-ink md:col-span-3 dark:bg-dot-grid"
            title="Standings after every question"
            body="Lock a question and the leaderboard updates on every screen at once."
          >
            <ol className="mt-5 space-y-2">
              {SAMPLE_STANDINGS.map((entry, index) => (
                <li key={entry.name} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-border">
                  <span
                    className={cn(
                      'grid size-7 place-items-center rounded-full font-display text-sm font-extrabold text-[#0e1118]',
                      MEDAL[index],
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="flex-1 font-semibold">{entry.name}</span>
                  <span className="font-display font-bold tabular-nums">{formatNumber(entry.score)}</span>
                </li>
              ))}
            </ol>
          </TourCell>
        </div>
      </div>
    </section>
  )
}

function TourCell({
  title,
  body,
  className,
  dark,
  children,
}: {
  title: string
  body: string
  className?: string
  dark?: boolean
  children: React.ReactNode
}) {
  return (
    <article className={cn('flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-7', dark && 'border-transparent dark:border-border', className)}>
      <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
      <p className={cn('mt-1.5 max-w-sm leading-relaxed', dark ? 'text-stage-muted' : 'text-muted-foreground')}>{body}</p>
      {children}
    </article>
  )
}
