// Synthetic accounts only. Never report credentials, recovery keys, photo bytes or chat text.
import {chromium,webkit,expect} from '@playwright/test'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {origin,headers,button,label,accountFixture,cleanupFixtures,monitorRuntime} from './account-qa.mjs'
const base=`${origin}/api/v1/identity/workspace`
async function contact(one,two){for(const [owner,person] of [[one,two],[two,one]])assert.equal((await owner.context.request.post(`${origin}/api/v1/identity/contacts`,{headers,data:{publicId:person.me.account.publicId}})).status(),200)}
async function protect(fixture){const page=fixture.page;await page.goto(`${origin}/messages`);await expect(page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage','ready',{timeout:90000});await expect(page.locator('.messages-screen')).toHaveAttribute('data-history-backup','true')}
async function participant(page,person){await button(page,'Добавить участника').click();await label(page,'ID участника').fill(person.me.account.publicId);await button(page,'Готово').click()}
async function accept(fixture,kind,name){await fixture.page.goto(`${origin}${kind==='team'?'/profile/teams':'/assignments'}`);await fixture.page.locator('.workspace-invitations .form-card').filter({hasText:name}).getByRole('button',{name:'Принять',exact:true}).click();await expect(fixture.page.locator('.workspace-invitations .form-card').filter({hasText:name})).toHaveCount(0,{timeout:30000})}
try {
for(const engine of (process.env.WORKSPACE_BROWSERS??'chromium,webkit').split(',')){
 const browser=await({chromium,webkit}[engine]).launch({headless:true}),fixtures=[],errors=[],media=[],diagnostics={nativePhotoPoll:0}
 try{
  const owner=await accountFixture(browser,`${engine} workspace owner`,fixtures),drop=await accountFixture(browser,`${engine} workspace drop`,fixtures),viewer=await accountFixture(browser,`${engine} workspace viewer`,fixtures)
  for(const fixture of fixtures){await monitorRuntime(fixture.page,engine,errors,diagnostics);fixture.page.on('request',request=>{if(new URL(request.url()).pathname.includes('/_matrix/media/'))media.push('matrix_media')})}
  await contact(owner,drop);await contact(owner,viewer)
  await protect(owner);await protect(drop);await protect(viewer)
  await owner.page.goto(`${origin}/profile/teams`);await owner.page.locator('.screen-header').getByRole('button',{name:'Создать команду',exact:true}).click();await label(owner.page,'Название').fill('QA account team');await participant(owner.page,drop);await participant(owner.page,viewer);await button(owner.page,'Сохранить').click();await expect(owner.page.getByRole('dialog')).toHaveCount(0)
  await accept(drop,'team','QA account team');await accept(viewer,'team','QA account team')
  await owner.page.goto(`${origin}/assignments/new`);await label(owner.page,'Название').fill('QA account assignment');await owner.page.getByRole('tab',{name:'Участники',exact:true}).click();await button(owner.page,'Выбрать команду').click();await owner.page.locator('.picker-row').filter({hasText:'QA account team'}).click()
  await owner.page.locator('.participant-main').filter({hasText:drop.me.account.publicId}).click();await label(owner.page,'Доступ к фотографиям').selectOption('none');await button(owner.page,'Готово').click()
  await owner.page.locator('.participant-main').filter({hasText:viewer.me.account.publicId}).click();await label(owner.page,'Роль').selectOption('viewer');await label(owner.page,'Доступ к фотографиям').selectOption('thumbnails');await button(owner.page,'Готово').click();await button(owner.page,'Сохранить').click();await expect(owner.page).toHaveURL(/\/assignments\/[a-f0-9-]{36}$/)
  const id=new URL(owner.page.url()).pathname.split('/').at(-1)
  await accept(drop,'task','QA account assignment');await accept(viewer,'task','QA account assignment')
  console.log(`${engine}: account-owned team/task, real invitations and independent accepted memberships passed`)
  await drop.page.bringToFront();await drop.page.goto(`${origin}/assignments/${id}`);await button(drop.page,'Снимать').click();await button(drop.page,'Попробовать без камеры').click();await button(drop.page,'Снять фото').click()
  await expect.poll(async()=>{const response=await drop.context.request.get(`${base}/photos`,{headers});return (await response.json()).receipts?.length??0},{timeout:60000}).toBe(1)
  const receipt=(await(await drop.context.request.get(`${base}/photos`,{headers})).json()).receipts[0]
  assert.equal((await drop.context.request.get(`${base}/photos/${receipt.id}/original`,{headers})).status(),403)
  const visible=(await(await owner.context.request.get(`${base}/photos`,{headers})).json()).photos;assert.equal(visible.length,1)
  const photo=visible[0];assert.equal(photo.captureContext.author.publicId,drop.me.account.publicId)
  assert.equal((await viewer.context.request.get(`${base}/photos/${photo.id}/original`,{headers})).status(),403)
  const thumb=await viewer.context.request.get(`${base}/photos/${photo.id}/thumbnail`,{headers});assert.equal(thumb.status(),200)
  await viewer.page.goto(`${origin}/gallery/${photo.id}`);await expect(viewer.page.getByText('Доступна только миниатюра',{exact:true})).toBeVisible();assert.ok(await viewer.page.locator('.photo-view-stage img').evaluate(image=>Math.max(image.naturalWidth,image.naturalHeight)<=80));await expect(button(viewer.page,'Редактировать')).toHaveCount(0)
  console.log(`${engine}: real capture/account upload, upload-only denial, separate 80px thumbnail and authenticated authorship passed`)
  await owner.page.goto(`${origin}/assignments/${id}`);await button(owner.page,'Обсуждение').click();await expect(owner.page.locator('.message-composer')).toBeVisible({timeout:60000})
  const room=await owner.page.locator('.messages-screen').getAttribute('data-room')
  await drop.page.goto(`${origin}/assignments/${id}`);await button(drop.page,'Обсуждение').click();await expect(drop.page.locator('.message-composer')).toBeVisible({timeout:60000})
  await label(owner.page,'Сообщение').fill('QA assignment encrypted discussion');await button(owner.page,'Отправить').click();await expect(drop.page.locator('.message-body').filter({hasText:'QA assignment encrypted discussion'})).toBeVisible({timeout:60000})
  await owner.page.goto(`${origin}/gallery/${photo.id}`);await button(owner.page,'Обсудить снимок').click();await expect(label(owner.page,'Сообщение')).toHaveValue(`Фотография PhotoBunker: ${photo.id}`,{timeout:60000});await button(owner.page,'Отправить').click();await expect(drop.page.getByRole('button',{name:'Открыть фото',exact:true})).toBeVisible({timeout:60000});await button(drop.page,'Открыть фото').click();await expect(drop.page.locator('.photo-view-stage img')).toHaveCount(0)
  const matrix=await(await owner.context.request.post(`${origin}/api/v1/identity/matrix/session`,{headers})).json(),auth={Authorization:`Bearer ${matrix.accessToken}`}
  const messages=await owner.context.request.get(`${origin}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=20`,{headers:auth});assert.equal(messages.status(),200);assert.ok((await messages.json()).chunk.filter(event=>event.type==='m.room.encrypted').length>=2)
  // Revocation takes effect in PhotoBunker immediately, with durable Matrix reconciliation.
  const task=await(await owner.context.request.get(`${base}/task/${id}`,{headers})).json()
  const saved=await owner.context.request.put(`${base}/task/${id}`,{headers,data:{...task,participants:task.participants.filter(person=>person.id!==drop.me.account.publicId)}});assert.equal(saved.status(),200)
  assert.equal((await drop.context.request.get(`${base}/task/${id}`,{headers})).status(),404);assert.equal((await drop.context.request.get(`${base}/photos/${photo.id}/original`,{headers})).status(),404)
  const reconcile=await owner.context.request.post(`${base}/assignments/${id}/discussion`,{headers});assert.equal(reconcile.status(),200)
  const membership=await owner.context.request.get(`${origin}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/state/m.room.member/${encodeURIComponent(`@pb_${drop.me.account.id.replaceAll('-','')}:matrix.photobunker.test`)}`,{headers:auth});assert.equal((await membership.json()).membership,'leave')

  // A scope downgrade removes an already displayed original from the application UI.
  let scopeTask=await(await owner.context.request.get(`${base}/task/${id}`,{headers})).json()
  assert.equal((await owner.context.request.put(`${base}/task/${id}`,{headers,data:{...scopeTask,participants:scopeTask.participants.map(person=>({...person,photoScope:person.id===viewer.me.account.publicId?'all':person.photoScope}))}})).status(),200)
  await viewer.page.goto(`${origin}/gallery/${photo.id}`);await expect(button(viewer.page,'Поделиться')).toHaveCount(0);await expect(button(viewer.page,'Обсудить снимок')).toBeVisible();await expect.poll(async()=>await viewer.page.locator('.photo-view-stage img').count()?await viewer.page.locator('.photo-view-stage img').evaluate(image=>image.naturalWidth):0,{timeout:15000}).toBeGreaterThan(80)
  scopeTask=await(await owner.context.request.get(`${base}/task/${id}`,{headers})).json()
  assert.equal((await owner.context.request.put(`${base}/task/${id}`,{headers,data:{...scopeTask,participants:scopeTask.participants.map(person=>({...person,photoScope:person.id===viewer.me.account.publicId?'thumbnails':person.photoScope}))}})).status(),200)
  await viewer.page.evaluate(async()=>{await(await import('/src/local/library.ts')).refreshLibrary()})
  await expect.poll(async()=>await viewer.page.locator('.photo-view-stage img').count()?await viewer.page.locator('.photo-view-stage img').evaluate(image=>image.naturalWidth||Infinity):Infinity,{timeout:15000}).toBeLessThanOrEqual(80)
  assert.equal((await viewer.context.request.get(`${base}/photos/${photo.id}/original`,{headers})).status(),403)
  // Copy a real legacy S3 photograph only after exclusive ownership proof.
  const legacyCreate=await owner.context.request.post(`${origin}/api/v1/prototype/libraries`);assert.equal(legacyCreate.status(),201);const legacy=await legacyCreate.json(),legacyId=crypto.randomUUID()
  owner.legacy={id:legacy.libraryId,fingerprint:createHash('sha256').update(legacy.accessCode).digest('hex'),photo:legacyId}
  const original=await(await owner.context.request.get(`${base}/photos/${photo.id}/original`,{headers})).body(),preview=await(await owner.context.request.get(`${base}/photos/${photo.id}/thumbnail`,{headers})).body()
  const legacyUpload=await owner.context.request.post(`${origin}/api/v1/prototype/photos`,{headers:{Authorization:`Bearer ${legacy.accessCode}`},multipart:{manifest:JSON.stringify({id:legacyId,createdAt:Date.now(),width:photo.width,height:photo.height,mime:photo.mime,method:photo.method,title:'QA legacy import',note:'QA original note',favorite:false}),original:{name:'original.jpg',mimeType:'image/jpeg',buffer:original},thumbnail:{name:'thumbnail.jpg',mimeType:'image/jpeg',buffer:preview}}});assert.equal(legacyUpload.status(),200)
  assert.equal((await viewer.context.request.post(`${base}/legacy/photos/${legacyId}/import`,{headers,data:{libraryId:legacy.libraryId}})).status(),403)
  assert.equal((await owner.context.request.post(`${origin}/api/v1/identity/legacy-proof`,{headers,data:{libraryCode:legacy.accessCode}})).status(),200)
  const firstCopy=await owner.context.request.post(`${base}/legacy/photos/${legacyId}/import`,{headers,data:{libraryId:legacy.libraryId}});if(firstCopy.status()!==200)console.log(`Legacy copy HTTP ${firstCopy.status()}`);assert.equal(firstCopy.status(),200);const copiedId=(await firstCopy.json()).id
  const copiedAgain=await owner.context.request.post(`${base}/legacy/photos/${legacyId}/import`,{headers,data:{libraryId:legacy.libraryId}});assert.equal((await copiedAgain.json()).id,copiedId)
  const copiedBytes=await(await owner.context.request.get(`${base}/photos/${copiedId}/original`,{headers})).body();assert.ok(original.equals(copiedBytes));assert.equal((await owner.context.request.get(`${origin}/api/v1/prototype/photos/${legacyId}/original`,{headers:{Authorization:`Bearer ${legacy.accessCode}`}})).status(),200)
  console.log(`${engine}: proven legacy S3 copy, byte integrity, preserved source and idempotent retry passed`)
  // Device workspace import uses the actual UI; a failed first request keeps the source and can retry.
  const source=await owner.page.evaluate(async sourcePhotoId=>{const repository=await import('/src/studio/repository.ts'),model=await import('/src/studio/model.ts'),photos=await import('/src/local/photos.ts');const task=model.newTask('QA earlier device assignment');task.completed=true;task.participants=[{id:'legacy-unresolved',name:'Earlier participant',role:'curator',notify:false}];await repository.save('device','tasks',task,0);const original=await(await fetch(`/api/v1/identity/workspace/photos/${sourcePhotoId}/original`,{headers:{'X-PhotoBunker':'identity-v1'}})).blob(),preview=await(await fetch(`/api/v1/identity/workspace/photos/${sourcePhotoId}/thumbnail`,{headers:{'X-PhotoBunker':'identity-v1'}})).blob();const saved=await photos.savePhoto({blob:new Blob([original],{type:'image/jpeg'}),thumbnail:preview,width:1280,height:720,method:'demo'},{uiOnly:true,uiAssignmentId:task.id,createdAt:Date.now()-20*86400000,libraryId:'',metadata:{capturedAt:Date.now()-20*86400000,resolutionLimited:false},category:'',shot:'',captureContext:{presetName:'Standard',standard:true,author:{kind:'device'}},retention:{retentionAnchor:undefined,retentionSeconds:1209600,expiresAt:Date.now()+86400000}});return {task:task.id,photo:saved.id}},photo.id)
  await owner.page.goto(`${origin}/profile`);await button(owner.page,'Перенести прежние данные').click();const importDialog=owner.page.getByRole('dialog');await expect(importDialog.getByRole('button',{name:'Перенести прежние данные',exact:true})).toBeVisible()
  await importDialog.getByRole('checkbox').check();let failImport=true;await owner.page.route('**/workspace/import-record',route=>{if(failImport){failImport=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'})}return route.continue()})
  owner.page.once('dialog',dialog=>dialog.accept());await importDialog.getByRole('button',{name:'Перенести прежние данные',exact:true}).click();await expect(importDialog.getByRole('alert')).toBeVisible();owner.page.once('dialog',dialog=>dialog.accept());await importDialog.getByRole('button',{name:'Перенести прежние данные',exact:true}).click();await expect(importDialog.getByRole('status')).toContainText('Перенос завершён',{timeout:60000});await button(owner.page,'Закрыть').click()
  const imported=(await(await owner.context.request.get(base,{headers})).json()).tasks.find(item=>item.name==='QA earlier device assignment');assert.ok(imported);assert.equal(imported.participants.length,0);assert.notEqual(imported.id,source.task)
  assert.ok(await owner.page.evaluate(async id=>(await(await import('/src/studio/repository.ts')).list('device','tasks')).some(item=>item.id===id),source.task))
  assert.equal((await viewer.context.request.get(`${base}/task/${imported.id}`,{headers})).status(),404)
  const importedPhoto=(await(await owner.context.request.get(`${base}/photos`,{headers})).json()).photos.find(item=>item.workspaceAssignmentId===imported.id);assert.ok(importedPhoto);assert.equal(importedPhoto.captureContext.author.kind,'device');assert.ok(original.equals(await(await owner.context.request.get(`${base}/photos/${importedPhoto.id}/original`,{headers})).body()));assert.ok(importedPhoto.expiresAt<=Date.now()+86400000)
  assert.ok(await owner.page.evaluate(async id=>!!await(await import('/src/local/photos.ts')).readMetadata(id),source.photo))
  const beforeCount=(await(await owner.context.request.get(`${base}/photos`,{headers})).json()).photos.length
  await button(owner.page,'Перенести прежние данные').click();owner.page.once('dialog',dialog=>dialog.accept());await owner.page.getByRole('dialog').getByRole('button',{name:'Перенести прежние данные',exact:true}).click();await expect(owner.page.getByRole('dialog').getByRole('status')).toContainText('Перенос завершён',{timeout:60000});await button(owner.page,'Закрыть').click()
  assert.equal((await(await owner.context.request.get(`${base}/photos`,{headers})).json()).photos.length,beforeCount)
  console.log(`${engine}: device photograph import, preserved original/time/TTL, unknown account authorship and repeat without duplicates passed`)
  // A retained encrypted photo reference never bypasses its newly shortened TTL.
  const latest=(await(await owner.context.request.get(`${base}/photos/${photo.id}`,{headers})).json()).photo
  assert.equal((await owner.context.request.patch(`${base}/photos/${photo.id}`,{headers,data:{revision:latest.remoteRevision,title:latest.title,note:latest.note,favorite:latest.favorite,expiresAt:Date.now()+500}})).status(),200)
  await expect.poll(async()=>(await owner.context.request.get(`${base}/photos/${photo.id}`,{headers})).status(),{timeout:10000}).toBe(410)
  await owner.page.goto(`${origin}/messages?assignment=${id}`);await expect(button(owner.page,'Открыть фото')).toBeVisible({timeout:60000});await button(owner.page,'Открыть фото').click();await expect(owner.page.locator('.photo-view-stage img')).toHaveCount(0)
  console.log(`${engine}: real import UI failure/retry without legacy grants and expired encrypted-reference denial passed`)
  await owner.page.goto(`${origin}/assignments/${id}`)
  for(const width of [320,390,768,1440]){await owner.page.setViewportSize({width,height:844});assert.ok(await owner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
  // Switching accounts in another tab clears the prior account's displayed personal photo.
  await viewer.page.bringToFront();await viewer.page.goto(`${origin}/camera`);await expect(viewer.page.locator('.camera-state-chip')).toContainText('Аккаунт',{timeout:15000});await button(viewer.page,'Попробовать без камеры').click();await button(viewer.page,'Снять фото').click()
  await expect.poll(async()=>{const response=await viewer.context.request.get(`${base}/photos`,{headers});return (await response.json()).photos?.filter(item=>!item.workspaceAssignmentId).length??0},{timeout:60000}).toBe(1)
  const personal=(await(await viewer.context.request.get(`${base}/photos`,{headers})).json()).photos.find(item=>!item.workspaceAssignmentId)
  await viewer.page.goto(`${origin}/gallery/${personal.id}`);await expect(viewer.page.locator('.photo-view-stage img')).toBeVisible()
  const switchPage=await viewer.context.newPage();await switchPage.goto(`${origin}/profile/account?mode=recover`);await label(switchPage,'Название устройства').fill(`QA ${engine} workspace switched`);await label(switchPage,'Ключ аккаунта').fill(owner.kit);await button(switchPage,'Готово').click();await expect(switchPage).toHaveURL(`${origin}/profile`);await expect(viewer.page.locator('.photo-view-stage img')).toHaveCount(0,{timeout:15000});await switchPage.close()
  console.log(`${engine}: live full-to-thumbnail downgrade and cross-tab account/photo isolation passed`)
  assert.deepEqual(errors,[]);assert.deepEqual(media,[])
  if(diagnostics.nativePhotoPoll)console.log(`${engine}: ${diagnostics.nativePhotoPoll} native cancelled photo-poll diagnostics; zero window errors/unhandled rejections`)
  console.log(`${engine}: real encrypted assignment discussion, ID-only photo reference with independent ACL, live revoke/reconciliation and layouts passed`)
 }finally{await cleanupFixtures(fixtures);await browser.close()}
}
}catch(error){console.error(`Workspace QA failed (${error.name}); private values omitted.`);console.error(String(error.stack).split('\n').filter(line=>line.trim().startsWith('at ')&&line.includes('check-workspace.mjs')).join('\n'));process.exitCode=1}
