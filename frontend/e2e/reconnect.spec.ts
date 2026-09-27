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

  // A second player who never answers keeps the question open while the
  // first one reloads — otherwise the first answer would close it at once
  // (Decision #63) and there'd be no "mid-question" to reconnect into.
  const bystanderName = `Bystander-${Date.now()}`
  const bystanderContext = await browser.newContext()
  const bystanderPage = await bystanderContext.newPage()
  await joinAsPlayer(bystanderPage, joinCode, bystanderName)

  // Both must be in the lobby before the start — anyone joining after it
  // becomes a spectator, which would leave one player whose answer closes
  // the question immediately.
  await expect(hostPage.getByText(playerName)).toBeVisible()
  await expect(hostPage.getByText(bystanderName)).toBeVisible()
  await hostPage.getByRole('button', { name: 'Start game' }).click()
  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()

  // Answer, then drop the connection (page reload) *before* the host
  // locks — reconnect must rehydrate the still-active question with the
  // answer already marked as submitted, not reset to the lobby.
  await playerPage.getByRole('button', { name: '4', exact: true }).click()
  // Wait for the server's answer:ack before reloading — otherwise the
  // reload can tear the page down before answer:submit ever leaves it.
  await expect(playerPage.getByText(/Answer received/)).toBeVisible()
  await playerPage.reload()

  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()
  await expect(playerPage.getByRole('button', { name: '4', exact: true })).toBeDisabled()
  await expect(playerPage.getByText(/Answer received/)).toBeVisible()

  // Host locks (the bystander still owes an answer) while the player is on
  // the just-reloaded page — also keeps the manual-lock path covered.
  await hostPage.getByRole('button', { name: 'Lock question' }).click()
  await expect(playerPage.getByText('Correct!')).toBeVisible()

  // Drop the connection again, now after lock/reveal — reconnect must
  // rehydrate the result screen, not the lobby or the stale question.
  await playerPage.reload()
  await expect(playerPage.getByText('Correct!')).toBeVisible()
  await expect(playerPage.getByText('Rank 1 of 2')).toBeVisible()

  await creatorContext.close()
  await hostContext.close()
  await playerContext.close()
  await bystanderContext.close()
})

// Decision #64: a Host refreshing mid-game used to come back with no
// question and no Lock/Next buttons — the game could never advance again.
test('host refreshing mid-question keeps control of the game', async ({ browser }) => {
  const creatorContext = await browser.newContext()
  const creatorPage = await creatorContext.newPage()
  const { joinCode, hostHref } = await createQuizAndStartSession(creatorPage, `Host Refresh Quiz ${Date.now()}`)

  const hostContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  await hostPage.goto(hostHref)

  const playerName = `Host-${Date.now()}` // names cap at 24 chars
  const playerContext = await browser.newContext()
  const playerPage = await playerContext.newPage()
  await joinAsPlayer(playerPage, joinCode, playerName)
  await expect(hostPage.getByText(playerName)).toBeVisible()

  await hostPage.getByRole('button', { name: 'Start game' }).click()
  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()

  await hostPage.reload()
  await expect(hostPage.getByText('What is 2 + 2?')).toBeVisible()
  await hostPage.getByRole('button', { name: 'Lock question' }).click()
  await expect(playerPage.getByText("Time's up!")).toBeVisible() // player never answered

  await hostPage.reload()
  await hostPage.getByRole('button', { name: 'Next' }).click() // only question — ends the game
  await expect(hostPage.getByText('Game ended.')).toBeVisible()
  await expect(playerPage).toHaveURL(/\/results\/.+/)

  await creatorContext.close()
  await hostContext.close()
  await playerContext.close()
})
