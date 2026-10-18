import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomBytes} from 'node:crypto'
const exec=promisify(execFile)
export async function command(binary,args){const {stdout}=await exec(binary,args,{timeout:60000,maxBuffer:512*1024});return stdout.trim()}
export async function readyMatrix(){for(let attempt=0;attempt<20;attempt++){try{await command('./scripts/dev',['api','php','artisan','photobunker:identity-maintain','--health']);return}catch{await new Promise(resolve=>setTimeout(resolve,500))}}throw new Error('Local Matrix readiness failed')}
export async function matrixRestoreDrill(account,device){
 const suffix=randomBytes(6).toString('hex'),name=`photobunker-matrix-restore-qa-${suffix}`,volume=`photobunker-matrix-restore-qa-${suffix}`
 const image='ghcr.io/matrix-construct/tuwunel:v1.9.4@sha256:0e86c6164d6c9f5b60291938eb61ad8395021c37fe58d47a963ea7edddbedaec'
 let originalStopped=false
 try{
  const container=await command('docker',['compose','ps','--quiet','matrix'])
  const inspection=JSON.parse(await command('docker',['inspect','--format','{{json .Mounts}}',container]))
  const source=inspection.find(mount=>mount.Destination==='/var/lib/tuwunel').Name
  await command('docker',['volume','create',volume]);await command('docker',['compose','stop','matrix']);originalStopped=true
  await command('docker',['run','--rm','--network','none','--mount',`type=volume,src=${source},dst=/source,readonly`,'--mount',`type=volume,src=${volume},dst=/restore`,'node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402','sh','-c','cp -a /source/. /restore/'])
  await command('docker',['compose','--profile','matrix','up','-d','matrix']);originalStopped=false;await readyMatrix()
  const configuration=JSON.parse(await command('docker',['inspect','--format','{{json .Mounts}}',container])).find(mount=>mount.Destination==='/etc/tuwunel.toml').Source
  // No ports, no external egress, and a distinct disposable volume.
  await command('docker',['run','-d','--name',name,'--network','photobunker_matrix-internal','--mount',`type=volume,src=${volume},dst=/var/lib/tuwunel`,'--mount',`type=bind,src=${configuration},dst=/etc/tuwunel.toml,readonly`,'-e','TUWUNEL_CONFIG=/etc/tuwunel.toml',image])
  let verified=false
  for(let attempt=0;attempt<20;attempt++){try{await command('./scripts/dev',['api','php','artisan','photobunker:matrix-probe',account,`--device=${device}`,`--restore-url=http://${name}:8008`]);verified=true;break}catch{await new Promise(resolve=>setTimeout(resolve,500))}}
  if(!verified)throw new Error('Matrix cold-backup restore probe failed')
 }finally{
  if(originalStopped){await command('docker',['compose','--profile','matrix','up','-d','matrix']);await readyMatrix()}
  const leftover=await command('docker',['ps','--all','--quiet','--filter',`name=^${name}$`])
  if(leftover)await command('docker',['rm','-f',name])
  const copy=await command('docker',['volume','ls','--quiet','--filter',`name=^${volume}$`])
  if(copy)await command('docker',['volume','rm',volume])
 }
}
