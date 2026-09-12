// api/rows.js — 通用关系型 CRUD API
// 挂载点：/api/rows
//   GET    /api/rows/:table?page=&size=&filter={}&sort=&order=&q=   列表（分页/筛选/排序/搜索）
//   GET    /api/rows/:table/:id                                  读取单条
//   POST   /api/rows/:table                                       新增（body=行）
//   PUT    /api/rows/:table/:id                                   更新（body=部分字段）
//   DELETE /api/rows/:table/:id                                   删除（外键级联由 PRAGMA foreign_keys=ON 保证）
//
// 安全：表名走白名单（sqlite_master 用户表），列名走 PRAGMA 校验，值全部参数化。
// 敏感列（密码哈希/密钥类）永不通过通用 CRUD 下发/写入。
import { db } from '../db.js'

// 命中即视为敏感列（password / pwd / secret / token 前缀，不区分大小写），
// 通用 CRUD 一律剔除，既不返回也不允许写入。
const SENSITIVE_PREFIX = ['password', 'pwd', 'secret', 'token']
function isSensitive(col) {
  const c = col.toLowerCase()
  return SENSITIVE_PREFIX.some((p) => c.startsWith(p))
}
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function safeIdent(name) {
  if (!SAFE_NAME.test(name)) throw new Error('illegal identifier: ' + name)
  return name
}

// 计算可安全下发的列列表（剔除敏感列）
function safeCols(table) {
  return columns(table).map((c) => c.name).filter((n) => !isSensitive(n))
}

function userTables() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)
}

function columns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all()
}

function pkOf(table) {
  const cols = columns(table).filter((c) => c.pk > 0)
  if (cols.length === 0) return null
  return cols.length === 1 ? cols[0].name : cols.map((c) => c.name)
}

function isText(colType) {
  return /TEXT|CHAR|CLOB|VARCHAR|STRING/i.test(colType || '')
}

export async function handleRows(req, res, url, method, ctx) {
  const { send, readBody } = ctx
  const parts = url.pathname.split('/').filter(Boolean) // ['api','rows', table, id?]
  const table = parts[2]
  const id = parts[3]
  const tables = userTables()
  if (!table || !tables.includes(table)) {
    return send(404, { code: 404, message: 'unknown table: ' + table })
  }
  const cols = columns(table)
  const colNames = cols.map((c) => c.name)
  const selCols = safeCols(table) // 剔除敏感列（password_hash 等）
  const selSql = selCols.length ? selCols.map(safeIdent).join(',') : '*'
  const pk = pkOf(table)

  try {
    if (method === 'GET' && !id) {
      const sp = url.searchParams
      const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
      const size = Math.min(200, Math.max(1, parseInt(sp.get('size') || '50', 10) || 50))
      const order = (sp.get('order') || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

      const where = []
      const args = []
      const filterRaw = sp.get('filter')
      if (filterRaw) {
        try {
          const f = JSON.parse(filterRaw)
          for (const k of Object.keys(f)) {
            if (colNames.includes(k) && !isSensitive(k)) {
              where.push(`${safeIdent(k)} = ?`)
              args.push(f[k])
            }
          }
        } catch {
          /* ignore bad filter */
        }
      }
      const q = sp.get('q')
      if (q) {
        const textCols = colNames.filter((n) => !isSensitive(n) && isText(cols.find((c) => c.name === n).type))
        if (textCols.length) {
          const ors = textCols.map((n) => `${safeIdent(n)} LIKE ?`)
          where.push('(' + ors.join(' OR ') + ')')
          textCols.forEach(() => args.push(`%${q}%`))
        }
      }
      // app_meta 为键值表：敏感配置键（appSecret 等）永不通过 CRUD 下发
      let whereSql = where.length ? ' WHERE ' + where.join(' AND ') : ''
      if (table === 'app_meta') {
        const metaFilter = `${safeIdent('key')} NOT IN ('appSecret')`
        whereSql += whereSql ? ' AND ' + metaFilter : ' WHERE ' + metaFilter
      }
      const total = db.prepare(`SELECT COUNT(*) AS c FROM ${safeIdent(table)}${whereSql}`).get(...args).c
      const sort = sp.get('sort')
      const orderSql = sort && colNames.includes(sort) && !isSensitive(sort) ? ` ORDER BY ${safeIdent(sort)} ${order}` : ''
      const list = db
        .prepare(`SELECT ${selSql} FROM ${safeIdent(table)}${whereSql}${orderSql} LIMIT ? OFFSET ?`)
        .all(...args, size, (page - 1) * size)
      return send(200, { code: 0, message: 'ok', data: { list, total, page, size } })
    }

    if (method === 'GET' && id) {
      if (table === 'app_meta' && String(id).toLowerCase() === 'appsecret') {
        return send(404, { code: 404, message: 'not found' })
      }
      const row = db.prepare(`SELECT ${selSql} FROM ${safeIdent(table)} WHERE ${safeIdent(pk)} = ?`).get(id)
      if (!row) return send(404, { code: 404, message: 'not found' })
      return send(200, { code: 0, message: 'ok', data: row })
    }

    if (method === 'POST') {
      const body = await readBody()
      const insertCols = []
      const insertVals = []
      for (const c of cols) {
        if (isSensitive(c.name)) continue // 敏感列不允许通过 CRUD 写入
        if (c.pk > 0 && /INTEGER/i.test(c.type) && body[c.name] === undefined) continue
        if (body[c.name] !== undefined) {
          insertCols.push(safeIdent(c.name))
          insertVals.push(body[c.name] === '' ? null : body[c.name])
        }
      }
      const ph = insertCols.map(() => '?').join(',')
      const info = db
        .prepare(`INSERT INTO ${safeIdent(table)} (${insertCols.join(',')}) VALUES (${ph})`)
        .run(...insertVals)
      let pkVal
      if (pk && !Array.isArray(pk)) pkVal = body[pk] !== undefined ? body[pk] : info.lastInsertRowid
      const created = pkVal !== undefined ? db.prepare(`SELECT ${selSql} FROM ${safeIdent(table)} WHERE ${safeIdent(pk)} = ?`).get(pkVal) : null
      return send(200, { code: 0, message: 'ok', data: created })
    }

    if (method === 'PUT' && id) {
      const body = await readBody()
      const setCols = []
      const setVals = []
      for (const c of cols) {
        if (c.name === pk) continue
        if (isSensitive(c.name)) continue // 敏感列不允许通过 CRUD 写入
        if (body[c.name] !== undefined) {
          setCols.push(`${safeIdent(c.name)} = ?`)
          setVals.push(body[c.name] === '' ? null : body[c.name])
        }
      }
      if (setCols.length === 0) return send(400, { code: 400, message: 'no fields to update' })
      setVals.push(id)
      db.prepare(`UPDATE ${safeIdent(table)} SET ${setCols.join(',')} WHERE ${safeIdent(pk)} = ?`).run(...setVals)
      const updated = db.prepare(`SELECT ${selSql} FROM ${safeIdent(table)} WHERE ${safeIdent(pk)} = ?`).get(id)
      return send(200, { code: 0, message: 'ok', data: updated })
    }

    if (method === 'DELETE' && id) {
      db.prepare(`DELETE FROM ${safeIdent(table)} WHERE ${safeIdent(pk)} = ?`).run(id)
      return send(200, { code: 0, message: 'ok', data: { id } })
    }

    return send(405, { code: 405, message: 'method not allowed' })
  } catch (err) {
    return send(500, { code: 500, message: err.message })
  }
}
