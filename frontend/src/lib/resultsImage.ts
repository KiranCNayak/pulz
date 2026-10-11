import { ANSWER_SLOT_STYLES } from '@/components/answerStyles'
import { AVATAR_COLORS } from '@/lib/avatars'
import { formatNumber } from '@/lib/format'
import type { PodiumEntry, ResultsResponse } from '@/lib/resultsApi'

// "Share results" image (Decision #78): a 1080x1350 portrait card (4:5,
// which WhatsApp, Instagram and most feeds show uncropped) drawn straight
// onto a canvas, so no screenshot library and nothing depends on how the
// page happens to be laid out. Colours and type follow DESIGN_SYSTEM.md's
// ink stage.

const WIDTH = 1080
const HEIGHT = 1350
const INK = '#0b0d14'
const RAISED = '#151925'
const ELEVATED = '#1d2230'
const PAPER = '#f4f5f8'
const FOG = '#9ba3b7'
const LIME = '#c6ec5c'
const MEDALS: Record<number, string> = { 1: '#f5c84b', 2: '#d5dae3', 3: '#e59a5b' }
const DISPLAY_FONT = '"Outfit Variable", system-ui, sans-serif'
const BODY_FONT = '"Geist Variable", system-ui, sans-serif'
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

// Podium columns by position in the ranked list, like Podium.tsx: the
// leader in the middle, then left, then right.
const COLUMN_WIDTH = 300
const COLUMN_GAP = 24
const PODIUM_LEFT = (WIDTH - 3 * COLUMN_WIDTH - 2 * COLUMN_GAP) / 2
const SLOT_COLUMN = [1, 0, 2]
const SLOT_HEIGHT = [260, 190, 140]
/** From the top of the 1st-place block up to the top of its crown. */
const WINNER_STACK = 330
const ROW_HEIGHT = 58
const ROWS_BOTTOM = HEIGHT - 110 // above the footer
const MORE_RANKS = 5

