import { execFileSync } from 'node:child_process'
import { X509Certificate, createPrivateKey, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, chmod, access } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localDir = resolve(packageDir, '../../.local/browser-spike/tls')
const file = name => resolve(localDir, name)
const [command, ...args] = process.argv.slice(2)
process.umask(0o077)

function privateIPv4(ip) {
  const n = ip.split('.').map(Number)
  return n.length === 4 && n.every((v, i) => Number.isInteger(v) && v >= 0 && v <= 255 && String(v) === ip.split('.')[i]) &&
    (n[0] === 10 || n[0] === 192 && n[1] === 168 || n[0] === 172 && n[1] >= 16 && n[1] <= 31)
}

function addresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, items]) =>
    (items ?? []).filter(a => a.family === 'IPv4' && !a.internal && privateIPv4(a.address)).map(a => ({ name, ip: a.address })))
}

function chooseIP() {
  if (args.length && (args.length !== 2 || args[0] !== '--ip')) throw new Error('Usage: npm run device:setup -- [--ip PRIVATE_MAC_IPV4]')
  const available = addresses()
  if (args.length) {
    if (!privateIPv4(args[1]) || !available.some(a => a.ip === args[1])) throw new Error('IP must be a current private IPv4 address of this Mac.')
    return args[1]
  }
  const physical = available.filter(a => /^(en\d+|eth\d+|wlan\d+|wl\w+)$/.test(a.name))
  if (physical.length !== 1) throw new Error(`Choose the LAN address explicitly with --ip. Candidates: ${available.map(a => `${a.name}=${a.ip}`).join(', ')}`)
  return physical[0].ip
}

function openssl(args) {
  // Arguments are passed directly, never interpolated into a shell. Key bytes
  // and noisy key-generation diagnostics do not enter terminal/CI output.
  execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
}

async function exists(path) { try { await access(path); return true } catch { return false } }

async function setup() {
  const ip = chooseIP()
  await mkdir(localDir, { recursive: true, mode: 0o700 })
  await chmod(localDir, 0o700)
  const caPresent = await Promise.all(['ca.key', 'ca.pem'].map(name => exists(file(name))))
  if (caPresent.some(Boolean) && !caPresent.every(Boolean)) throw new Error('Incomplete local CA; inspect .local/browser-spike/tls before replacing it.')
  if (!caPresent[0]) {
    const name = `PhotoBunker Local Lab ${randomBytes(3).toString('hex')}`
    await writeFile(file('ca.cnf'), `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=${name}\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`, { mode: 0o600 })
    openssl(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '90', '-config', file('ca.cnf'), '-keyout', file('ca.key'), '-out', file('ca.pem')])
  }
  const ca = new X509Certificate(await readFile(file('ca.pem')))
  if (!ca.ca || !ca.checkPrivateKey(createPrivateKey(await readFile(file('ca.key')))) || Date.parse(ca.validTo) < Date.now() + 31 * 86400000) throw new Error('Local CA is invalid or nearing expiry; remove its iPhone profile before generating a replacement.')
  await writeFile(file('server.cnf'), `[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN=PhotoBunker Browser Lab\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${ip},IP:127.0.0.1,DNS:localhost\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`, { mode: 0o600 })
  openssl(['req', '-new', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-config', file('server.cnf'), '-keyout', file('server.key'), '-out', file('server.csr')])
  openssl(['x509', '-req', '-sha256', '-days', '30', '-in', file('server.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-set_serial', `0x${randomBytes(16).toString('hex')}`, '-extfile', file('server.cnf'), '-extensions', 'server', '-out', file('server.pem')])
  await writeFile(file('photobunker-lab-ca.cer'), ca.raw, { mode: 0o600 })
  await writeFile(file('device.json'), JSON.stringify({ ip }, null, 2) + '\n', { mode: 0o600 })
  for (const name of ['ca.key', 'server.key']) await chmod(file(name), 0o600)
  console.log(`Local CA: ${ca.subject}\nSHA-256: ${ca.fingerprint256}\nPublic certificate: ${file('photobunker-lab-ca.cer')}\nDevice URL: https://${ip}:5443\nNext: npm run device (build + HTTPS lab). No system trust settings were changed.`)
}

async function serve() {
  if (args.length) throw new Error('Usage: npm run device')
  const { ip } = JSON.parse(await readFile(file('device.json'), 'utf8'))
  if (!privateIPv4(ip) || !addresses().some(a => a.ip === ip)) throw new Error('LAN address changed. Run device:setup again; the existing CA is preserved.')
  const [key, cert, caBytes] = await Promise.all(['server.key', 'server.pem', 'ca.pem'].map(name => readFile(file(name))))
  const leaf = new X509Certificate(cert)
  const ca = new X509Certificate(caBytes)
  if (!leaf.checkIP(ip) || !leaf.verify(ca.publicKey) || !leaf.checkPrivateKey(createPrivateKey(key)) || Date.parse(leaf.validFrom) > Date.now() || Date.parse(leaf.validTo) <= Date.now()) throw new Error('Invalid/expired lab certificate; run device:setup again.')
  await access(resolve(packageDir, 'dist/index.html'))
  const labs = []
  const certificates = []
  const close = async () => {
    for (const server of certificates) server.closeAllConnections()
    await Promise.all([...labs.map(lab => lab.close()), ...certificates.map(server => new Promise(resolve => server.close(resolve)))])
  }
  // Bootstrap serves exactly one public certificate, never a directory or app.
  // AirDrop of the same .cer is also supported; private CA/server keys stay local.
  const download = (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.url !== '/photobunker-lab-ca.cer' || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', 'application/x-x509-ca-cert')
    res.setHeader('Content-Disposition', 'attachment; filename="photobunker-lab-ca.cer"')
    res.end(req.method === 'HEAD' ? undefined : ca.raw)
  }
  try {
    // Separate loopback listeners let the Mac verify TLS/routes without broad
    // 0.0.0.0 exposure. Only the selected LAN IP is available to the phone.
    for (const host of [ip, '127.0.0.1']) {
      labs.push(await preview({ root: packageDir, configFile: resolve(packageDir, 'vite.config.ts'), preview: { host, port: 5443, strictPort: true, https: { key, cert } } }))
      const certificate = createServer(download)
      await new Promise((resolve, reject) => { certificate.once('error', reject); certificate.listen(5181, host, resolve) })
      certificates.push(certificate)
    }
  } catch (error) { await close(); throw error }
  console.log(`iPhone HTTPS: https://${ip}:5443\nPublic CA download: http://${ip}:5181/photobunker-lab-ca.cer\nMac verification: https://127.0.0.1:5443 (same certificate)\nCA: ${ca.subject}\nSHA-256: ${ca.fingerprint256}\nUse the same trusted LAN. Ctrl+C stops all lab listeners.`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await close(); process.exit(0) })
}

try {
  if (command === 'setup') await setup()
  else if (command === 'serve') await serve()
  else throw new Error('Usage: node scripts/device.mjs setup|serve')
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Missing OpenSSL, build, or local certificates. See the lab README.' : error instanceof Error && !('stderr' in error) ? error.message : 'Local certificate operation failed; no key material is logged.')
  process.exitCode = 1
}
