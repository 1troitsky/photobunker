// Local, synthetic B01 identities. Recovery keys and Matrix tokens stay in memory.
import { chromium, webkit, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {enrollPhotos,preparePhotos} from './photo-qa.mjs'
import {monitorRuntime,labelQaDevice} from './account-qa.mjs'
import {command,readyMatrix,matrixRestoreDrill} from './matrix-drill.mjs'
const origin=process.env.LOCAL_APP_URL??'http://localhost:8080'
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw new Error('Use a local test origin')
const button=(page,name)=>page.getByRole('button',{name,exact:true})
const label=(page,name)=>page.getByLabel(name,{exact:true})
const headers={'X-PhotoBunker':'identity-v1','Origin':origin}
for(const name of (process.env.IDENTITY_BROWSERS??'chromium,webkit').split(',')){
 const browser=await({chromium,webkit}[name]).launch({headless:true})
 const contexts=[],errors=[],bodies=[],fixtures=[];let matrixStopped=false
 async function client(){const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844}});contexts.push(context);const page=await context.newPage();await monitorRuntime(page,name,errors,{nativePhotoPoll:0});page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/v1/identity'))bodies.push(request.postData()??'')});return {context,page}}
 async function create(page,deviceName){await page.goto(`${origin}/profile`);await button(page,'Создать аккаунт').click();await button(page,'Создать аккаунт').click();const kit=await label(page,'Ключ аккаунта').inputValue();await label(page,'Я сохранил ключ восстановления').check();await button(page,'Готово').click();await expect(page).toHaveURL(`${origin}/profile`);await labelQaDevice(page,deviceName);await expect(page.locator('.identity-public-id')).toBeVisible();if(matrixStopped)await expect(page.locator('.form-notice').filter({hasText:'Защищённые сообщения пока недоступны'})).toBeVisible({timeout:60000});const me=await page.evaluate(async()=>{const response=await fetch('/api/v1/identity/me',{headers:{'X-PhotoBunker':'identity-v1'}});return response.json()});fixtures.push({id:me.account.id,fingerprint:createHash('sha256').update(kit.split('.')[1]).digest('hex')});return {kit,me}}
 try{
  const first=await client(),second=await client();const one=await create(first.page,`QA ${name} first`),two=await create(second.page,`QA ${name} second`)
  await button(second.page,'Изменить анкету').click();await label(second.page,'Имя').fill('QA identity fixture');await label(second.page,'Email').fill('invalid');await button(second.page,'Сохранить').click();await expect(second.page.getByRole('alert')).toContainText('Проверьте Email');await label(second.page,'Email').fill('private@example.invalid');await label(second.page,'О себе').fill('QA contacts only');await label(second.page,'Кто видит: Имя').selectOption('public');await label(second.page,'Кто видит: О себе').selectOption('contacts');let failSave=true;await second.page.route('**/api/v1/identity/profile',route=>{if(failSave){failSave=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'})}return route.continue()});await button(second.page,'Сохранить').click();await expect(second.page.getByRole('alert')).toContainText('Изменения остались в форме');await expect(label(second.page,'Имя')).toHaveValue('QA identity fixture');await button(second.page,'Сохранить').click();await expect(second.page).toHaveURL(`${origin}/profile`);await expect(second.page.getByRole('status')).toContainText('Анкета сохранена');await second.page.reload();await expect(second.page.locator('.account-card')).toContainText('QA identity fixture');await expect(second.page.locator('.account-fields')).toContainText('private@example.invalid')
  let response=await first.context.request.get(`${origin}/api/v1/identity/people/${two.me.account.publicId}`,{headers});let person=await response.json();assert.deepEqual(Object.keys(person.fields),['name']);assert.ok(!JSON.stringify(person).includes(two.me.account.id))
  await first.page.getByRole('link',{name:'Контакты',exact:true}).click();await label(first.page,'Найти по ID').fill(two.me.account.publicId);await button(first.page,'Поиск').click();await button(first.page,'Добавить в контакты').click();await expect(first.page.locator('.person-screen')).toContainText('В ваших контактах')
  await second.page.getByRole('link',{name:'Контакты',exact:true}).click();await label(second.page,'Найти по ID').fill(one.me.account.publicId);await button(second.page,'Поиск').click();await button(second.page,'Добавить в контакты').click();await expect(second.page.locator('.person-screen')).toContainText('В ваших контактах')
  response=await first.context.request.get(`${origin}/api/v1/identity/people/${two.me.account.publicId}`,{headers});person=await response.json();assert.equal(person.fields.about,'QA contacts only');assert.ok(!('email'in person.fields))
  // A second tab must discard a private stale edit when the shared browser signs out.
  const otherTab=await second.context.newPage();await monitorRuntime(otherTab,name,errors,{nativePhotoPoll:0});await otherTab.goto(`${origin}/profile/edit`);await label(otherTab,'Имя').fill('QA unsaved tab')
  await second.page.goto(`${origin}/profile`);await button(second.page,'Выйти').click();await button(second.page,'Всё равно выйти').click();await expect(otherTab).toHaveURL(`${origin}/profile`);await expect(button(otherTab,'Создать аккаунт')).toBeVisible()
  await second.page.goto(`${origin}/profile/account?mode=recover`);await label(second.page,'Ключ аккаунта').fill(two.kit);await button(second.page,'Готово').click();await expect(second.page).toHaveURL(`${origin}/profile`);await labelQaDevice(second.page,`QA ${name} second returned`);await expect(second.page.locator('.identity-public-id')).toHaveText(two.me.account.publicId);await otherTab.close()
  await first.page.getByRole('navigation').getByRole('link',{name:'Сообщения',exact:true}).click();await expect(first.page.locator('.messages-screen')).toHaveAttribute('data-connection','ready',{timeout:60000})
  const beforeLogout=await(await first.context.request.post(`${origin}/api/v1/identity/matrix/session`,{headers})).json()
  // Logout ends both sessions; the persisted non-extractable device key permits explicit login.
  await first.page.goto(`${origin}/profile`);await button(first.page,'Выйти').click();await button(first.page,'Всё равно выйти').click();await expect(button(first.page,'Создать аккаунт')).toBeVisible();await expect.poll(async()=>(await first.context.request.get(`${origin}/_matrix/client/v3/account/whoami`,{headers:{Authorization:`Bearer ${beforeLogout.accessToken}`}})).status(),{timeout:30000}).toBe(401);await first.page.reload();await first.page.goto(`${origin}/profile/account?mode=recover`);await label(first.page,'Ключ аккаунта').fill(one.kit);await button(first.page,'Готово').click();await expect(first.page).toHaveURL(`${origin}/profile`);await labelQaDevice(first.page,`QA ${name} first returned`);await expect(first.page.locator('.identity-public-id')).toHaveText(one.me.account.publicId);one.currentDeviceId=(await(await first.context.request.get(`${origin}/api/v1/identity/me`,{headers})).json()).deviceId
  const matrix=await first.context.request.post(`${origin}/api/v1/identity/matrix/session`,{headers});assert.equal(matrix.status(),200);const matrixData=await matrix.json();assert.equal(matrixData.userId,`@pb_${one.me.account.id.replaceAll('-','')}:matrix.photobunker.test`)
  const who=await first.context.request.get(`${origin}/_matrix/client/v3/account/whoami`,{headers:{Authorization:`Bearer ${matrixData.accessToken}`}});assert.equal(who.status(),200)
  assert.equal((await first.context.request.post(`${origin}/_matrix/client/v3/register`,{data:{username:'anonymous_qa',password:'synthetic'},headers})).status(),403)
  assert.equal((await first.context.request.get(`${origin}/_synapse/admin/v1/register`)).status(),404)
  const recovered=await client();await recovered.page.goto(`${origin}/profile`);await button(recovered.page,'Войти с ключом аккаунта').click();await label(recovered.page,'Ключ аккаунта').fill(one.kit);await button(recovered.page,'Готово').click();await expect(recovered.page).toHaveURL(`${origin}/profile`);await labelQaDevice(recovered.page,`QA ${name} recovery`);
  const recoveryMe=await(await recovered.context.request.get(`${origin}/api/v1/identity/me`,{headers})).json();assert.equal(recoveryMe.account.id,one.me.account.id)
  if(name==='chromium'&&process.env.IDENTITY_DRILLS!=='0'){await matrixRestoreDrill(one.me.account.id,recoveryMe.deviceId);console.log('Matrix cold copy restored: same account and device login verified; disposable clone removed')}
  if(name==='chromium'&&process.env.IDENTITY_DRILLS!=='0'){await command('docker',['compose','stop','matrix']);matrixStopped=true}
  await recovered.page.getByRole('link',{name:/Безопасность/}).click();const revoked=button(recovered.page,`Отозвать устройство: QA ${name} first returned`);recovered.page.once('dialog',dialog=>dialog.accept());await revoked.click();await expect(recovered.page.locator('.identity-device').filter({hasText:`QA ${name} first returned`})).toContainText('Доступ отозван')
  assert.equal((await first.context.request.get(`${origin}/api/v1/identity/me`,{headers})).status(),401)
  if(name==='chromium'&&process.env.IDENTITY_DRILLS!=='0'){
   const devices=await(await recovered.context.request.get(`${origin}/api/v1/identity/devices`,{headers})).json();assert.equal(devices.devices.find(device=>device.id===one.currentDeviceId).matrix_revoke_pending,true)
   const duringOutage=await client();const pending=await create(duringOutage.page,`QA ${name} outage`);assert.equal(pending.me.account.matrix.state,'pending')
   const captureFixture={...duringOutage,kit:pending.kit,me:pending.me};await enrollPhotos(captureFixture);await preparePhotos(captureFixture);
   await duringOutage.page.goto(`${origin}/camera`);await button(duringOutage.page,'Попробовать без камеры').click();await button(duringOutage.page,'Снять фото').click();await expect.poll(()=>duringOutage.page.evaluate(async()=>(await(await import('/src/crypto/photos.ts')).jobs()).length)).toBe(1)
   assert.equal((await duringOutage.context.request.get(`${origin}/api/v1/ready`)).status(),200)
   await command('docker',['compose','--profile','matrix','up','-d','matrix']);matrixStopped=false;await readyMatrix();await command('./scripts/dev',['api','php','artisan','photobunker:identity-maintain'])
   const restored=await(await duringOutage.context.request.get(`${origin}/api/v1/identity/me`,{headers})).json();assert.equal(restored.account.matrix.state,'ready')
   const repaired=await(await recovered.context.request.get(`${origin}/api/v1/identity/devices`,{headers})).json();assert.equal(repaired.devices.find(device=>device.id===one.currentDeviceId).matrix_revoke_pending,false)
   console.log('Matrix outage: signed account persists, messaging onboarding explains failure, encrypted capture continues after leaving setup; provisioning and durable revocation complete after restart')
  }
  assert.equal((await first.context.request.get(`${origin}/_matrix/client/v3/account/whoami`,{headers:{Authorization:`Bearer ${matrixData.accessToken}`}})).status(),401)
  await second.page.goto(`${origin}/profile/contacts`);await label(second.page,'Найти по ID').fill(one.me.account.publicId);await button(second.page,'Поиск').click();await button(second.page,'Заблокировать').click();await button(second.page.getByRole('dialog'),'Заблокировать').click();await expect(second.page.locator('.person-screen')).toHaveAttribute('data-blocked','true')
  assert.equal((await recovered.context.request.get(`${origin}/api/v1/identity/people/${two.me.account.publicId}`,{headers})).status(),404)
  const stored=await recovered.page.evaluate(async()=>{const keys=await(await import('/src/identity/keys.ts')).credentials();return keys.map(key=>({fields:Object.keys(key),extractable:key.privateKey.extractable}))});assert.ok(stored.every(key=>!key.extractable&&!key.fields.includes('rootKey')))
  assert.ok(bodies.every(body=>!body.includes(one.kit.split('.')[2])&&!body.includes(two.kit.split('.')[2])))
  for(const path of ['/profile','/profile/edit','/profile/contacts','/profile/security','/messages']){
   await recovered.page.goto(`${origin}${path}`)
   if(path==='/profile')await expect(recovered.page.locator('.identity-public-id')).toBeVisible()
   if(path==='/profile/edit')await expect(recovered.page.locator('.profile-field-group')).toHaveCount(6)
   if(path==='/profile/contacts')await expect(label(recovered.page,'Найти по ID')).toBeVisible()
   if(path==='/profile/security')await expect(recovered.page.locator('.identity-device')).toHaveCount(3)
   if(path==='/messages')await expect(recovered.page.locator('.messages-screen')).toHaveAttribute('data-connection','ready',{timeout:60000})
   for(const width of [320,390,768,1440]){await recovered.page.setViewportSize({width,height:844});assert.ok(await recovered.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${path} at ${width}`)}
  }
  assert.deepEqual(errors,[])
  console.log(`${name}: signed account creation/recovery, private profile, personal contacts/block, real Matrix provisioning/whoami, closed registration, device + Matrix revocation non-extractable local keys, cross-tab logout and 320–1440px account layouts passed`)
 }finally{
  if(matrixStopped){await command('docker',['compose','--profile','matrix','up','-d','matrix']);await readyMatrix()}
  await Promise.all(contexts.map(context=>context.close()));await browser.close()
  let failed=false
  for(const fixture of fixtures){try{await command('./scripts/dev',['api','php','artisan','photobunker:matrix-probe',fixture.id,'--cleanup',`--fingerprint=${fixture.fingerprint}`])}catch{failed=true}}
  if(failed)throw new Error('Precisely identified synthetic fixture cleanup failed')
 }
}
