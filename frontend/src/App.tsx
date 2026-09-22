import { Navigate, Route, Routes } from 'react-router-dom'
import { CreateQuizPage } from '@/pages/CreateQuizPage'
import { DisplayPage } from '@/pages/DisplayPage'
import { EditQuizPage } from '@/pages/EditQuizPage'
import { HostPage } from '@/pages/HostPage'
import { JoinPage } from '@/pages/JoinPage'
import { PlayPage } from '@/pages/PlayPage'
import { ResultsPage } from '@/pages/ResultsPage'

// Route table per ARCHITECTURE.md §5 — one React app, role-driven by route.
function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/join" replace />} />
      <Route path="/create" element={<CreateQuizPage />} />
      <Route path="/quizzes/:quizId/edit" element={<EditQuizPage />} />
      <Route path="/host/:sessionId" element={<HostPage />} />
      <Route path="/display/:sessionId" element={<DisplayPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/play/:sessionId" element={<PlayPage />} />
      <Route path="/results/:sessionId" element={<ResultsPage />} />
    </Routes>
  )
}

export default App
