import { API_URL, apiFetch } from '@/lib/api'
import { getCreatorToken, setCreatorToken } from '@/lib/creatorAuth'

// Question images (Decision #75). Mirrors backend/src/domain/constants.ts
// and domain/imageType.ts; the server re-checks both.
export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const QUESTION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** Longest edge kept on upload. A projector is at most this wide, and
 * shrinking phone photos (often 4000px+, 3-5 MB) before they're stored
 * keeps them to a few hundred KB in Postgres. */
const MAX_EDGE_PX = 1920

export function questionImageUrl(imageId: string): string {
  return `${API_URL}/images/${imageId}`
}

/** Where a question's picture comes from: an upload, else the older
 * external `mediaUrl` field. */
export function questionImageSrc(question: { imageId?: string | null; mediaUrl?: string | null }): string | null {
  if (question.imageId) return questionImageUrl(question.imageId)
  return question.mediaUrl ?? null
}

async function downscale(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file // re-encoding would drop the animation
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height)
  if (scale >= 1) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // PNG stays PNG so transparency survives; everything else becomes JPEG.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  return blob && blob.size < file.size ? blob : file
}

/** Checks, shrinks and uploads one image, returning its id. Registers a
 * Creator first if this browser doesn't have one yet — the Create page
 * only registers on save, but an image has to be uploaded before then. */
export async function uploadQuestionImage(file: File): Promise<string> {
  if (!QUESTION_IMAGE_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF image.')
  if (file.size > QUESTION_IMAGE_MAX_BYTES) throw new Error('That image is over 5 MB. Choose a smaller one.')

  const body = await downscale(file)
  if (!getCreatorToken()) {
    const { token } = await apiFetch<{ token: string }>('/auth/register', { method: 'POST' })
    setCreatorToken(token)
  }
  const { id } = await apiFetch<{ id: string }>('/images', {
    method: 'POST',
    body,
    headers: { 'Content-Type': body.type || file.type },
  })
  return id
}
