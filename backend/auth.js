// auth.js — 轻量 JWT 风格令牌（HMAC 签名，无第三方依赖）+ 密码哈希（scrypt 加盐）
import { createHmac, createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

// JWT 签名密钥：生产环境必须通过环境变量 JWT_SECRET 注入，缺省拒绝启动（fail-closed）
const SECRET = process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('[auth] 生产环境必须设置 JWT_SECRET 环境变量，拒绝启动') })()
    : (console.warn('[auth] ⚠️ 未设置 JWT_SECRET，使用内置开发密钥（生产环境必须设置）'),
       'zhichong-dev-secret-change-me'))

const ACCESS_TTL = 2 * 60 * 60 * 1000 // 2 小时

// ── 密码哈希：scrypt 加盐（格式 scrypt$<salt>$<derived>）──
// 相比无盐 SHA-256：抗彩虹表/暴力破解，Node 内置零依赖
export function hash(pw) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(String(pw), salt, 64).toString('hex')
  return `scrypt$${salt}$${derived}`
}

// ── 校验密码：兼容两种存储格式 ──
//   新版：scrypt$<salt>$<derived>（登录命中旧版时由调用方升级重写）
//   旧版：无盐 SHA-256（老库遗留，首次登录成功后自动升级为 scrypt）
export function verify(pw, stored) {
  if (!stored || typeof stored !== 'string') return false
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$')
    if (parts.length !== 3) return false
    const [, salt, keyHex] = parts
    const derived = scryptSync(String(pw), salt, 64)
    const expect = Buffer.from(keyHex, 'hex')
    return derived.length === expect.length && timingSafeEqual(derived, expect)
  }
  const legacy = createHash('sha256').update(String(pw)).digest('hex')
  const a = Buffer.from(legacy, 'hex')
  const b = Buffer.from(stored, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function issueToken(user) {
  const exp = Date.now() + ACCESS_TTL
  const payload = `${user.id}.${exp}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  if (!token) return null
  try {
    const [id, exp, sig] = token.split('.')
    if (!id || !exp || !sig) return null
    const expected = createHmac('sha256', SECRET).update(`${id}.${exp}`).digest('base64url')
    if (sig !== expected) return null
    if (Number(exp) < Date.now()) return null
    return { id: Number(id), exp: Number(exp) }
  } catch {
    return null
  }
}
