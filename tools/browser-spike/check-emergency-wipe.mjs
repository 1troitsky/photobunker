// Synthetic browser drill for R1-08B. It runs in an isolated Playwright
// profile, never signs in and never touches API or real user data.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]', 'photobunker.orb.local'].includes(new URL(origin).hostname))
  throw new Error('Use a loopback origin')

const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const DA='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const DB='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const OP='99999999-9999-4999-8999-999999999999'
const KEY='33333333-3333-4333-8333-333333333333'

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({locale:'ru-RU'})
const page=await context.newPage()

try {
  await page.goto(`${origin}/welcome`)
  const result=await page.evaluate(async ({A,B,DA,DB,OP,KEY})=>{
    const open=(name,version,upgrade)=>new Promise((resolve,reject)=>{
      const request=indexedDB.open(name,version)
      request.onupgradeneeded=()=>upgrade(request.result)
      request.onsuccess=()=>resolve(request.result)
      request.onerror=()=>reject(request.error)
    })
    const seed=async(name,version,stores,rows)=>{
      const database=await open(name,version,db=>{
        for(const [store,options] of Object.entries(stores))
          if(!db.objectStoreNames.contains(store))db.createObjectStore(store,options)
      })
      await new Promise((resolve,reject)=>{
        const tx=database.transaction(Object.keys(stores),'readwrite')
        for(const [store,key,value] of rows){
          const target=tx.objectStore(store)
          if(key===undefined)target.put(value)
          else target.put(value,key)
        }
        tx.oncomplete=resolve
        tx.onabort=()=>reject(tx.error)
      })
      database.close()
    }
    const keys=async(name,store)=>{
      const database=await new Promise((resolve,reject)=>{
        const request=indexedDB.open(name)
        request.onsuccess=()=>resolve(request.result)
        request.onerror=()=>reject(request.error)
      })
      const values=await new Promise((resolve,reject)=>{
        const tx=database.transaction(store,'readonly'),request=tx.objectStore(store).getAllKeys()
        tx.oncomplete=()=>resolve(request.result.map(String).sort())
        tx.onabort=()=>reject(tx.error)
      })
      database.close()
      return values
    }
    const pairA=A+':'+DA,pairB=B+':'+DB
    await seed('photobunker-identity-devices-v1',2,
      {devices:{keyPath:'id'},pending:undefined},[
        ['devices',undefined,{id:DA,publicId:'pb_a'}],['devices',undefined,{id:DB,publicId:'pb_b'}],
        ['pending','root-a',{id:DA}],['pending','root-b',{id:DB}],
      ])
    await seed('photobunker-app-pin-v2',1,{records:undefined},[
      ['records','app-pin:'+pairA,'a'],['records','app-pin:'+pairB,'b']])
    await seed('photobunker-local-delete-v1',1,{pins:undefined,journal:undefined},[
      ['pins','local-delete:'+pairA,'a'],['pins','local-delete:'+pairB,'b']])
    await seed('photobunker-local-prototype-v1',1,
      {photos:undefined,originals:undefined,thumbnails:undefined},[
        ['photos','photo-a',{id:'photo-a',accountId:A}],['photos','photo-b',{id:'photo-b',accountId:B}],
        ['originals','photo-a',new Blob(['a'])],['originals','photo-b',new Blob(['b'])],
        ['thumbnails','photo-a',new Blob(['a'])],['thumbnails','photo-b',new Blob(['b'])],
      ])
    await seed('photobunker-encrypted-queue-v1',1,{entries:undefined},[
      ['entries','job:'+A+':a','a'],['entries','job:'+B+':b','b'],
      ['entries','capture-current',{accountId:A,deviceId:DA}]])
    await seed('photobunker-ui-workspace-v1',1,{records:{keyPath:'key'}},[
      ['records',undefined,{key:'account:'+A+':tasks:a',scope:'account:'+A}],
      ['records',undefined,{key:'account:'+B+':tasks:b',scope:'account:'+B}],
    ])
    await seed('photobunker-message-storage-v1',1,{keys:{keyPath:'id'}},[
      ['keys',undefined,{id:pairA,value:'a'}],['keys',undefined,{id:pairB,value:'b'}]])
    await seed('photobunker-message-outbox-v1',1,{records:undefined},[
      ['records','key:'+pairA,'a'],['records','key:'+pairB,'b'],
      ['records','msg:'+pairA+':tx','a'],['records','msg:'+pairB+':tx','b']])
    await seed('photobunker-private-messenger-folders-v1',1,{private:undefined},[
      ['private','key:'+pairA,'a'],['private','data:'+pairA,'a'],
      ['private','key:'+pairB,'b'],['private','data:'+pairB,'b']])
    await seed('photobunker-team-cache-v1',1,{scopes:undefined},[
      ['scopes','team:'+pairA,'a'],['scopes','team:'+pairB,'b']])
    await seed('photobunker-private-presence-v1',1,{records:undefined},[
      ['records',pairA,'a'],['records',pairB,'b']])
    await seed('photobunker-photo-browser-cache-v1',1,{records:undefined},[
      ['records','browser:'+pairA+':a','a'],['records','browser:'+pairB+':b','b']])
    await seed('photobunker-photo-names-v1',1,{scopes:undefined},[
      ['scopes','photo-names:'+pairA,'a'],['scopes','photo-names:'+pairB,'b']])
    await seed('photobunker-card-share-intents-v1',1,{records:undefined},[
      ['records',pairA+':a','a'],['records',pairB+':b','b']])
    await seed('photobunker-emergency-v1',1,{records:undefined},[
      ['records',pairA,'a'],['records',pairB,'b']])
    const intent=JSON.stringify({accountId:A,action:'emergency-delete',keyId:KEY,
      operationId:OP,revision:1,version:1})
    await seed('photobunker-emergency-outbox-v1',1,{commands:undefined},[
      ['commands','active',{version:1,operationId:OP,accountId:A,deviceId:DA,
        intent,signature:'A'.repeat(86),phase:'purging',delivery:'queued',createdAt:1}]])
    await seed(`photobunker-matrix-${pairA}:synthetic`,1,{crypto:undefined},[['crypto','a','a']])
    await seed(`photobunker-matrix-${pairB}:synthetic`,1,{crypto:undefined},[['crypto','b','b']])
    localStorage.setItem('scoped:'+A,'a')
    localStorage.setItem('scoped:'+B,'b')
    localStorage.setItem('pb-active-device',DA)

    const wipe=await import('/src/app/emergency-wipe.ts')
    await wipe.purgeEmergencyDevice({owner:A,device:DA})
    const names=(await indexedDB.databases()).map(row=>row.name)
    return {
      identity:await keys('photobunker-identity-devices-v1','devices'),
      pending:await keys('photobunker-identity-devices-v1','pending'),
      pins:await keys('photobunker-app-pin-v2','records'),
      deletePins:await keys('photobunker-local-delete-v1','pins'),
      photos:await keys('photobunker-local-prototype-v1','photos'),
      encrypted:await keys('photobunker-encrypted-queue-v1','entries'),
      workspace:await keys('photobunker-ui-workspace-v1','records'),
      messageKeys:await keys('photobunker-message-storage-v1','keys'),
      outbox:await keys('photobunker-message-outbox-v1','records'),
      folders:await keys('photobunker-private-messenger-folders-v1','private'),
      teams:await keys('photobunker-team-cache-v1','scopes'),
      presence:await keys('photobunker-private-presence-v1','records'),
      browsers:await keys('photobunker-photo-browser-cache-v1','records'),
      photoNames:await keys('photobunker-photo-names-v1','scopes'),
      shares:await keys('photobunker-card-share-intents-v1','records'),
      emergency:await keys('photobunker-emergency-v1','records'),
      command:await keys('photobunker-emergency-outbox-v1','commands'),
      matrixA:names.includes(`photobunker-matrix-${pairA}:synthetic`),
      matrixB:names.includes(`photobunker-matrix-${pairB}:synthetic`),
      localA:localStorage.getItem('scoped:'+A),localB:localStorage.getItem('scoped:'+B),
      activeDevice:localStorage.getItem('pb-active-device'),
    }
  },{A,B,DA,DB,OP,KEY})

  assert.deepEqual(result,{
    identity:[DB],pending:['root-b'],pins:[`app-pin:${B}:${DB}`],
    deletePins:[`local-delete:${B}:${DB}`],photos:['photo-b'],encrypted:[`job:${B}:b`],
    workspace:[`account:${B}:tasks:b`],messageKeys:[`${B}:${DB}`],
    outbox:[`key:${B}:${DB}`,`msg:${B}:${DB}:tx`],
    folders:[`data:${B}:${DB}`,`key:${B}:${DB}`],teams:[`team:${B}:${DB}`],
    presence:[`${B}:${DB}`],browsers:[`browser:${B}:${DB}:b`],
    photoNames:[`photo-names:${B}:${DB}`],shares:[`${B}:${DB}:b`],
    emergency:[`${B}:${DB}`],command:['active'],matrixA:false,matrixB:true,
    localA:null,localB:'b',activeDevice:null,
  })

  await page.reload()
  await expect(page.getByRole('heading',{name:'Сбой программы'})).toBeVisible()
  await expect(page.getByText('Добро пожаловать')).toHaveCount(0)
  console.log('chromium: emergency wipe removes exact account/device A, preserves B and resumes neutral cover')
} finally {
  await context.close()
  await browser.close()
}