/** `text` cut to fit `maxWidth` in the current font, with an ellipsis. */
export function fitText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/** Up to `maxLines` lines of `text` wrapped at `maxWidth`, the last one
 * ellipsised if it still doesn't fit. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const candidate = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
      continue
    }
    if (lines.length === maxLines - 1) {
      lines.push(fitText(ctx, `${line} ${words.slice(i).join(' ')}`, maxWidth))
      return lines
    }
    lines.push(line)
    line = words[i]
  }
  if (line) lines.push(fitText(ctx, line, maxWidth))
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function drawShape(ctx: CanvasRenderingContext2D, shape: string, cx: number, cy: number, size: number) {
  const h = size / 2
  ctx.beginPath()
  if (shape === 'triangle') {
    ctx.moveTo(cx, cy - h)
    ctx.lineTo(cx + h, cy + h * 0.8)
    ctx.lineTo(cx - h, cy + h * 0.8)
  } else if (shape === 'diamond') {
    ctx.moveTo(cx, cy - h)
    ctx.lineTo(cx + h, cy)
    ctx.lineTo(cx, cy + h)
    ctx.lineTo(cx - h, cy)
  } else if (shape === 'circle') {
    ctx.arc(cx, cy, h * 0.9, 0, Math.PI * 2)
  } else {
    ctx.rect(cx - h * 0.8, cy - h * 0.8, h * 1.6, h * 1.6)
  }
  ctx.closePath()
  ctx.fill()
}

function drawAvatar(ctx: CanvasRenderingContext2D, entry: PodiumEntry, cx: number, cy: number, radius: number) {
  ctx.fillStyle = entry.avatar ? (AVATAR_COLORS[entry.avatar.color]?.hex ?? ELEVATED) : ELEVATED
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (entry.avatar) {
    ctx.font = `${Math.round(radius * 1.15)}px ${EMOJI_FONT}`
    ctx.fillText(entry.avatar.emoji, cx, cy + radius * 0.06)
  } else {
    ctx.fillStyle = PAPER
    ctx.font = `800 ${Math.round(radius)}px ${DISPLAY_FONT}`
    ctx.fillText(entry.displayName.trim().charAt(0).toUpperCase(), cx, cy)
  }
}

function drawCrown(ctx: CanvasRenderingContext2D, cx: number, bottom: number) {
  ctx.fillStyle = MEDALS[1]
  ctx.beginPath()
  ctx.moveTo(cx - 34, bottom)
  ctx.lineTo(cx - 40, bottom - 34)
  ctx.lineTo(cx - 18, bottom - 18)
  ctx.lineTo(cx, bottom - 44)
  ctx.lineTo(cx + 18, bottom - 18)
  ctx.lineTo(cx + 40, bottom - 34)
  ctx.lineTo(cx + 34, bottom)
  ctx.closePath()
  ctx.fill()
}

function correctLine(entry: PodiumEntry): string | null {
  return entry.answeredCount !== undefined ? `${entry.correctCount} of ${entry.answeredCount} correct` : null
}

/** Draws the results card and returns it as a PNG. */
export async function renderResultsImage(results: ResultsResponse, siteLabel: string): Promise<Blob> {
  // Canvas text silently falls back if a web font hasn't loaded yet.
  await Promise.all([
    document.fonts.load(`800 64px ${DISPLAY_FONT}`),
    document.fonts.load(`600 28px ${BODY_FONT}`),
  ]).catch(() => undefined)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser can't draw the image.")

  // Stage + dot grid.
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (let y = 22; y < HEIGHT; y += 44) for (let x = 22; x < WIDTH; x += 44) ctx.fillRect(x, y, 2, 2)
  const glow = ctx.createRadialGradient(WIDTH / 2, 700, 40, WIDTH / 2, 700, 520)
  glow.addColorStop(0, 'rgba(245,200,75,0.16)')
  glow.addColorStop(1, 'rgba(245,200,75,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // Brand row: the four answer tiles, then the wordmark.
  ANSWER_SLOT_STYLES.forEach((slot, i) => {
    const x = 80 + i * 58
    ctx.fillStyle = slot.color
    roundRect(ctx, x, 72, 48, 48, 12)
    ctx.fillStyle = '#ffffff'
    drawShape(ctx, slot.shape, x + 24, 96, 22)
  })
  ctx.fillStyle = PAPER
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `800 48px ${DISPLAY_FONT}`
  ctx.fillText('Pulz', 80 + 4 * 58 + 12, 98)

  // Title block.
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = FOG
  ctx.font = `600 30px ${BODY_FONT}`
  ctx.fillText('FINAL RESULTS', 80, 214)
  ctx.fillStyle = PAPER
  ctx.font = `800 68px ${DISPLAY_FONT}`
  const titleLines = wrapText(ctx, results.quizTitle ?? 'Final results', WIDTH - 160, 2)
  titleLines.forEach((line, i) => ctx.fillText(line, 80, 290 + i * 76))
  ctx.fillStyle = FOG
  ctx.font = `500 30px ${BODY_FONT}`
  const players = results.totalParticipants
  ctx.fillText(`${players} ${players === 1 ? 'player' : 'players'}`, 80, 290 + titleLines.length * 76 + 8)

  // The podium sits clear of the title (one line or two), with room under
  // it for as many of the next places as fit; with none to show, it moves
  // down to fill the card instead of leaving the bottom empty.
  const lastTitleBaseline = 290 + (titleLines.length - 1) * 76
  const minBase = lastTitleBaseline + 40 + WINNER_STACK + SLOT_HEIGHT[0]
  const ranksBelow = results.page === 1 ? results.ranks.slice(0, MORE_RANKS) : []
  const base = ranksBelow.length > 0 ? minBase : Math.max(minBase, 1060)
  const more = ranksBelow.slice(0, Math.max(0, Math.floor((ROWS_BOTTOM - base - 28) / ROW_HEIGHT)))

  // Podium.
  const podium = [...results.podium].sort((a, b) => a.rank - b.rank).slice(0, 3)
  podium.forEach((entry, slot) => {
    const x = PODIUM_LEFT + SLOT_COLUMN[slot] * (COLUMN_WIDTH + COLUMN_GAP)
    const cx = x + COLUMN_WIDTH / 2
    const top = base - SLOT_HEIGHT[slot]
    ctx.fillStyle = MEDALS[entry.rank] ?? ELEVATED
    roundRect(ctx, x, top, COLUMN_WIDTH, SLOT_HEIGHT[slot], [28, 28, 0, 0])
    ctx.fillStyle = 'rgba(14,17,24,0.8)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `800 96px ${DISPLAY_FONT}`
    ctx.fillText(String(entry.rank), cx, top + 22)

    // Name, score and correct count stacked above the block.
    ctx.textBaseline = 'alphabetic'
    const correct = correctLine(entry)
    let y = top - 22
    if (correct) {
      ctx.fillStyle = FOG
      ctx.font = `500 24px ${BODY_FONT}`
      ctx.fillText(correct, cx, y)
      y -= 36
    }
    ctx.fillStyle = FOG
    ctx.font = `600 28px ${BODY_FONT}`
    ctx.fillText(`${formatNumber(entry.score)} pts`, cx, y)
    y -= 42
    ctx.fillStyle = PAPER
    ctx.font = `800 ${slot === 0 ? 44 : 38}px ${DISPLAY_FONT}`
    ctx.fillText(fitText(ctx, entry.displayName, COLUMN_WIDTH - 16), cx, y)
    const radius = slot === 0 ? 62 : 52
    const avatarY = y - 46 - radius
    drawAvatar(ctx, entry, cx, avatarY, radius)
    if (entry.rank === 1) drawCrown(ctx, cx, avatarY - radius - 14)
  })

  // The next few places, as rows.
  more.forEach((entry, i) => {
    const y = base + 28 + i * ROW_HEIGHT
    ctx.fillStyle = i % 2 === 0 ? RAISED : 'rgba(21,25,37,0.5)'
    roundRect(ctx, 80, y, WIDTH - 160, ROW_HEIGHT - 6, 14)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = FOG
    ctx.font = `700 26px ${BODY_FONT}`
    ctx.fillText(`#${entry.rank}`, 104, y + 26)
    drawAvatar(ctx, entry, 196, y + 26, 19)
    ctx.textAlign = 'left'
    ctx.fillStyle = PAPER
    ctx.font = `700 28px ${DISPLAY_FONT}`
    ctx.fillText(fitText(ctx, entry.displayName, 420), 230, y + 26)
    ctx.textAlign = 'right'
    const correct = correctLine(entry)
    if (correct) {
      ctx.fillStyle = FOG
      ctx.font = `500 22px ${BODY_FONT}`
      ctx.fillText(correct.replace(' correct', ''), WIDTH - 260, y + 26)
    }
    ctx.fillStyle = PAPER
    ctx.font = `700 28px ${BODY_FONT}`
    ctx.fillText(formatNumber(entry.score), WIDTH - 104, y + 26)
  })

  // Footer.
  const footer = `Play your own quiz at ${siteLabel}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `500 28px ${BODY_FONT}`
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(WIDTH / 2 - ctx.measureText(footer).width / 2 - 26, HEIGHT - 69, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = FOG
  ctx.fillText(footer, WIDTH / 2, HEIGHT - 60)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the image."))), 'image/png'),
  )
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Opens the system share sheet with the image where the browser can
 * share files (phones, and some desktops), else downloads it. */
export async function shareResultsImage(results: ResultsResponse): Promise<ShareOutcome> {
  const blob = await renderResultsImage(results, window.location.host)
  const file = new File([blob], 'pulz-results.png', { type: 'image/png' })
  const title = results.quizTitle ? `${results.quizTitle}: final results` : 'Pulz final results'

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
      // Some browsers claim support then refuse; fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
