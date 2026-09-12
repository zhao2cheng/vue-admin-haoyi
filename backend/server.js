// server.js — 极简 HTTP 服务（Node 内置 http，零第三方依赖）
// 路由：
//   POST /api/auth/login        { username, password } -> { token, user, mustChangePwd }
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import * as nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUser, db } from './db.js'
import { issueToken, verifyToken, hash, verify } from './auth.js'
import { handleRows } from './api/rows.js'
import { handleTx } from './api/tx.js'
import { loadUserPerms, checkRowsWrite, checkRowsRead, checkTx } from './api/permissions.js'

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = nodePath.join(__dirname, 'uploads')
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
const MAX_BODY = 8 * 1024 * 1024 // 请求体上限 8MB（防超大 body 打爆内存）

// ── 开放接口共享密钥 ──
// /api/open/*（小程序对接）无登录态，用共享密钥 X-Open-Key 校验；
// 生产必须设置 OPEN_API_KEY，缺省 fail-closed 拒绝启动；开发缺省用固定 dev 密钥。
const OPEN_API_KEY = process.env.OPEN_API_KEY
  || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('[server] 生产环境必须设置 OPEN_API_KEY 环境变量，拒绝启动') })()
    : 'dev-open-key')
if (!process.env.OPEN_API_KEY) {
  console.warn('[server] ⚠️ 未设置 OPEN_API_KEY，开放接口使用开发默认密钥 dev-open-key（生产必须设置）')
}

// CORS：生产建议通过 CORS_ORIGIN 收紧到业务域名，缺省开发放开
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*'
if (ALLOWED_ORIGIN === '*' && process.env.NODE_ENV === 'production') {
  console.warn('[server] ⚠️ 生产环境 CORS 仍为 *，建议通过 CORS_ORIGIN 收紧')
}

// ── 限流/计数：上传（每 IP 60s 30 次）+ 登录失败锁定（连续 5 次锁 10 分钟）──
// 内存结构仅存最近窗口内的条目，定时清理防泄漏
const uploadRate = new Map()
const loginAttempts = new Map()
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_LOCK_MS = 10 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [k, rec] of uploadRate) if (now - rec.ts > 120000) uploadRate.delete(k)
  for (const [k, rec] of loginAttempts) {
    if (rec.lockUntil && now > rec.lockUntil + 60000) loginAttempts.delete(k)
    else if (!rec.lockUntil && now - (rec.ts || now) > 60000) loginAttempts.delete(k)
  }
}, 60000).unref()

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
}

