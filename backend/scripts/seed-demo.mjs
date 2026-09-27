// Local demo helper: creates a quiz full of dummy questions and starts a
// live session on it, then prints the Host / Display / Join links — so the
// whole game can be tried from several browser windows in a minute.
//
// Goes through the real REST API (not Prisma directly), so the quiz gets
// the same validation as one made in the Creator UI. Needs the stack
// running (`docker compose up` from the repo root).
//
//   npm run demo                 (from backend/)
//   API_URL=... APP_URL=... npm run demo   to point elsewhere
//
// Sessions live in the backend's memory: restarting the backend ends them,
// so just re-run this for a fresh game.

const API_URL = process.env.API_URL ?? 'http://localhost:3000'
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'

const QUIZ = {
  title: 'Pulz Demo: General Knowledge',
  questions: [
    {
      text: 'Which planet is known as the Red Planet?',
      timeLimitSeconds: 20,
      options: [
        { text: 'Venus', isCorrect: false },
        { text: 'Mars', isCorrect: true },
        { text: 'Jupiter', isCorrect: false },
        { text: 'Mercury', isCorrect: false },
      ],
    },
    {
      text: 'What is 7 × 8?',
      timeLimitSeconds: 15,
      options: [
        { text: '54', isCorrect: false },
        { text: '56', isCorrect: true },
        { text: '64', isCorrect: false },
        { text: '48', isCorrect: false },
      ],
    },
    {
      text: 'The Great Wall of China is visible from the Moon with the naked eye.',
      timeLimitSeconds: 15,
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      text: 'Which language has the most native speakers?',
      timeLimitSeconds: 20,
      options: [
        { text: 'English', isCorrect: false },
        { text: 'Hindi', isCorrect: false },
        { text: 'Mandarin Chinese', isCorrect: true },
        { text: 'Spanish', isCorrect: false },
      ],
    },
    {
      text: 'How many sides does a hexagon have?',
      timeLimitSeconds: 10,
      options: [
        { text: '5', isCorrect: false },
        { text: '6', isCorrect: true },
        { text: '8', isCorrect: false },
      ],
    },
    {
      text: 'What is the chemical symbol for gold?',
      timeLimitSeconds: 20,
      options: [
        { text: 'Go', isCorrect: false },
        { text: 'Gd', isCorrect: false },
        { text: 'Au', isCorrect: true },
        { text: 'Ag', isCorrect: false },
      ],
    },
    {
      text: 'Which ocean is the largest?',
      timeLimitSeconds: 20,
      options: [
        { text: 'Atlantic', isCorrect: false },
        { text: 'Indian', isCorrect: false },
        { text: 'Arctic', isCorrect: false },
        { text: 'Pacific', isCorrect: true },
      ],
    },
    {
      text: 'Who painted the Mona Lisa?',
      timeLimitSeconds: 20,
      options: [
        { text: 'Leonardo da Vinci', isCorrect: true },
        { text: 'Michelangelo', isCorrect: false },
        { text: 'Raphael', isCorrect: false },
      ],
    },
  ],
}

async function post(path, body, token) {
  let res
  try {
    res = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new Error(`Can't reach the backend at ${API_URL} — is \`docker compose up\` running?`)
  }
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

try {
  const { token } = await post('/auth/register')
  const quiz = await post('/quizzes', QUIZ, token)
  const session = await post(`/quizzes/${quiz.id}/sessions`, {}, token)

  console.log(`
Demo quiz "${QUIZ.title}" (${QUIZ.questions.length} questions) is live.

  Join code:  ${session.joinCode}

  Host (runs the game):     ${APP_URL}/host/${session.sessionId}?token=${session.hostToken}
  Display (the big screen): ${APP_URL}/display/${session.sessionId}?token=${session.displayToken}
  Players join at:          ${APP_URL}/join

Host and Display can share a browser with anyone. Each *player* needs its
own browser or profile (e.g. Chrome, a Chrome incognito window, Safari,
Firefox): tabs in one browser share storage, so a second player joined
there overwrites the first one's saved identity.
`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
