import { expect, test } from '@playwright/test'
import { createQuizAndStartSession, joinAsPlayer } from './helpers'

// Exercises the gap CLAUDE.md flagged as untested: "reconnect hasn't been
// tested against an actual dropped connection (only a fresh join was
// exercised)". `page.reload()` fully tears down the socket connection and
// remounts PlayPage — the same "page refresh" scenario ARCHITECTURE.md §6
// names explicitly — then re-sends join:request with the stored
// participant token. Before this test's corresponding fix
// (gameLoop.service.ts's buildResumeSnapshot), a reconnect mid-question
// landed the player back on the lobby screen with no way to see the
// active question; this asserts it now rehydrates correctly instead.
test('player reconnecting mid-question and after lock rehydrates instead of resetting to lobby', async ({
  browser,
}) => {
  const playerName = `Reconnect-${Date.now()}`
  const quizTitle = `Reconnect Quiz ${Date.now()}`

  const creatorContext = await browser.newContext()
  const creatorPage = await creatorContext.newPage()
  const { joinCode, hostHref } = await createQuizAndStartSession(creatorPage, quizTitle)

  const hostContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  await hostPage.goto(hostHref)

  const playerContext = await browser.newContext()
  const playerPage = await playerContext.newPage()
  await joinAsPlayer(playerPage, joinCode, playerName)

  await expect(hostPage.getByText(playerName)).toBeVisible()
  await hostPage.getByRole('button', { name: 'Start game' }).click()
  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()

  // Answer, then drop the connection (page reload) *before* the host
  // locks — reconnect must rehydrate the still-active question with the
  // answer already marked as submitted, not reset to the lobby.
  await playerPage.getByRole('button', { name: '4', exact: true }).click()
  await playerPage.reload()

  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()
  await expect(playerPage.getByRole('button', { name: '4', exact: true })).toBeDisabled()

  // Host locks while the player is on the just-reloaded page.
  await hostPage.getByRole('button', { name: 'Lock question' }).click()
  await expect(playerPage.getByText('Correct!')).toBeVisible()

  // Drop the connection again, now after lock/reveal — reconnect must
  // rehydrate the result screen, not the lobby or the stale question.
  await playerPage.reload()
  await expect(playerPage.getByText('Correct!')).toBeVisible()
  await expect(playerPage.getByText('Rank 1 of 1')).toBeVisible()

  await creatorContext.close()
  await hostContext.close()
  await playerContext.close()
})
