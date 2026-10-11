# Design System: Pulz

The visual language for every Pulz screen. `docs/DESIGN.md` is the
*functional* design (entities, events, scoring); this file is the *visual*
one. Tokens live in `frontend/src/index.css`; when the two disagree, fix one
of them. Decision #68 records why this system replaced the violet game stage.

**Design read:** a redesign (new visuals, same routes, flows and copy) of a
live party-quiz product. Hosts run it from a laptop and a projector, and
players answer on phones. The language is bold game-show energy delivered
with product-grade restraint: ink, paper, one signal accent, and the four
answer colours as the brand's spectrum.

**Dials:** Variance 6 (asymmetric where it helps, symmetric where the game
needs a mirror layout), Motion 5 (fluid CSS, every animation motivated),
Density 4 (daily-app spacing; the projector screens scale up, never pack in).

## 1. Visual Theme & Atmosphere

A dark, focused "broadcast studio": a near-black ink stage with a faint dot
grid, where the four answer tiles are the only saturated colour on screen.
The game becomes the light source. Around it, the Creator pages are a calm,
cool-grey workspace that steps aside so the quiz content leads. Energy comes
from type weight, scale and the single lime signal colour, not from
gradients or glows.

## 2. Color Palette & Roles

### Ink stage (gameplay: Play, Display; also the app's dark theme)
- **Midnight Ink** (`#0b0d14`): stage and dark-theme canvas
- **Raised Ink** (`#151925`): panels, leaderboard, cards on the stage
- **Elevated Ink** (`#1d2230`): hovered or raised controls on dark
- **Hairline** (`rgba(255,255,255,0.09)`): 1px structure on dark
- **Paper** (`#f4f5f8`): primary text on dark (17.8:1)
- **Fog** (`#9ba3b7`): secondary text on dark (7.7:1 on Midnight)

### Workspace (light theme: Creator, Join, Results, Host)
- **Canvas** (`#f5f6f8`): page background, cool grey with no beige
- **Surface** (`#ffffff`): cards and inputs
- **Ink** (`#0e1118`): primary text (17.5:1)
- **Slate** (`#586174`): secondary text (6.2:1 on Surface)
- **Line** (`#e2e5eb`): borders and dividers

