// Local unified reverse proxy:
//   - Serves the built frontend (dist/) on the root
//   - Proxies /api/* and /uploads/* to the backend on 127.0.0.1:4000
// Used by deploy/start-tunnel.* for the Cloudflare Quick Tunnel deployment.
// Pure Node (no extra deps) so it works on any Windows/Linux/Mac with Node 18+.

import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PROXY_PORT || 8080)
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:4000'
const DIST_DIR = resolve(fileURLToPath(new URL('../../dist/', import.meta.url)))
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
}

// Path prefixes proxied straight to backend (preserving sub-path + method + body + headers)
const PROXY_PREFIXES = ['/api/', '/uploads/']

function safeJoin(rel) {
  const cleaned = normalize(rel).replace(/^[\/\\]+/, '')
  const full = join(DIST_DIR, cleaned)
  if (!full.startsWith(DIST_DIR)) return null     // path-traversal guard
  return full
}

async function tryServeStatic(req, res, urlPath) {
  // 1) exact file in dist/ (assets with hash)
  let p = safeJoin(decodeURIComponent(urlPath))
  if (p && existsSync(p)) {
    const st = await stat(p)
    if (st.isFile()) return sendFile(p, res)
  }
  // 2) SPA fallback → dist/index.html
  const idx = join(DIST_DIR, 'index.html')
  if (existsSync(idx)) return sendFile(idx, res)
  res.statusCode = 404; res.end('index.html missing — run `npm run build`')
}

function sendFile(p, res) {
  const ext = extname(p).toLowerCase()
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=86400')
  readFile(p).then((buf) => { res.end(buf) }, (e) => { res.statusCode = 500; res.end(String(e)) })
}

function proxyToBackend(req, res) {
  const target = new URL(BACKEND)
  const opts = {
    hostname: target.hostname,
    port: target.port || 80,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: target.host },
  }
  const upstream = http.request(opts, (upRes) => {
    res.statusCode = upRes.statusCode || 502
    for (const [k, v] of Object.entries(upRes.headers)) {
      if (v !== undefined) res.setHeader(k, v)
    }
    upRes.pipe(res)
  })
  upstream.on('error', (e) => {
    res.statusCode = 502
    res.end(JSON.stringify({ code: 502, message: `backend unreachable: ${e.message}` }))
  })
  req.pipe(upstream)
}

const server = http.createServer(async (req, res) => {
  // Public base URL hint for the backend (lets it build absolute image URLs etc.)
  const fwdProto = req.headers['x-forwarded-proto'] || 'http'
  const fwdHost  = req.headers['x-forwarded-host']  || req.headers['host']
  if (fwdHost) {
    req.headers['x-forwarded-proto'] = fwdProto
    req.headers['x-forwarded-host']  = fwdHost
    const publicBase = `${fwdProto}://${fwdHost}`
    if (!process.env.PUBLIC_BASE_URL) req.headers['x-public-base-url'] = publicBase
  }

  if (PROXY_PREFIXES.some((p) => req.url.startsWith(p))) return proxyToBackend(req, res)
  // Allow GET only for static; reject anything else (POST/PUT go through proxy prefixes)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; return res.end('Method Not Allowed')
  }
  return tryServeStatic(req, res, req.url.split('?')[0])
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] serving ${DIST_DIR}`)
  console.log(`[proxy] backend → ${BACKEND}`)
  console.log(`[proxy] listening on http://127.0.0.1:${PORT}`)
})