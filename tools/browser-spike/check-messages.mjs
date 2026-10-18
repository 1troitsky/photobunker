// Synthetic identities only. Credentials and plaintext stay in memory and never enter reports.
import {chromium,webkit,expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {origin,headers,button,label,accountFixture,cleanupFixtures,monitorRuntime} from './account-qa.mjs'
const ready=async page=>{await expect(page.locator('.messages-screen')).toHaveAttribute('data-connection','ready',{timeout:60000});await expect(page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage','ready',{timeout:60000})}
const visibleMessage=(page,text)=>page.locator('.message-body').filter({hasText:text})
async function closeSheets(page){for(let i=0;i<4&&await page.getByRole('dialog').count();i++)await page.getByRole('button',{name:'Закрыть',exact:true}).last().click()}
async function setup(fixture){const {page}=fixture;await page.goto(`${origin}/messages`);await ready(page);await expect(page.locator('.messages-screen')).toHaveAttribute('data-history-backup','true');return page.evaluate(async()=>{const v=await import('/src/identity/vault.ts');return(await v.readAccountSecrets()).messageKey})}
async function loginKey(page,key,name){await page.goto(`${origin}/profile/account?mode=recover`);await label(page,'Название устройства').fill(name);await label(page,'Ключ аккаунта').fill(key);await button(page,'Готово').click();await expect(page).toHaveURL(`${origin}/profile`,{timeout:30000})}

async function contact(one,two){for(const [owner,person] of [[one,two],[two,one]])assert.equal((await owner.context.request.post(`${origin}/api/v1/identity/contacts`,{headers,data:{publicId:person.me.account.publicId}})).status(),200)}
async function createChat(first,recipients,title=''){const {page}=first;if(await page.locator('.conversation').count())await page.locator('.screen-header').getByRole('button',{name:'Назад',exact:true}).click();await page.locator('.screen-header').getByRole('button',{name:'Новый чат',exact:true}).click();if(title){await button(page,'Создать группу').click();await label(page,'Название чата').fill(title)}if(title){for(const recipient of recipients)await label(page,recipient.me.account.publicId).check();await button(page,'Создать чат').click()}else{await page.locator('.picker-row').filter({hasText:recipients[0].me.account.publicId}).click();await button(page,'Написать').click()}await expect(page.locator('.message-composer')).toBeVisible({timeout:30000})}
async function accept(fixture,chatName){const {page}=fixture;if(await page.locator('.conversation').count())await page.locator('.screen-header').getByRole('button',{name:'Назад',exact:true}).click();await page.locator('.chat-row').filter({hasText:chatName}).click();await expect(page.locator('.message-composer')).toBeVisible({timeout:30000})}
async function send(fixture,text){await label(fixture.page,'Сообщение').fill(text);await button(fixture.page,'Отправить').click();await expect(visibleMessage(fixture.page,text)).toBeVisible({timeout:60000})}
try {
for(const engine of (process.env.MESSAGE_BROWSERS??'chromium,webkit').split(',')){
 const browser=await({chromium,webkit}[engine]).launch({headless:true}),fixtures=[],extraContexts=[]
 const diagnostics={nativePhotoPoll:0}
 const errors=[],encrypted=[],forbidden=[],bodies=[]
 async function monitor(page){
  await monitorRuntime(page,engine,errors,diagnostics)
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/identity')&&response.status()>=400){diagnostics.http??=[];diagnostics.http.push({status:response.status(),path:path.replace(/[-a-f0-9]{36}/g,':id')});diagnostics.http=diagnostics.http.slice(-20)}})
  page.on('request',request=>{const url=new URL(request.url());if(url.origin!==new URL(origin).origin)forbidden.push('external');const body=request.postData()||'';if(url.pathname.startsWith('/api/'))bodies.push(body);if(url.pathname.includes('/send/m.room.')){let parsed;try{parsed=JSON.parse(body)}catch{}encrypted.push({encrypted:url.pathname.includes('/send/m.room.encrypted/'),body:parsed})}})
 }
 try{
  const first=await accountFixture(browser,`${engine} messages first`,fixtures),second=await accountFixture(browser,`${engine} messages second`,fixtures),third=await accountFixture(browser,`${engine} messages third`,fixtures)
  for(const fixture of fixtures)await monitor(fixture.page)
  await contact(first,second);await contact(first,third)
  const firstKey=await setup(first),secondKey=await setup(second);await setup(third)
  console.log(`${engine}: Rust/WASM, cross-signing and encrypted backup configured`)
  await createChat(first,[second]);await accept(second,first.me.account.publicId)
  const text='QA encrypted direct message',answer='QA encrypted reply'
  await send(first,text);await expect(visibleMessage(second.page,text)).toBeVisible({timeout:60000})
  const firstEvent=await visibleMessage(first.page,text).locator('..').getAttribute('data-event-id')
  await second.page.locator('.message-bubble').filter({hasText:text}).dispatchEvent('contextmenu');await button(second.page,'Ответить').click();await send(second,answer);await expect(visibleMessage(first.page,answer)).toBeVisible({timeout:60000});await expect(first.page.locator('.message-bubble').filter({hasText:answer}).locator('blockquote')).toContainText(text)
  await expect(first.page.locator('.message-bubble').filter({hasText:text}).locator('.message-state')).toHaveAttribute('aria-label','Прочитано',{timeout:30000})
  // Human-confirmed SAS verifies identities; no automatic trust is fabricated.
  await first.page.locator('.messenger-chat-header').getByRole('button',{name:'Действия с чатом',exact:true}).click();await button(first.page,'Участники и безопасность').click();await button(first.page,'Проверить собеседника').click();await button(second.page,'Начать проверку').click()
  await expect(first.page.locator('.sas-grid strong')).toHaveCount(7,{timeout:30000});await expect(second.page.locator('.sas-grid strong')).toHaveCount(7,{timeout:30000})
  assert.deepEqual(await first.page.locator('.sas-grid strong').allTextContents(),await second.page.locator('.sas-grid strong').allTextContents())
  await button(first.page,'Эмодзи совпадают').click();await button(second.page,'Эмодзи совпадают').click();await expect(first.page.getByRole('status')).toContainText('Проверка завершена',{timeout:30000});await expect(second.page.getByRole('status')).toContainText('Проверка завершена',{timeout:30000});await closeSheets(first.page);await closeSheets(second.page)
  console.log(`${engine}: encrypted direct messages, replies, server/read receipts and SAS verification passed`)
  await createChat(first,[second,third],'QA encrypted group');await accept(second,'QA encrypted group');await accept(third,'QA encrypted group')
  const groupText='QA encrypted message for three members';await send(first,groupText);await expect(visibleMessage(second.page,groupText)).toBeVisible({timeout:60000});await expect(visibleMessage(third.page,groupText)).toBeVisible({timeout:60000})
  const groupId=await first.page.locator('.messages-screen').getAttribute('data-room')
  // Bilateral blocks stop sending in existing group/direct conversations.
  await createChat(first,[third]);await first.page.locator('.messenger-chat-header').getByRole('button',{name:'Действия с чатом',exact:true}).click();await button(first.page,'Участники и безопасность').click();first.page.once('dialog',dialog=>dialog.accept());await button(first.page,'Заблокировать собеседника').click()
  await expect(third.page.getByRole('alert')).toContainText('В чате есть заблокированный участник',{timeout:30000})
  await expect(third.page.locator('.message-composer')).toHaveCount(0); await third.page.locator('.messenger-chat-header').getByRole('button',{name:'Назад',exact:true}).click()
  assert.equal((await first.context.request.delete(`${origin}/api/v1/identity/blocks/${third.me.account.publicId}`,{headers})).status(),200)
  await first.page.reload();await ready(first.page);await first.page.locator('.chat-row').filter({hasText:'QA encrypted group'}).click()
  await third.page.locator('.chat-row').filter({hasText:'QA encrypted group'}).click();await expect(third.page.locator('.message-composer')).toBeVisible({timeout:30000})
  for(const width of [320,390,768,1440]){await first.page.setViewportSize({width,height:844});assert.ok(await first.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Conversation overflow at ${width}`)}
  await first.page.setViewportSize({width:390,height:844})
  // A second tab never opens the same Rust store concurrently.
  const other=await first.context.newPage();await monitor(other);await other.goto(`${origin}/messages`);await expect(other.locator('.messages-screen')).toHaveAttribute('data-connection','otherTab',{timeout:30000});assert.deepEqual(errors,[]);other.removeAllListeners('pageerror');await other.close();await first.page.bringToFront()
  await first.context.setOffline(true);await expect(first.page.locator('.messages-screen')).toHaveAttribute('data-connection','offline',{timeout:45000});await label(first.page,'Сообщение').fill('QA offline draft');await expect(button(first.page,'Отправить')).toBeDisabled();await first.context.setOffline(false);await ready(first.page);await expect(label(first.page,'Сообщение')).toHaveValue('QA offline draft');await button(first.page,'Отправить').click();await expect(visibleMessage(third.page,'QA offline draft')).toBeVisible({timeout:60000})
  await first.page.reload();await ready(first.page);await expect(first.page.locator('.chat-row').filter({hasText:'QA encrypted group'})).toBeVisible();await first.page.locator('.chat-row').filter({hasText:'QA encrypted group'}).click();await expect(visibleMessage(first.page,groupText)).toBeVisible({timeout:60000})
  // Ordinary logout must rotate the Matrix crypto identity, while preserving explicit device-key login.
  const beforeLogout=await(await first.context.request.post(`${origin}/api/v1/identity/matrix/session`,{headers})).json()
  await first.page.goto(`${origin}/profile`);await button(first.page,'Выйти').click();await button(first.page,'Всё равно выйти').click();await expect(button(first.page,'Войти с ключом аккаунта')).toBeVisible();await expect(first.page.getByRole('button',{name:/^Войти на этом устройстве/})).toHaveCount(0)
  await expect.poll(async()=>(await first.context.request.get(`${origin}/_matrix/client/v3/account/whoami`,{headers:{Authorization:`Bearer ${beforeLogout.accessToken}`}})).status(),{timeout:30000}).toBe(401)
  await loginKey(first.page,first.kit,`QA ${engine} returned messages`);await expect(first.page.locator('.identity-public-id')).toHaveText(first.me.account.publicId)
  const afterLogout=await(await first.context.request.get(`${origin}/api/v1/identity/me`,{headers})).json();assert.notEqual(afterLogout.deviceId,first.me.deviceId)
  await first.page.goto(`${origin}/messages`);await ready(first.page);await expect(first.page.locator('.messages-screen')).toHaveAttribute('data-history-backup','true');await first.page.locator('.chat-row').filter({hasText:'QA encrypted group'}).click();await expect(visibleMessage(first.page,groupText)).toBeVisible({timeout:60000})
  console.log(`${engine}: blocked invite decline, offline/reconnect, encrypted-store reload and logout/history recovery passed`)
  const matrix=await(await first.context.request.post(`${origin}/api/v1/identity/matrix/session`,{headers})).json()
  assert.notEqual(matrix.deviceId,beforeLogout.deviceId)
  const auth={Authorization:`Bearer ${matrix.accessToken}`}
  await expect.poll(async()=>{const response=await first.context.request.get(`${origin}/_matrix/client/v3/room_keys/version`,{headers:auth});return response.ok()?(await response.json()).count:0},{timeout:60000}).toBeGreaterThan(0)
  const backupVersion=(await(await first.context.request.get(`${origin}/_matrix/client/v3/room_keys/version`,{headers:auth})).json()).version
  await expect.poll(async()=>{const response=await first.context.request.get(`${origin}/_matrix/client/v3/room_keys/keys/${encodeURIComponent(groupId)}?version=${encodeURIComponent(backupVersion)}`,{headers:auth});return response.ok()?Object.keys((await response.json()).sessions??{}).length:0},{timeout:60000}).toBeGreaterThan(0)
  const groupEvent=await visibleMessage(first.page,groupText).locator('..').getAttribute('data-event-id')
  const storedEvent=await first.context.request.get(`${origin}/_matrix/client/v3/rooms/${encodeURIComponent(groupId)}/event/${encodeURIComponent(groupEvent)}`,{headers:auth});assert.equal(storedEvent.status(),200);const stored=await storedEvent.json();assert.equal(stored.type,'m.room.encrypted');assert.ok(!JSON.stringify(stored.content).includes(groupText))
  const localKeys=await first.page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('photobunker-message-storage-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject()});const rows=await new Promise(resolve=>{const tx=db.transaction('keys'),request=tx.objectStore('keys').getAll();tx.oncomplete=()=>resolve(request.result)});db.close();return rows.map(row=>({extractable:row.wrappingKey.extractable,encryptedBytes:row.encrypted.byteLength,initialized:row.initialized,raw:!!row.privateKey||!!row.storageKey}))});assert.ok(localKeys.every(row=>!row.extractable&&!row.raw&&row.encryptedBytes===48&&row.initialized))
  // Wire inspection is stronger than a lock icon; text events must be ciphertext.
  const textEvents=encrypted.filter(event=>event.encrypted);assert.ok(textEvents.length>=4&&textEvents.every(event=>event.body?.algorithm==='m.megolm.v1.aes-sha2'));assert.ok(encrypted.every(event=>event.encrypted||event.body?.msgtype==='m.key.verification.request'))
  assert.ok(encrypted.every(event=>![text,answer,groupText].some(plain=>JSON.stringify(event.body).includes(plain))))
  assert.ok(bodies.every(body=>!body.includes(firstKey)&&!body.includes(secondKey)&&!body.includes(firstKey.replaceAll(' ',''))&&!body.includes(first.kit.split('.')[2])))
  // Intentional context shutdown aborts in-flight polling; assert runtime errors before teardown.
  assert.deepEqual(errors,[]);for(const closing of first.context.pages())closing.removeAllListeners('pageerror')
  await first.context.close()
  const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844}});extraContexts.push(context);const page=await context.newPage();await monitor(page)
  await page.goto(`${origin}/profile`);await button(page,'Войти с ключом аккаунта').click();await label(page,'Название устройства').fill(`QA ${engine} recovered messages`);await label(page,'Ключ аккаунта').fill(first.kit);await button(page,'Готово').click();await expect(page).toHaveURL(`${origin}/profile`)
  await page.goto(`${origin}/messages`);await ready(page);// Legacy SDK recovery remains a protocol drill; user recovery already completed with PB1.
  const denied = await page.evaluate(async key=>{const s=await import('/src/messages/store.ts');await s.restoreHistory(key);return s.recoveryError.value},secondKey);assert.equal(denied,'badKey')
  await page.evaluate(async key=>{const s=await import('/src/messages/store.ts');await s.restoreHistory(key);if(s.recoveryError.value)throw new Error('legacy_restore_failed')},firstKey)
  await page.locator('.chat-row').filter({hasText:'QA encrypted group'}).click();await expect(visibleMessage(page,groupText)).toBeVisible({timeout:60000});await send({page},'QA new verified device message');await expect(visibleMessage(third.page,'QA new verified device message')).toBeVisible({timeout:60000})
  const recoveredMe=await(await context.request.get(`${origin}/api/v1/identity/me`,{headers})).json()
  const observer=await browser.newContext({locale:'ru-RU'});extraContexts.push(observer);const observerPage=await observer.newPage();await observerPage.goto(`${origin}/profile`);await button(observerPage,'Войти с ключом аккаунта').click();await label(observerPage,'Название устройства').fill(`QA ${engine} revoke observer`);await label(observerPage,'Ключ аккаунта').fill(first.kit);await button(observerPage,'Готово').click();await expect(observerPage).toHaveURL(`${origin}/profile`)
  assert.equal((await observer.request.delete(`${origin}/api/v1/identity/devices/${recoveredMe.deviceId}`,{headers})).status(),200)
  await expect(page.getByRole('heading',{name:'Аккаунт не подключён',exact:true})).toBeVisible({timeout:45000});await expect(visibleMessage(page,groupText)).toHaveCount(0)
  assert.equal((await observer.request.get(`${origin}/_matrix/client/v3/account/whoami`,{headers:auth})).status(),200) // old separate device remains valid until its explicit revoke
  // Account switching during a held encrypted-backup download must clear private recovery UI.
  const raceContext=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844}});extraContexts.push(raceContext);const racePage=await raceContext.newPage();await monitor(racePage)
  await racePage.goto(`${origin}/profile/account?mode=recover`);await label(racePage,'Название устройства').fill(`QA ${engine} interrupted restore`);await label(racePage,'Ключ аккаунта').fill(first.kit);await button(racePage,'Готово').click();await expect(racePage).toHaveURL(`${origin}/profile`);await racePage.goto(`${origin}/messages`);await ready(racePage);await expect(racePage.locator('.messages-screen')).toHaveAttribute('data-device-verified','true')
  let releaseUpload,uploadSeen;const held=new Promise(resolve=>{releaseUpload=resolve}),seen=new Promise(resolve=>{uploadSeen=resolve})
  await racePage.route('**/_matrix/client/*/room_keys/keys?*',async route=>{uploadSeen();await held;await route.continue().catch(()=>{})})
  try{
   const restoring=racePage.evaluate(async key=>{const s=await import('/src/messages/store.ts');await s.restoreHistory(key)},firstKey);await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Encrypted-backup cancellation probe not reached')),20000))])
   const switchPage=await raceContext.newPage();await switchPage.goto(`${origin}/profile/account?mode=recover`);await label(switchPage,'Название устройства').fill(`QA ${engine} switched restore`);await label(switchPage,'Ключ аккаунта').fill(second.kit);await button(switchPage,'Готово').click();await expect(switchPage).toHaveURL(`${origin}/profile`);releaseUpload();await racePage.bringToFront();await ready(racePage);await expect(racePage.getByRole('dialog')).toHaveCount(0);await restoring;assert.equal(await racePage.evaluate(async()=>{const s=await import('/src/messages/store.ts');return s.recoveryText.value}), '');await expect(racePage.locator('.messages-screen')).toHaveAttribute('data-device-verified','true')
  }finally{releaseUpload()}
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[])
  if(diagnostics.nativePhotoPoll)console.log(`${engine}: ${diagnostics.nativePhotoPoll} native photo-poll transport diagnostics; zero window errors/unhandled rejections`)
  console.log(`${engine}: three-member E2EE group, protected wire payloads, one crypto owner, offline/reconnect, encrypted-store reload, wrong recovery denial, actual history backup restore, new verified device, live revoke, blocked-invite decline and account-switch cancellation passed`)
 }catch(error){for(const f of fixtures)console.error(await f.page.evaluate(async()=>{const s=await import('/src/messages/store.ts');return{phase:s.verificationPhase.value,sas:!!s.sas.value,request:!!s.verification.value,messages:s.messages.value.map(({locked,decryptionFailure,status})=>({locked,decryptionFailure,status}))}}).catch(()=>({closed:true})));for(const context of extraContexts)for(const page of context.pages())console.error(await page.evaluate(()=>({path:location.pathname,crypto:document.querySelector('.messages-screen')?.getAttribute('data-crypto-stage'),connection:document.querySelector('.messages-screen')?.getAttribute('data-connection'),inputs:document.querySelectorAll('input').length,alerts:document.querySelectorAll('[role=alert]').length})).catch(()=>({closed:true})));console.error(JSON.stringify({errors,diagnostics}));throw error}finally{await Promise.all(extraContexts.map(context=>context.close()));await cleanupFixtures(fixtures);await browser.close()}
}

} catch (error) {
  console.error(`Messaging QA failed (${error.name}); location only, private form values omitted.`)
  console.error(String(error.stack).split("\n").filter(line=>line.trim().startsWith("at ")&&line.includes("check-messages.mjs")).join("\n"))
  process.exitCode=1
}
