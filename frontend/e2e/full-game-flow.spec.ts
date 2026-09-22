import { expect, test } from '@playwright/test'

// End-to-end automation of the manual pass in docs/FRONTEND_PLAN.md:
// create a quiz -> start a session -> Host/Display/Play in sync ->
// lock/reveal/leaderboard -> end -> results/podium. Requires the
// docker-compose stack to already be running (see docs/FRONTEND_PLAN.md
// "Local dev environment") — this suite does not manage that lifecycle.
test('full game flow: create, host, play, and view results', async ({ browser }) => {
  const playerName = `Player-${Date.now()}`
  const quizTitle = `E2E Quiz ${Date.now()}`

  // Each persona gets its own browser context so localStorage (Creator
  // token, participant token) doesn't leak between them, matching how
  // separate real devices would behave.
  const creatorContext = await browser.newContext()
  const creatorPage = await creatorContext.newPage()

  await creatorPage.goto('/create')
  await creatorPage.getByPlaceholder('Quiz title').fill(quizTitle)
  await creatorPage.getByPlaceholder('Question text').fill('What is 2 + 2?')
  await creatorPage.getByPlaceholder('Option 1').fill('3')
  await creatorPage.getByPlaceholder('Option 2').fill('4')
  await creatorPage.getByRole('radio', { name: 'Option 2 is correct' }).check()
  await creatorPage.getByRole('button', { name: 'Create quiz' }).click()

  await expect(creatorPage).toHaveURL(/\/quizzes\/.+\/edit/)
  await creatorPage.getByRole('button', { name: 'Start session' }).click()

  const sessionBanner = creatorPage.getByText(/Session started — join code: /)
  await expect(sessionBanner).toBeVisible()
  const joinCode = (await sessionBanner.textContent())?.match(/join code: (\w+)/)?.[1]
  expect(joinCode).toBeTruthy()

  const hostHref = await creatorPage.getByRole('link', { name: 'Open Host Controller' }).getAttribute('href')
  const displayHref = await creatorPage.getByRole('link', { name: 'Open Display' }).getAttribute('href')
  expect(hostHref).toBeTruthy()
  expect(displayHref).toBeTruthy()

  const hostContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  await hostPage.goto(hostHref!)
  await expect(hostPage.getByText('Host Controller')).toBeVisible()
  await expect(hostPage.getByText('LOBBY', { exact: true })).toBeVisible()

  const displayContext = await browser.newContext()
  const displayPage = await displayContext.newPage()
  await displayPage.goto(displayHref!)
  await expect(displayPage.getByText('Waiting for the host to start the game')).toBeVisible()

  const playerContext = await browser.newContext()
  const playerPage = await playerContext.newPage()
  await playerPage.goto('/join')
  await playerPage.getByLabel('Join code').fill(joinCode!)
  await playerPage.getByLabel('Your name').fill(playerName)
  await playerPage.getByRole('button', { name: 'Join' }).click()

  // Realtime lobby update: Host should see the player join.
  await expect(hostPage.getByText(playerName)).toBeVisible()

  await hostPage.getByRole('button', { name: 'Start game' }).click()

  // Same question, same color/shape mapping, on both Host/Display/Play
  // (Decision #48) — assert the "4" option renders on all three.
  await expect(hostPage.getByText('What is 2 + 2?')).toBeVisible()
  await expect(displayPage.getByText('What is 2 + 2?')).toBeVisible()
  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()

  await playerPage.getByRole('button', { name: '4', exact: true }).click()

  await hostPage.getByRole('button', { name: 'Lock question' }).click()

  // Server-authoritative scoring feedback on the player's own screen.
  // Points earned depend on the time-bracket scoring model (PRD §5) —
  // assert the shape, not an exact value, since answer latency varies.
  await expect(playerPage.getByText('Correct!')).toBeVisible()
  const pointsText = await playerPage.getByText(/^\+\d+ points$/).textContent()
  const pointsEarned = pointsText?.match(/\+(\d+) points/)?.[1]
  expect(pointsEarned).toBeTruthy()
  await expect(playerPage.getByText('Rank 1 of 1')).toBeVisible()

  // Only question in the quiz — Next ends the game.
  await hostPage.getByRole('button', { name: 'Next' }).click()
  await expect(hostPage.getByText('Game ended.')).toBeVisible()
  await expect(displayPage.getByText('Game over!')).toBeVisible()

  // PlayPage auto-navigates to /results/:sessionId on game:ended.
  await expect(playerPage).toHaveURL(/\/results\/.+/)
  await expect(playerPage.getByText('Final Results')).toBeVisible()
  await expect(playerPage.getByText(playerName)).toBeVisible()
  await expect(playerPage.getByText(`${pointsEarned} pts`)).toBeVisible()

  await creatorContext.close()
  await hostContext.close()
  await displayContext.close()
  await playerContext.close()
})
