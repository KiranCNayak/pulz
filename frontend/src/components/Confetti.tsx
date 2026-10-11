import { AnswerShape } from '@/components/AnswerShape'
import { ANSWER_SLOT_STYLES } from '@/components/answerStyles'

type Piece = {
  shape: (typeof ANSWER_SLOT_STYLES)[number]['shape']
  color: string
  left: number // %
  size: number // px
  delay: number // ms
  duration: number // ms
  burstX: number // vw
  burstY: number // vh
}

// Fixed scatter from a tiny seeded generator, so renders stay pure and
// every visit looks the same. Pieces are the answer shapes and colours,
// like the Display's game-over confetti.
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const random = seeded(42)
const PIECES: Piece[] = Array.from({ length: 40 }, (_, i) => {
  const slot = ANSWER_SLOT_STYLES[i % ANSWER_SLOT_STYLES.length]
  const angle = random() * Math.PI * 2
  const distance = 25 + random() * 30
  return {
    shape: slot.shape,
    color: slot.color,
    left: random() * 100,
    size: 8 + Math.round(random() * 10),
    delay: Math.round(random() * 4000),
    duration: 3200 + Math.round(random() * 2800),
    burstX: Math.cos(angle) * distance,
    burstY: Math.sin(angle) * distance * 0.8,
  }
})

/**
 * End-of-game confetti (Decision #76): one burst from the centre, then a
 * gentle rain that keeps going. The one celebration, used by the winner's
 * own results page and the Display's game-over screen, so a change to the
 * animation lands on both. `scale` enlarges the pieces for a projector.
 * Purely decorative and click-through; hidden entirely under
 * prefers-reduced-motion, where it would only be clutter.
 */
export function Confetti({ scale = 1 }: { scale?: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden">
      {PIECES.map((piece, i) => (
        <span
          key={`burst-${i}`}
          className="absolute top-1/3 left-1/2 opacity-0"
          style={
            {
              color: piece.color,
              '--burst-x': `${piece.burstX}vw`,
              '--burst-y': `${piece.burstY}vh`,
              animation: `confetti-burst 1400ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 8}ms both`,
            } as React.CSSProperties
          }
        >
          <AnswerShape shape={piece.shape} style={{ width: (piece.size + 4) * scale, height: (piece.size + 4) * scale }} />
        </span>
      ))}
      {PIECES.map((piece, i) => (
        <span
          key={`rain-${i}`}
          className="absolute top-0"
          style={{
            left: `${piece.left}%`,
            color: piece.color,
            animation: `confetti-fall ${piece.duration}ms linear ${800 + piece.delay}ms infinite both`,
          }}
        >
          <AnswerShape
            shape={piece.shape}
            className="opacity-85"
            style={{ width: piece.size * scale, height: piece.size * scale }}
          />
        </span>
      ))}
    </div>
  )
}
