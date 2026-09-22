import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { CreateQuizInput, Question, QuestionInput, Quiz } from '@/types/quiz'

const quizKey = (quizId: string) => ['quiz', quizId] as const

export function useQuiz(quizId: string | undefined) {
  return useQuery({
    queryKey: quizId ? quizKey(quizId) : ['quiz', 'unknown'],
    queryFn: () => apiFetch<Quiz>(`/quizzes/${quizId}`),
    enabled: Boolean(quizId),
  })
}

export function useCreateQuiz() {
  return useMutation({
    mutationFn: (input: CreateQuizInput) =>
      apiFetch<Quiz>('/quizzes', { method: 'POST', body: JSON.stringify(input) }),
  })
}

export function useUpdateQuizTitle(quizId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      apiFetch<Quiz>(`/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify({ title }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quizKey(quizId) }),
  })
}

export function useAddQuestion(quizId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: QuestionInput) =>
      apiFetch<Question>(`/quizzes/${quizId}/questions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quizKey(quizId) }),
  })
}

export function useUpdateQuestion(quizId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ questionId, input }: { questionId: string; input: Partial<QuestionInput> }) =>
      apiFetch<Question>(`/quizzes/${quizId}/questions/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quizKey(quizId) }),
  })
}

export function useDeleteQuestion(quizId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (questionId: string) =>
      apiFetch<void>(`/quizzes/${quizId}/questions/${questionId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quizKey(quizId) }),
  })
}
