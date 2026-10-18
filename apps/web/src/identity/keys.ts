import { localPrototype } from '../local/photos'
import { identityRequest } from './api'
export type DeviceCredential = {id:string; publicId:string; publicKey:string; privateKey:CryptoKey; name:string}
export const b64 = (bytes:ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
export function unb64(value:string):Uint8Array<ArrayBuffer> { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('identity.invalid_key'); return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4)), char=>char.charCodeAt(0)) }
const algorithm = {name:'ECDSA', namedCurve:'P-256'}
async function database() {
  if (!localPrototype || !globalThis.indexedDB || !globalThis.crypto?.subtle) throw new Error('identity.storage_unavailable')
  return new Promise<IDBDatabase>((resolve,reject)=>{ const request=indexedDB.open('photobunker-identity-devices-v1',1); request.onupgradeneeded=()=>request.result.createObjectStore('devices',{keyPath:'id'}); request.onerror=()=>reject(request.error); request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)}; request.onblocked=()=>reject(new Error('identity.storage_blocked')) })
}
export async function saveCredential(value:DeviceCredential) {
  const db=await database()
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('devices','readwrite');tx.objectStore('devices').put(value);tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(tx.error)}})
}
export async function credentials():Promise<DeviceCredential[]> {
  const db=await database()
  return new Promise((resolve,reject)=>{const tx=db.transaction('devices');const request=tx.objectStore('devices').getAll();tx.oncomplete=()=>{db.close();resolve(request.result)};tx.onabort=()=>{db.close();reject(tx.error)}})
}
export async function newDevice(name:string):Promise<DeviceCredential> {const pair=await crypto.subtle.generateKey(algorithm,false,['sign','verify']);return {id:crypto.randomUUID(), publicId:'', name:name.trim(), privateKey:pair.privateKey,publicKey:b64(await crypto.subtle.exportKey('spki',pair.publicKey))}}
export async function createRoot() {const pair=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);const publicKey=b64(await crypto.subtle.exportKey('spki',pair.publicKey)), privateValue=b64(await crypto.subtle.exportKey('pkcs8',pair.privateKey));return {privateKey:pair.privateKey, publicKey, kit:`PB1.${publicKey}.${privateValue}`}}
export async function parseKit(value:string) { const parts=value.trim().split('.');if(parts.length!==3||parts[0]!=='PB1'||value.length>1000)throw new Error('identity.invalid_kit');return {publicKey:parts[1]!, privateKey:await crypto.subtle.importKey('pkcs8',unb64(parts[2]!),algorithm,false,['sign'])} }
export async function prove<T>(payload:Record<string,string>, key:CryptoKey):Promise<T> {
  const challenge=await identityRequest<{id:string;nonce:string;message:string;expiresAt:number}>('/challenges','POST',payload)
  const canonical=JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a],[b])=>a.localeCompare(b,'en'))))
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))].map(byte=>byte.toString(16).padStart(2,'0')).join('')
  const expected=`photobunker.identity.v1\n${payload.purpose}\n${challenge.id}\n${challenge.nonce}\n${digest}`
  if(challenge.message!==expected || challenge.expiresAt<=Date.now())throw new Error('identity.challenge_mismatch')
  const signature=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(expected)))
  return identityRequest<T>('/sessions','POST',{challengeId:challenge.id,signature})
}

export async function forgetCredentials() {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('devices', 'readwrite')
    tx.objectStore('devices').clear()
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}
