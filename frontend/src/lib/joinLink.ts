// Where players join, in the two forms the screens need: a short label to
// read off a projector, and the full link (code included) behind the QR
// code, which lands on /join with the code filled in (Decision #77).

export function joinPageLabel(): string {
  return `${window.location.host}/join`
}

export function joinPageUrl(joinCode: string): string {
  return `${window.location.origin}/join?code=${encodeURIComponent(joinCode)}`
}
