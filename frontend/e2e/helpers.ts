import { expect, type Page } from '@playwright/test'

export async function createQuizAndStartSession(
  creatorPage: Page,
  quizTitle: string,
): Promise<{ joinCode: string; hostHref: string; displayHref: string }> {
  await creatorPage.goto('/create')
  await creatorPage.getByLabel('Quiz title').fill(quizTitle)
  await creatorPage.getByLabel('Question 1').fill('What is 2 + 2?')
  await creatorPage.getByPlaceholder('Option 1').fill('3')
  await creatorPage.getByPlaceholder('Option 2').fill('4')
  // .click() rather than .check(): the radio is a custom base-ui
  // component (frontend/src/components/ui/radio-group.tsx), not a native
  // <input type="radio">, and Playwright's .check() proved unreliable
  // against it in practice.
  await creatorPage.getByRole('radio', { name: 'Option 2 is correct' }).click()
  await creatorPage.getByRole('button', { name: 'Create quiz' }).click()

  await expect(creatorPage).toHaveURL(/\/quizzes\/.+\/edit/)
  await creatorPage.getByRole('button', { name: 'Start session' }).click()

  const joinCodeLocator = creatorPage.getByTestId('session-join-code')
  await expect(joinCodeLocator).toBeVisible()
  const joinCode = await joinCodeLocator.textContent()
  if (!joinCode) throw new Error('join code not found on Edit Quiz page')

  const hostHref = await creatorPage.getByRole('link', { name: 'Open Host Controller' }).getAttribute('href')
  const displayHref = await creatorPage.getByRole('link', { name: 'Open Display' }).getAttribute('href')
  if (!hostHref || !displayHref) throw new Error('Host/Display links not found on Edit Quiz page')

  return { joinCode, hostHref, displayHref }
}

export async function joinAsPlayer(playerPage: Page, joinCode: string, playerName: string): Promise<void> {
  await playerPage.goto('/join')
  await playerPage.getByLabel('Join code').fill(joinCode)
  await playerPage.getByLabel('Your name').fill(playerName)
  await playerPage.getByRole('button', { name: 'Join' }).click()
}
