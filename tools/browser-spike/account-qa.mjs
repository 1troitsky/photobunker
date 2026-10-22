import {createHash} from 'node:crypto'
import {expect} from '@playwright/test'
import {command} from './matrix-drill.mjs'
export const origin=process.env.LOCAL_APP_URL??'http://localhost:8080'
if(!['localhost','127.0.0.1','[::1]','photobunker.orb.local'].includes(new URL(origin).hostname))throw new Error('Use a loopback origin')
export const headers={'X-PhotoBunker':'identity-v1','Origin':origin}
export const button=(page,name)=>page.getByRole('button',{name,exact:true})
export const label=(page,name)=>page.getByLabel(name,{exact:true})
export async function accountFixture(browser,name,fixtures,{legacy=false}={}) {
 const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844}}),page=await context.newPage()
 let stage='open-profile'
 try {
   await page.goto(`${origin}/profile`)
   stage='open-onboarding'
   // Cold CI boot can render the profile shell before identity initialization.
   // One explicit reload is allowed; a second failure still fails acceptance.
   const create = button(page,'Создать аккаунт')
   try { await create.waitFor({ state: 'visible', timeout: 15000 }) }
   catch {
     await page.reload()
     await create.waitFor({ state: 'visible', timeout: 15000 })
   }
   await create.click()
   stage='device-name'
   await label(page,'Название устройства').fill(`QA ${name}`)
   stage='create-account'
   await button(page,'Создать аккаунт').click()
   stage='read-recovery-input'
   const kit=await label(page,'Ключ аккаунта').inputValue()
   if(legacy){
     stage='legacy-registration'
     // Legacy fixture, not a product UI path. Do not log the recovery key.
     await page.evaluate(async ({kit,name})=>{const keys=await import('/src/identity/keys.ts'),store=await import('/src/identity/store.ts');await store.register(await keys.parseKit(kit),'QA '+name)},{kit,name})
     page.once('dialog',dialog=>dialog.accept())
     await button(page,'Отмена').click()
   } else {
     stage='confirm-recovery-key'
     await label(page,'Я сохранил ключ восстановления').check()
     await button(page,'Готово').click()
   }
   stage='onboarding-return'
   await expect(page).toHaveURL(`${origin}/profile`,{timeout:30000})
   stage='load-public-account'
   const me=await(await context.request.get(`${origin}/api/v1/identity/me`,{headers})).json()
   stage='load-private-photo-key'
   const photoKit=legacy?undefined:await page.evaluate(async()=>{const v=await import('/src/identity/vault.ts');return(await v.readAccountSecrets())?.photoKey})
   const fixture={context,page,kit,photoKit,me,fingerprint:createHash('sha256').update(kit.split('.')[1]).digest('hex')}
   fixtures.push(fixture)
   return fixture
 } catch(error) {
   await context.close().catch(()=>{})
   // Only safe state name + exception class: never reveal recovery kit,
   // user IDs, encrypted payload, request body or browser storage.
   throw new Error(`account_fixture_${stage}: ${error instanceof Error ? error.name : 'unknown'}`)
 }
}
export async function cleanupFixtures(fixtures){for(const fixture of fixtures){await fixture.context.close().catch(()=>{});if(fixture.legacy)await command('./scripts/dev',['api','php','artisan','photobunker:workspace-legacy-cleanup',fixture.me.account.id,`--fingerprint=${fixture.fingerprint}`,`--library=${fixture.legacy.id}`,`--library-fingerprint=${fixture.legacy.fingerprint}`,`--photo=${fixture.legacy.photo}`]);await command('./scripts/dev',['api','php','artisan','photobunker:matrix-probe',fixture.me.account.id,'--cleanup',`--fingerprint=${fixture.fingerprint}`])}}

// WebKit reports cancelled, handled same-origin photo polls as native pageerror
// diagnostics during navigation. Keep actual JS errors/rejections strict.
export async function monitorRuntime(page,engine,errors,diagnostics){
 const cancelled=new Set(), generations=new WeakMap();let documentGeneration=0,privacyTransition=0
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())documentGeneration++})
 page.on('request',request=>generations.set(request,documentGeneration))
 page.on('requestfailed',request=>{if(/cancelled|ERR_ABORTED/i.test(request.failure()?.errorText??'')||(generations.get(request)??documentGeneration)<documentGeneration)cancelled.add(request.url())})
 await page.exposeBinding('qaPrivacyTransition',()=>{privacyTransition=Date.now()})
 await page.exposeBinding('qaNativeFetchAbort',(_source,url)=>cancelled.add(url))
 await page.exposeBinding('qaRuntimeFailure',()=>errors.push('unhandled_runtime'))
 const install=()=>{window.addEventListener('pagehide',()=>{void window.qaPrivacyTransition().catch(()=>{})});document.addEventListener('visibilitychange',()=>{if(document.hidden)void window.qaPrivacyTransition().catch(()=>{})});if(!window.qaFetchObserved){window.qaFetchObserved=true;const fetchOriginal=window.fetch.bind(window);window.fetch=(input,options)=>{const url=typeof input==='string'?new URL(input,location.href).href:input instanceof URL?input.href:input.url;options?.signal?.addEventListener('abort',()=>{void window.qaNativeFetchAbort(url).catch(()=>{})},{once:true});return fetchOriginal(input,options)}}window.addEventListener('unhandledrejection',()=>window.qaRuntimeFailure().catch(()=>{}));window.addEventListener('error',()=>window.qaRuntimeFailure().catch(()=>{}))}
 await page.addInitScript(install);await page.evaluate(install)
 page.on('pageerror',async error=>{
  const detail=[error.name,error.message,error.stack].join(' '),url=detail.match(/https?:\/\/[^\s"'<>)]+/)?.[0]
  if(engine==='webkit'&&/(?:Fetch API cannot load|Cannot load) http/.test(detail)&&url){
   const parsed=new URL(url),allowed=parsed.origin===origin&&/^\/(?:api\/v1\/identity\/|src\/|node_modules\/)/.test(parsed.pathname)
   if(allowed){for(let attempt=0;attempt<5&&!cancelled.has(url);attempt++)await new Promise(resolve=>setTimeout(resolve,10));if(cancelled.has(url)||Date.now()-privacyTransition<750){diagnostics.nativePhotoPoll++;return}}
  }
  diagnostics.unexpected??=[];diagnostics.unexpected.push({name:error.name.split('http')[0],nativeFetch:/Fetch API cannot load/.test(detail),cancelled:!!url&&cancelled.has(url),path:!url?'':new URL(url).pathname.replace(/[-a-f0-9]{36}/g,':id'),pathKind:!url?'unknown':new URL(url).pathname.startsWith('/api/')?'api':new URL(url).pathname.startsWith('/src/')?'module':'other'});errors.push('browser_error')
 })
}
