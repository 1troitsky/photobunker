// A legacy encrypted room predates automatic membership and uses joined history.
import { chromium, webkit, expect } from '@playwright/test'
import { origin, headers, button, label, accountFixture, cleanupFixtures } from './account-qa.mjs'
for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
 const browser=await({chromium,webkit}[engine]).launch({headless:true}), fixtures=[]
 let stage='accounts'
 try {
  const a=await accountFixture(browser,`${engine} legacy chat sender`,fixtures), b=await accountFixture(browser,`${engine} legacy chat receiver`,fixtures)
  await a.page.goto(`${origin}/messages`); await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage','ready',{timeout:90000})
  const session=await(await a.context.request.post(`${origin}/api/v1/identity/matrix/session`,{headers})).json()
  const response=await a.context.request.post(`${origin}/_matrix/client/v3/createRoom`,{headers:{Authorization:`Bearer ${session.accessToken}`},data:{preset:'private_chat',is_direct:true,invite:[b.me.account.matrix.userId],power_level_content_override:{redact:0},initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}},{type:'org.photobunker.chat',state_key:'',content:{kind:'direct',version:1}},{type:'m.room.history_visibility',state_key:'',content:{history_visibility:'joined'}}]}})
  expect(response.status()).toBe(200)
  stage='legacy-auto-join'
  await b.page.goto(`${origin}/messages`); await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage','ready',{timeout:90000})
  await expect(b.page.locator('.chat-row')).toHaveCount(1,{timeout:30000}); await b.page.locator('.chat-row').click(); await expect(b.page.locator('.message-composer')).toBeVisible()
  await expect(b.page.getByRole('button',{name:/^Приглашения/})).toHaveCount(0)
  await expect(a.page.locator('.chat-row')).toHaveCount(1,{timeout:30000}); await a.page.locator('.chat-row').click()
  stage='legacy-send'
  await label(a.page,'Сообщение').fill('QA legacy direct conversation'); await button(a.page,'Отправить').click()
  await expect(b.page.locator('.message-body').filter({hasText:'QA legacy direct conversation'})).toBeVisible({timeout:30000})
  await label(b.page,'Сообщение').fill('QA legacy reply'); await button(b.page,'Отправить').click(); await expect(a.page.locator('.message-body').filter({hasText:'QA legacy reply'})).toBeVisible({timeout:30000})
  const room=await a.page.locator('.messages-screen').getAttribute('data-room')
  const history=await(await a.context.request.get(`${origin}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/state/m.room.history_visibility`,{headers:{Authorization:`Bearer ${session.accessToken}`}})).json()
  expect(history.history_visibility).toBe('invited')
  console.log(`${engine}: legacy invitation automatically joined, existing room normalized, encrypted text and reply received without requests`)
 } catch(error){console.error(`${engine}: legacy chat failed at ${stage} (${error.name})`);throw error}
 finally {await cleanupFixtures(fixtures);await browser.close()}
}