// ── 金额/时间工具：与 tx.js 保持同一套规范（金额：逗号两位小数 TEXT；时间：YYYY-MM-DD HH:mm:ss）──
function parseMoney(s) {
  const n = parseFloat(String(s ?? '0').replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}
function fmtMoney(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const PORT = process.env.PORT || 4000

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Open-Key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(obj))
  }
  // 请求体读取：带 8MB 上限，超限直接 413 并断开（resolve null 表示已处理溢出）
  const readBody = () =>
    new Promise((resolve) => {
      let b = ''
      let size = 0
      let overflow = false
      req.on('data', (c) => {
        if (overflow) return
        size += c.length
        if (size > MAX_BODY) {
          overflow = true
          try { send(413, { code: 413, message: '请求体过大' }) } catch { /* ignore */ }
          req.destroy()
          resolve(null)
          return
        }
        b += c
      })
      req.on('end', () => {
        if (overflow) return
        try {
          resolve(b ? JSON.parse(b) : {})
        } catch {
          resolve({})
        }
      })
    })

  // ── 静态资源：上传的图片（免鉴权，带目录穿越防护）──
  if (path.startsWith('/uploads/')) {
    const rel = decodeURIComponent(path.slice('/uploads/'.length))
    const filePath = nodePath.join(UPLOAD_DIR, rel)
    if (filePath !== UPLOAD_DIR && !filePath.startsWith(UPLOAD_DIR + nodePath.sep)) {
      return send(403, { code: 403, message: 'forbidden' })
    }
    if (!existsSync(filePath)) return send(404, { code: 404, message: 'not found' })
    try {
      const buf = await readFile(filePath)
      const ext = nodePath.extname(filePath).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(buf)
    } catch {
      return send(500, { code: 500, message: 'read error' })
    }
    return
  }

  // ── 小程序开放接口统一鉴权：共享密钥（X-Open-Key 头 或 ?key= 参数）──
  if (path.startsWith('/api/open/')) {
    const provided = req.headers['x-open-key'] || url.searchParams.get('key') || ''
    if (provided !== OPEN_API_KEY) {
      return send(401, { code: 401, message: '开放接口密钥无效' })
    }
  }

  // ── 小程序开放接口（免登录）：图片上传（base64 → 文件，零第三方依赖）──
  // 安全策略：① 大小限制(5MB) ② 真实文件类型校验(magic bytes) ③ 按真实类型落盘
  // ④ 每 IP 频率限制 ⑤ 共享密钥鉴权
  if (path === '/api/open/upload' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    if (!body.data || !body.fileName) return send(400, { code: 400, message: '缺少图片数据' })
    try {
      // 1) 解码 + 大小限制
      const buf = Buffer.from(String(body.data), 'base64')
      const MAX = 5 * 1024 * 1024
      if (buf.length === 0) return send(400, { code: 400, message: '图片内容为空' })
      if (buf.length > MAX) return send(413, { code: 413, message: '图片过大，请控制在 5MB 以内' })
      // 2) 真实文件类型校验（magic bytes），杜绝伪装文件
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
      const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46
      const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
      if (!isPng && !isJpg && !isGif && !isWebp) {
        return send(400, { code: 400, message: '仅支持 PNG / JPG / GIF / WEBP 图片' })
      }
      // 3) 按真实类型落盘，忽略前端给的扩展名
      const realExt = isPng ? 'png' : isJpg ? 'jpg' : isGif ? 'gif' : 'webp'
      // 4) 每 IP 频率限制：60 秒内最多 30 次
      const ip = clientIp(req)
      const now = Date.now()
      const rec = uploadRate.get(ip) || { count: 0, ts: now }
      if (now - rec.ts > 60000) { rec.count = 0; rec.ts = now }
      rec.count++
      uploadRate.set(ip, rec)
      if (rec.count > 30) return send(429, { code: 429, message: '上传过于频繁，请稍后再试' })
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${realExt}`
      if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
      await writeFile(nodePath.join(UPLOAD_DIR, name), buf)
      // 返回完整绝对 URL（带 host），否则小程序 <image> 会把相对路径当成本地资源而加载失败。
      // 生产部署必须返回 https：优先用 PUBLIC_BASE_URL（env 显式指定），否则按反向代理透传的
      // x-forwarded-proto 推导（nginx 配了 https 即为 https）；本地开发无该头时回退到请求 host + http。
      const proto = (req.headers['x-forwarded-proto'] || '').toLowerCase()
      const base =
        process.env.PUBLIC_BASE_URL ||
        `${proto || 'http'}://${req.headers.host || `127.0.0.1:${PORT}`}`
      return send(200, { code: 0, message: 'ok', data: { url: `${base}/uploads/${name}` } })
    } catch (e) {
      return send(500, { code: 500, message: '上传失败：' + e.message })
    }
  }

  // ── 登录（免鉴权，带失败锁定）──
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const ip = clientIp(req)
    const lockKey = `${ip}:${String(body.username || '').toLowerCase()}`
    const attempt = loginAttempts.get(lockKey)
    if (attempt && attempt.lockUntil && Date.now() < attempt.lockUntil) {
      const mins = Math.ceil((attempt.lockUntil - Date.now()) / 60000)
      return send(429, { code: 429, message: `尝试次数过多，账号已临时锁定 ${mins} 分钟后重试` })
    }
    const user = getUser(body.username)
    const pwdOk = user && verify(body.password || '', user.password_hash)
    if (!pwdOk) {
      const count = (attempt && !attempt.lockUntil ? attempt.count : 0) + 1
      if (count >= LOGIN_MAX_ATTEMPTS) {
        loginAttempts.set(lockKey, { count: 0, lockUntil: Date.now() + LOGIN_LOCK_MS, ts: Date.now() })
        return send(429, { code: 429, message: '连续登录失败次数过多，账号已临时锁定 10 分钟' })
      }
      loginAttempts.set(lockKey, { count, lockUntil: 0, ts: Date.now() })
      return send(401, { code: 401, message: '账号或密码错误' })
    }
    loginAttempts.delete(lockKey)
    if (user.status === 0) {
      return send(403, { code: 403, message: '账号已被禁用，请联系管理员' })
    }
    // 旧版 sha256 口令首次登录成功 → 升级为 scrypt 加盐哈希
    if (user.password_hash && !String(user.password_hash).startsWith('scrypt$')) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash(body.password), user.id)
    }
    const token = issueToken(user)
    const roleRow = user.role_id ? db.prepare('SELECT name, permissions FROM roles WHERE id = ?').get(user.role_id) : null
    const roleName = roleRow?.name || user.role || '管理员'
    let perms = []
    try { perms = roleRow?.permissions ? JSON.parse(roleRow.permissions) : [] } catch { perms = [] }
    return send(200, {
      code: 0,
      message: 'ok',
      data: {
        token,
        mustChangePwd: user.must_change_pwd === 1,
        user: { name: user.real_name, role: roleName, roleId: user.role_id, username: user.username, permissions: perms }
      }
    })
  }

  // ── 小程序开放接口（共享密钥）：接收回收申请 → 入库 + 生成通知 ──
  if (path === '/api/open/recycle-submit' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const bat = body.battery || {}
    if (!body.orderNo || !bat.type || !bat.brand) {
      return send(400, { code: 400, message: '缺少必要字段（orderNo / battery.type / battery.brand）' })
    }
    // 幂等：单号已存在则直接返回，不重复入单/通知
    const exists = db.prepare('SELECT id FROM recycle_orders WHERE id = ?').get(body.orderNo)
    if (!exists) {
      const nowStr = body.createdAt || fmtDateTime()
      db.prepare(
        `INSERT INTO recycle_orders
          (id, user_name, phone, brand, type, count, capacity, valuation, amount, status, time,
           address, source_type, source, contact, remarks, photos)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        body.orderNo,
        body.contact || '微信用户',
        body.phone || '',
        bat.brand,
        bat.type,
        Number(bat.count) || 1,
        bat.capacity || '',
        '0',                              // 待评估单，报价前金额为 0
        '0',                              // amount 与 valuation 保持一致
        'pending',                        // 页面映射「待评估」
        nowStr,
        body.location || '',
        'miniapp',
        'miniapp',                        // 来源标记：小程序提交
        body.contact || '微信用户',
        body.desc || '',
        body.photos ? JSON.stringify(body.photos) : null
      )
      db.prepare(
        `INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)`
      ).run(
        'recycle',
        '🔔 新回收报价',
        `${bat.type} ${bat.brand} x${bat.count}，等待评估报价（单号 ${body.orderNo}）。`,
        body.orderNo,
        'miniapp'
      )
      // 归集 C 端客户（按手机号 UPSERT；总额在打款事务里累加）
      if (body.phone) {
        db.prepare(
          `INSERT INTO customers (phone, name, address, order_count, total_value, first_order_no, last_order_time, updated_at)
           VALUES (?,?,?,1,?,?,?, datetime('now','localtime'))
           ON CONFLICT(phone) DO UPDATE SET
             name = excluded.name,
             address = excluded.address,
             order_count = order_count + 1,
             last_order_time = excluded.last_order_time,
             updated_at = excluded.updated_at`
        ).run(body.phone, body.contact || '微信用户', body.location || '', '0', body.orderNo, nowStr)
      }
    }
    return send(200, { code: 0, message: 'ok', data: { orderNo: body.orderNo, status: 'pending' } })
  }

  // ── 小程序开放接口（共享密钥）：按单号查询回收单（供小程序拉取后台报价）──
  if (path === '/api/open/recycle-get' && req.method === 'GET') {
    const orderNo = url.searchParams.get('orderNo')
    if (!orderNo) return send(400, { code: 400, message: '缺少 orderNo' })
    const row = db.prepare('SELECT * FROM recycle_orders WHERE id = ?').get(orderNo)
    return send(200, { code: 0, message: 'ok', data: row })
  }

  // ── 小程序开放接口（共享密钥）：拉取全部回收单（供小程序列表导入/状态同步）──
  if (path === '/api/open/recycle-list' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM recycle_orders ORDER BY id DESC').all()
    return send(200, { code: 0, message: 'ok', data: { list: rows } })
  }

  // ── 小程序开放接口（共享密钥）：管理员在小程序报价 → 同步后台 ──
  if (path === '/api/open/recycle-quote' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const { orderNo, price, remark } = body
    if (!orderNo || price === undefined || price === '') return send(400, { code: 400, message: '缺少必要字段' })
    const priceNum = parseMoney(price)
    if (!(priceNum > 0)) return send(400, { code: 400, message: '报价金额无效' })
    const valuation = fmtMoney(priceNum)
    const before = db.prepare('SELECT status FROM recycle_orders WHERE id = ?').get(orderNo)
    if (!before) return send(404, { code: 404, message: '订单不存在' })
    const wasQuoted = before.status === 'processing'
    db.prepare(
      "UPDATE recycle_orders SET valuation = ?, status = 'processing', remarks = ? WHERE id = ?"
    ).run(valuation, remark || '', orderNo)
    db.prepare(
      'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
    ).run(
      'recycle',
      wasQuoted ? '🔄 报价已修改' : '💰 已报价',
      wasQuoted
        ? `${orderNo} 报价已修改为 ¥${valuation}，等待用户确认。`
        : `${orderNo} 已在小程序报价 ¥${valuation}，等待用户确认。`,
      orderNo,
      'miniapp'
    )
    return send(200, { code: 0, message: 'ok', data: { orderNo, status: 'processing' } })
  }

  // ── 小程序开放接口（共享密钥）：用户接受报价 → 后台单完成 ──
  if (path === '/api/open/recycle-accept' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const { orderNo } = body
    if (!orderNo) return send(400, { code: 400, message: '缺少 orderNo' })
    const info = db.prepare("UPDATE recycle_orders SET status = 'completed' WHERE id = ?").run(orderNo)
    if (info.changes === 0) return send(404, { code: 404, message: '订单不存在' })
    return send(200, { code: 0, message: 'ok', data: { orderNo, status: 'completed' } })
  }

  // ── 小程序开放接口（共享密钥）：用户拒绝报价 → 后台单回到待评估并记录期望价 ──
  if (path === '/api/open/recycle-reject' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const { orderNo, expectPrice } = body
    if (!orderNo) return send(400, { code: 400, message: '缺少 orderNo' })
    const remark = expectPrice ? `用户期望 ¥${expectPrice}，等待重新报价。` : '用户拒绝报价，等待重新报价。'
    const info = db.prepare("UPDATE recycle_orders SET status = 'pending', remarks = ? WHERE id = ?").run(remark, orderNo)
    if (info.changes === 0) return send(404, { code: 404, message: '订单不存在' })
    db.prepare(
      'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
    ).run('recycle', '↩️ 用户拒绝报价', `${orderNo} 用户期望 ¥${expectPrice || '面议'}，请重新报价。`, orderNo, 'miniapp')
    return send(200, { code: 0, message: 'ok', data: { orderNo, status: 'pending' } })
  }

  // ── 小程序开放接口（共享密钥）：登记订单客户收款信息（报价接受后，业务员现场上传）──
  // 渠道枚举：微信 / 支付宝 / 银联云闪付 / 银行卡转账；幂等，可反复覆盖
  const PAY_CHANNELS = ['微信', '支付宝', '银联云闪付', '银行卡转账']
  if (path === '/api/open/order-payee-save' && req.method === 'POST') {
    try {
      const body = await readBody()
      if (body === null) return
      const orderNo = (body.orderNo || '').trim()
      const channel = (body.payeeChannel || '').trim()
      if (!orderNo) return send(400, { code: 400, message: '缺少 orderNo' })
      if (!PAY_CHANNELS.includes(channel)) {
        return send(400, { code: 400, message: '无效渠道，可选：' + PAY_CHANNELS.join('、') })
      }
      const order = db.prepare('SELECT id FROM recycle_orders WHERE id = ?').get(orderNo)
      if (!order) return send(404, { code: 404, message: '订单不存在' })
      const hasPayee =
        (body.payeeWechatQr || '').trim() || (body.payeeAlipayQr || '').trim() ||
        (body.payeeUnionpayQr || '').trim() || (body.payeeBankAccount || '').trim()
      if (!hasPayee) {
        return send(400, { code: 400, message: '请至少提供一个收款方式（任一收款码或银行卡号）' })
      }
      db.prepare(
        `UPDATE recycle_orders SET
           payee_channel = ?, payee_wechat_qr = ?, payee_alipay_qr = ?, payee_unionpay_qr = ?,
           payee_bank_holder = ?, payee_bank_name = ?, payee_bank_branch = ?, payee_bank_account = ?
         WHERE id = ?`
      ).run(
        channel,
        (body.payeeWechatQr || '').trim(),
        (body.payeeAlipayQr || '').trim(),
        (body.payeeUnionpayQr || '').trim(),
        (body.payeeBankHolder || '').trim(),
        (body.payeeBankName || '').trim(),
        (body.payeeBankBranch || '').trim(),
        (body.payeeBankAccount || '').trim(),
        orderNo
      )
      return send(200, { code: 0, message: 'ok', data: { orderNo, payeeChannel: channel } })
    } catch (err) {
      return send(500, { code: 500, message: '保存失败：' + err.message })
    }
  }

  // ── 小程序开放接口（共享密钥）：提交报销申请 → 入库 + 通知管理员 ──
  // 幂等：claimNo 已存在则直接返回，不重复入单/通知
  if (path === '/api/open/expense-submit' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const { claimNo, applicant, role, type, amount, date, invoiceCount, reason, createdAt } = body
    if (!claimNo || !type || amount === undefined || amount === '') {
      return send(400, { code: 400, message: '缺少必要字段（claimNo / type / amount）' })
    }
    const amtNum = parseMoney(amount)
    if (!(amtNum > 0)) return send(400, { code: 400, message: '报销金额无效' })
    const exists = db.prepare('SELECT id FROM expense_claims WHERE claim_no = ?').get(claimNo)
    if (!exists) {
      const nowStr = createdAt || fmtDateTime()
      const attJson = Array.isArray(body.attachments) && body.attachments.length
        ? JSON.stringify(body.attachments.map((a) => ({ kind: a.kind || 'file', name: a.name || '', path: a.path || '', size: a.size || 0 })))
        : null
      db.prepare(
        `INSERT INTO expense_claims
          (claim_no, applicant, role, type, amount, date, invoice_count, reason, status, attachments, created_at)
         VALUES (?,?,?,?,?,?,?,?,'待审批',?,?)`
      ).run(
        claimNo,
        applicant || (role === 'salesman' ? '业务员' : '员工'),
        role === 'salesman' ? 'salesman' : 'user',
        type,
        fmtMoney(amtNum),
        date || '',
        Number(invoiceCount) || 0,
        reason || '',
        attJson,
        nowStr
      )
      db.prepare(
        'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
      ).run(
        'expense',
        '🧾 新报销申请',
        `${applicant || '员工'}提交了 ${type} ¥${fmtMoney(amtNum)}，等待审批（单号 ${claimNo}）。`,
        claimNo,
        'miniapp'
      )
    }
    return send(200, { code: 0, message: 'ok', data: { claimNo, status: '待审批' } })
  }

  // ── 小程序开放接口（共享密钥）：拉取报销单列表（M1 无登录，返回全部，按创建时间倒序）──
  if (path === '/api/open/expense-list' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM expense_claims ORDER BY created_at DESC').all()
    return send(200, { code: 0, message: 'ok', data: { list: rows, total: rows.length } })
  }

  // ── 小程序开放接口（共享密钥）：发起物流申请（取货地址 / 货物 / 件数 / 预计几天到）──
  if (path === '/api/open/logistics-submit' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const { lgNo, applicant, pickupAddress, goods, qty, etaDays, carrier, carrierPhone, remark, createdAt } = body
    if (!lgNo || !pickupAddress || !goods) {
      return send(400, { code: 400, message: '缺少必要字段（lgNo / pickupAddress / goods）' })
    }
    const qtyNum = Number(qty) || 0
    if (!(qtyNum > 0)) return send(400, { code: 400, message: '件数无效' })
    const days = Math.max(1, Number(etaDays) || 1)
    // 幂等：单号已存在则直接返回，不重复入单/通知
    const exists = db.prepare('SELECT id FROM logistics_orders WHERE lg_no = ?').get(lgNo)
    if (!exists) {
      const nowStr = createdAt || fmtDateTime()
      // 预计到达日期 = 创建日期 + 预计天数
      const d = new Date(nowStr.replace(/-/g, '/'))
      const eta = new Date(d.getTime() + days * 86400000)
      const pad = (n) => String(n).padStart(2, '0')
      const expectDate = `${eta.getFullYear()}-${pad(eta.getMonth() + 1)}-${pad(eta.getDate())}`
      db.prepare(
        `INSERT INTO logistics_orders
          (lg_no, applicant, pickup_address, goods, qty, eta_days, expect_date,
           carrier, carrier_phone, status, remark, source, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,'待取货',?,?,?)`
      ).run(
        lgNo,
        applicant || '微信用户',
        pickupAddress,
        goods,
        qtyNum,
        days,
        expectDate,
        carrier || '',
        carrierPhone || '',
        remark || '',
        'miniapp',
        nowStr
      )
      db.prepare(
        'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
      ).run(
        'stock',
        '🚚 新物流申请',
        `${applicant || '微信用户'}发起物流：${goods} x${qtyNum} 件，取货地址「${pickupAddress}」，预计 ${days} 天到达（单号 ${lgNo}）。`,
        lgNo,
        'miniapp'
      )
    }
    return send(200, { code: 0, message: 'ok', data: { lgNo, status: '待取货' } })
  }

  // ── 小程序开放接口（共享密钥）：拉取物流单列表（按创建时间倒序，全量；状态由后台推进）──
  if (path === '/api/open/logistics-list' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM logistics_orders ORDER BY created_at DESC, id DESC').all()
    return send(200, { code: 0, message: 'ok', data: { list: rows, total: rows.length } })
  }

  // ── 小程序开放接口（共享密钥）：给物流单追加现场照片（先 /api/open/upload 得到 url 再挂单）──
  if (path === '/api/open/logistics-photo' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const { lgNo, url } = body
    if (!lgNo || !url) return send(400, { code: 400, message: '缺少必要字段（lgNo / url）' })
    // 只接受本服务 /uploads/ 下的图片地址，防止外部图片注入
    if (!/^https?:\/\/.+\/uploads\/[^/]+$/i.test(String(url))) {
      return send(400, { code: 400, message: '非法图片地址' })
    }
    const row = db.prepare('SELECT id, photos FROM logistics_orders WHERE lg_no = ?').get(lgNo)
    if (!row) return send(404, { code: 404, message: '物流单不存在: ' + lgNo })
    let arr = []
    try { arr = row.photos ? JSON.parse(row.photos) : [] } catch { arr = [] }
    if (!Array.isArray(arr)) arr = []
    if (arr.length >= 18) return send(400, { code: 400, message: '照片数量已达上限' })
    if (!arr.includes(url)) {
      arr.push(url)
      db.prepare('UPDATE logistics_orders SET photos = ? WHERE id = ?').run(JSON.stringify(arr), row.id)
    }
    return send(200, { code: 0, message: 'ok', data: { lgNo, photos: arr } })
  }

  // ── 小程序开放接口（共享密钥）：审批报销单（approve 通过 / reject 驳回）──
  if (path === '/api/open/expense-review' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const id = Number(body.id)
    const action = body.action === 'reject' ? 'reject' : 'approve'
    if (!id) return send(400, { code: 400, message: '缺少报销单 id' })
    if (action === 'reject' && !String(body.remark || '').trim()) {
      return send(400, { code: 400, message: '驳回必须填写原因' })
    }
    const cur = db.prepare('SELECT claim_no, type, amount, status FROM expense_claims WHERE id = ?').get(id)
    if (!cur) return send(404, { code: 404, message: '报销单不存在' })
    if (cur.status !== '待审批') return send(400, { code: 400, message: '该报销单已处理，不能重复审批' })
    const remark = String(body.remark || (action === 'approve' ? '同意报销' : '')).trim()
    const newStatus = action === 'approve' ? '已通过' : '已驳回'
    db.prepare('UPDATE expense_claims SET status = ?, review_remark = ?, review_time = ? WHERE id = ?')
      .run(newStatus, remark, fmtDateTime(), id)
    db.prepare(
      'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
    ).run(
      'expense',
      action === 'approve' ? '✅ 报销已通过' : '❌ 报销已驳回',
      action === 'approve'
        ? `报销单 ${cur.claim_no}（${cur.type} ¥${cur.amount}）已通过审批，财务将安排打款。`
        : `报销单 ${cur.claim_no}（${cur.type} ¥${cur.amount}）未通过审批：${remark}。`,
      cur.claim_no,
      'miniapp'
    )
    return send(200, { code: 0, message: 'ok', data: { id, status: newStatus } })
  }

  // ── 小程序开放接口（共享密钥）：撤销待审批的报销单 ──
  if (path === '/api/open/expense-withdraw' && req.method === 'POST') {
    const body = await readBody()
    if (body === null) return
    const id = Number(body.id)
    if (!id) return send(400, { code: 400, message: '缺少报销单 id' })
    const cur = db.prepare('SELECT claim_no, type, amount, status FROM expense_claims WHERE id = ?').get(id)
    if (!cur) return send(404, { code: 404, message: '报销单不存在' })
    if (cur.status !== '待审批') return send(400, { code: 400, message: '仅待审批的报销单可撤销' })
    db.prepare("UPDATE expense_claims SET status = '已撤销' WHERE id = ?").run(id)
    db.prepare(
      'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
    ).run(
      'expense',
      '↩️ 报销申请已撤销',
      `报销单 ${cur.claim_no}（${cur.type} ¥${cur.amount}）已被申请人撤销。`,
      cur.claim_no,
      'miniapp'
    )
    return send(200, { code: 0, message: 'ok', data: { id, status: '已撤销' } })
  }

  // ── 小程序/公开开放接口（共享密钥）：外部报价提交 → 写入 quotation_bids + 通知 ──
  if (path === '/api/open/quote-submit' && req.method === 'POST') {
    try {
      const body = await readBody()
      if (body === null) return
      const quotationId = (body.quotationId || body.q || '').trim()
      const name = (body.name || '').trim()
      const phone = (body.phone || '').trim()
      const items = Array.isArray(body.items) ? body.items : []
      if (!quotationId) return send(400, { code: 400, message: '缺少报价单号' })
      if (!name || !phone) return send(400, { code: 400, message: '请填写报价方名称和联系电话' })
      if (!items.length) return send(400, { code: 400, message: '报价清单不能为空' })
      // 金额解析（兼容 '21,000' / 21000 / '21000.00'）
      const toNum = (v) => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0
      const total = items.reduce((s, it) => s + toNum(it.price) * (Number(it.qty) || 1), 0)
      if (!(total > 0)) return send(400, { code: 400, message: '报价金额无效' })
      const itemsJson = JSON.stringify(items.map((it) => ({
        name: it.name || '', qty: Number(it.qty) || 1, unitPrice: toNum(it.price),
      })))
      const info = db.prepare(
        `INSERT INTO quotation_bids (quotation_id, name, price, payment, time, items_json, phone, logistics)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        quotationId, name, fmtMoney(total),
        body.payment || '全额预付', fmtDateTime(),
        itemsJson, phone, body.logistics || 'self'
      )
      const bidId = Number(info.lastInsertRowid)
      // 更新报价单投标计数
      db.prepare('UPDATE quotations SET submission_count = submission_count + 1 WHERE project_id = ? OR id = ?')
        .run(quotationId, quotationId)
      // 通知后台运营
      db.prepare(
        'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
      ).run('quote', '📨 新的竞价报价', `${quotationId} 收到 1 笔新报价 ¥${fmtMoney(total)}（报价方：${name}）。`, quotationId, 'system')
      return send(200, { code: 0, message: 'ok', data: { bidId, quotationId, total: fmtMoney(total) } })
    } catch (err) {
      return send(500, { code: 500, message: '提交失败：' + err.message })
    }
  }

  // ── 鉴权守卫：除登录外全部需要 Bearer Token ──
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const auth = verifyToken(token)
  if (!auth) return send(401, { code: 401, message: '未登录或登录已过期' })

  // ── 账号权限：解析当前用户的角色权限数组（超管 '*' 放行一切）──
  const userPerms = loadUserPerms(auth.id)

  // ── 关系型 CRUD API ──
  if (path.startsWith('/api/rows')) {
    // 写操作（POST/PUT/DELETE）按表校验权限；读操作（GET）敏感表按域校验，其余登录即可
    const parts = url.pathname.split('/').filter(Boolean)
    const table = parts[2]
    if (req.method !== 'GET') {
      const denied = checkRowsWrite(userPerms, table)
      if (denied) return send(403, { code: 403, message: denied })
    } else {
      const deniedRead = checkRowsRead(userPerms, table)
      if (deniedRead) return send(403, { code: 403, message: deniedRead })
    }
    return handleRows(req, res, url, req.method, { send, readBody, auth })
  }

  // ── 事务型业务 API ──
  if (path.startsWith('/api/tx')) {
    const action = url.pathname.split('/').filter(Boolean)[2]
    const denied = checkTx(userPerms, action)
    if (denied) return send(403, { code: 403, message: denied })
    return handleTx(req, res, url, req.method, { send, readBody, auth })
  }

  send(404, { code: 404, message: 'route not found: ' + path })
})

server.listen(PORT, () => {
  console.log(`[backend] running at http://localhost:${PORT}`)
})
