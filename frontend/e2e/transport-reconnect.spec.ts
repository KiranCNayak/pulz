import { expect, type Page, test } from '@playwright/test'
import { createQuizAndStartSession, joinAsPlayer } from './helpers'

// Exercises the narrower gap Decision #53 left open: a pure
// transport-level drop (e.g. a brief WiFi blip) that Socket.IO's own
// client recovers from automatically, WITHOUT the page ever reloading.
// Before this fix, useGameSocket only emitted the role-appropriate
// join/auth event once on mount — an automatic reconnect re-established
// the transport but never re-sent join:request/host:auth/display:auth,
// so the server never knew the client was back.
//
// `page.context().setOffline()` was tried first but proved unreliable:
// verified via a throwaway diagnostic that it does not tear down an
// already-open WebSocket to a localhost server in this environment (the
// connection just... keeps working), which would make this test pass
// vacuously regardless of whether the fix exists. Instead this forces a
// real transport close via the Engine.IO client directly
// (`window.__pulzSocket.io.engine.close()`, a DEV-only test hook added
// in frontend/src/lib/socket.ts).
async function forceTransportDropAndWaitForRejoin(page: Page): Promise<void> {
  // Arm a one-shot listener for the *next* join:accepted BEFORE closing
  // the transport, so we deterministically know the server has
  // re-associated the new connection with this participant (rather than
  // guessing with a fixed timeout — client-side React state isn't
  // cleared by the disconnect, so the DOM alone doesn't prove the
  // server-side reconnect actually completed).
  const rejoinPromise = page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const w = window as unknown as { __pulzSocket?: { once: (event: string, cb: () => void) => void } }
      w.__pulzSocket?.once('join:accepted', () => resolve())
    })
  })

  await page.evaluate(() => {
    const w = window as unknown as { __pulzSocket?: { io: { engine: { close: () => void } } } }
    w.__pulzSocket?.io.engine.close()
  })

  await rejoinPromise
}

test('player survives a transport-level drop without reloading the page', async ({ browser }) => {
  const playerName = `Transport-${Date.now()}`
  const quizTitle = `Transport Quiz ${Date.now()}`

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

  // No page.reload() anywhere in this test — only a forced transport
  // close, which Socket.IO's client detects and auto-reconnects from.
  await forceTransportDropAndWaitForRejoin(playerPage)

  // The question is still visible (client-side state was never cleared
  // by the disconnect) — the real proof of the fix is that the server
  // re-associated the new connection, so the player can still answer and
  // get scored.
  await expect(playerPage.getByText('What is 2 + 2?')).toBeVisible()
  const answerButton = playerPage.getByRole('button', { name: '4', exact: true })
  await answerButton.click()

  // The only player answering closes the question by itself (Decision
  // #63) — which only happens if the server counts the freshly-reconnected
  // socket as this participant, still connected.
  await expect(playerPage.getByText('Correct!')).toBeVisible()

  await creatorContext.close()
  await hostContext.close()
  await playerContext.close()
})
