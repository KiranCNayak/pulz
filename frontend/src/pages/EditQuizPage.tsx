import { useParams } from 'react-router-dom'

// Creator flow: /quizzes/:quizId/edit — edit an existing quiz. Not implemented yet.
export function EditQuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  return <div>Edit Quiz {quizId} — not implemented yet</div>
}