### Signal (the one accent)
- **Signal Lime** (`#c6ec5c`, saturation 79%): primary actions ("Go
  live", "Start game", "Join", "Lock question", "Next"), the active state,
  and the dark-theme focus ring. Always carries **Ink** text (14:1); never
  used as text on a light surface (1.35:1).
- **Lime Deep** (`#4d6b00`): the pressed edge under lime buttons on light
  surfaces, and lime-family text on white (6.1:1).

### Game colours (fixed, theme-independent)
- **Answer slots:** Red `#e21b3c` triangle, Blue `#1368ce` diamond, Gold
  `#b87a00` circle, Green `#26890c` square. White labels at 3:1 or better
  (large bold text). Shape always accompanies colour (colour-blind safe).
- **Correct** (`#15803d`, white text 5.0:1) and **Incorrect** (`#c72c48`,
  5.4:1): full-bleed result screens and reveal badges only.
- **Urgent** (`#e21b3c`): the countdown's final five seconds.
- **Medals:** gold `#f5c84b`, silver `#d5dae3`, bronze `#e59a5b` with Ink
  numerals, used on podiums and rank badges only.

**Banned:** purple or violet gradients, neon glows, pure `#000`/`#fff` as
large surfaces, a second accent colour.

## 3. Typography Rules
- **Display:** Outfit Variable (600 to 800). Headlines, big numbers, the
  wordmark, answer labels on the projector. `tracking-tight`, weight sets
  the hierarchy before size does. `text-balance` on headings.
- **Body:** Geist Variable (400 to 600). UI text, forms, descriptions; body
  copy capped at about 65ch.
- **Mono:** Geist Mono Variable. Join codes, tokens, and any number that
  sits in a column (with `tabular-nums`).
- **Scale (app):** 14 / 16 / 18 / 24 / 32 / 48 / 64px. Projector screens
  use `clamp()` and viewport units so they read from the back of a room.
- **Copy:** sentence case for headings and buttons. Use `…` instead of
  `...`. No em or en dashes as separators; use a period, comma or colon.
- **Banned:** Inter, generic serifs, all-caps body text, gradient text.

## 4. Component Stylings
- **Shape lock:** controls (buttons, inputs, selects) are 12px radius;
  cards, panels and answer tiles 20px; stage hero panels 28px; badges,
  chips and avatars are full pills or circles. Nothing else.
- **Buttons:** primary is a Signal Lime fill with Ink text and a 3px Lime
  Deep bottom edge that compresses on press (`translate-y`), echoing the
  answer tiles. Secondary is an outline on Surface/Raised Ink. Ghost is
  for icon actions. Heights are 40px (default), 48px (large) and 56px (hero
  actions); touch targets are at least 44px. No glows.
- **Inputs:** 44px tall, label above, helper or error text below, Surface
  fill, Line border, Ink focus ring (Lime in dark). Codes are mono and
  letter-spaced.
- **Cards:** used only to group an editable unit (a question, the go-live
  panel, a leaderboard). 1px Line border plus a soft ink-tinted shadow.
  Elsewhere, use spacing and hairlines.
- **Answer tiles:** slot colour, 20px radius, a 6px darker bottom edge that
  presses in, and a thin inner top highlight. Selected tiles get a Paper
  ring; receding tiles darken and desaturate (never fade, which turns them
  pastel).
- **Rank badges:** circles; medal colours for 1 to 3, Elevated Ink or Line
  otherwise.
- **Loading:** a spinner only for "connecting" moments where nothing about
  the final layout is known; skeleton blocks for page data.
- **Empty states:** an icon, one sentence on what fills the space, and how
  to fill it.

## 5. Layout Principles
- App pages share one shell: a 64px header (wordmark, Join and Create
  links, theme toggle), content capped at 72rem, and a skip link.
- Home: an asymmetric split hero (copy left, a live component preview
  right), then a three-cell bento built from real components, not
  screenshots.
- Editor: a single 48rem column with a sticky action bar, so "Create quiz" or
  "Go live" is always one tap away.
- Gameplay keeps Decision #62's mirror rule: 2 options stack, 3 or 4 fill a
  2x2 grid, identically on Display, Host and Play.
- Below 768px everything collapses to one column; no horizontal scroll at
  320px. Full-bleed phone screens respect `env(safe-area-inset-*)`.
- Use `min-h-dvh`, never `h-screen`.

## 6. Motion & Interaction
- CSS only (`tw-animate-css` and transitions), gated with `motion-safe:`.
  Under `prefers-reduced-motion` nothing moves except the countdown
  number itself.
- Every animation has a job: tiles press on tap (feedback), the reveal
  zooms in and the leaderboard staggers in (state change), lobby names pop
  as they join (presence), the podium rises 3rd, 2nd, 1st (storytelling),
  and the countdown ticks in its last five seconds (urgency).
- The one looping celebration (Decision #76): confetti bursts, then rains
  for as long as the screen is open, and the winner's avatar bops on the
  podium. It runs on the Display's game-over screen and on the winner's
  own results page (not other players'), from one shared `Confetti`
  component and `Avatar dancing` prop. Under reduced motion the confetti is
  hidden and the avatar stays still.
- Durations of 150 to 200ms for feedback and 300 to 600ms for
  state changes, easing `cubic-bezier(0.16, 1, 0.3, 1)`. Transitions name
  their properties; never `transition: all`. Transform and opacity only.

## 7. Anti-Patterns (Banned)
- Emoji as icons (the old podium medals); use Lucide (the one icon family,
  stroke 2) or numerals. Player avatars are the one exception: they're the
  player's chosen identity, not an icon (Decision #74), always an emoji on a
  circle in one of the 8 avatar colours.
- Themed QR codes. The join QR (Decision #77) is always Ink on white with a
  white quiet zone, in both themes, because that's what phone cameras read
  reliably.
- Raw enums in UI (`IN_PROGRESS`); always human labels.
- Purple or neon gradients, outer glows, gradient text, custom cursors.
- Three equal feature cards; fake screenshots built from divs; fake
  testimonials or invented stats.
- Em dashes anywhere in UI copy; `...` instead of `…`.
- Placeholder-as-label; errors far from their field.
- Immediate destructive actions: deleting a question asks for confirmation.
