// api/tx.js — 事务型业务操作（关键动作必须原子 + 留痕）
//   POST /api/tx/pay-execute     支付执行：更新流水状态 + 写支付日志（事务）
//   POST /api/tx/supplier-pay    供应商付款：FIFO 回写采购单 + 写付款台账/资金流水/支付日志（事务）
//   POST /api/tx/stock-writeoff  库存核销：扣减批次/库存项 + 写核销记录（事务）
//   POST /api/tx/audit-post      盘点入账：写盘点结果明细 + 标记计划完成（事务）
//   POST /api/tx/recycle-pay     回收打款：回写回收单 + 写资金流水/支付日志 + 累加客户总额（事务）
//   POST /api/tx/purchase-inbound 采购入库：加库存项 + 建批次 + 完成采购单（事务）
//   POST /api/tx/sales-outbound   销售出库：扣库存项 + 写核销记录 + 更新销售单（事务）
//   POST /api/tx/stock-transfer   库存调拨：源仓扣减 + 目标仓累加/新建 + 核销留痕（事务）
//   POST /api/tx/qc-record        质检录入：更新批次健康度 + 质检指标/备注（事务）
//   POST /api/tx/commission-settle 提成结算：generate 生成绩效 / pay 发放 / apply-plan 批量方案 / audit 单条审核（事务）
//   POST /api/tx/return-outbound  采购退货：单据置退货 + 回退付款状态 + 通知（事务）
//   POST /api/tx/quote-accept     报价录用：报价单置已录用 + 标记最优 + 自动生成销售单（事务）
//   POST /api/tx/audit-start      启动盘点：计划置进行中（事务）
//   POST /api/tx/permission-sync  权限同步：角色权限模板对齐回写（事务）
//   POST /api/tx/account-save     支付账户保存：写入 payment_accounts（事务）
import { db, getUserById, hash, verify } from '../db.js'

function fmtDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 手动事务包裹（Node node:sqlite 的 db.transaction 仅接受单条 SQL 字符串，
// 多语句原子操作需用 BEGIN/COMMIT/ROLLBACK）
function withTx(fn) {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function operatorName(ctx) {
  const uid = ctx?.auth?.id
  if (!uid) return 'system'
  const u = getUserById(uid)
  return u?.real_name || u?.username || `u${uid}`
}

// ── 金额解析/格式化（库内金额统一存逗号 TEXT）──
function parseMoney(s) {
  const n = parseFloat(String(s ?? '0').replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}
function fmtMoney(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function payExecute(body, ctx) {
  const { flowId, paidAmount, account, itemClass, channel } = body
  if (!flowId) throw new Error('缺少 flowId')
  return withTx(() => {
    const flow = db.prepare('SELECT * FROM settlement_flows WHERE id = ?').get(flowId)
    if (!flow) throw new Error('流水不存在')
    if (flow.status === '已结算') throw new Error('该流水已结算，不可重复支付')
    db.prepare(
      "UPDATE settlement_flows SET status='已结算', account=?, item_class=? WHERE id=?"
    ).run(account, itemClass, flowId)
    db.prepare(
      'INSERT INTO pay_logs (flow_id, paid_amount, account, item_class, channel, operator) VALUES (?,?,?,?,?,?)'
    ).run(flowId, paidAmount, account, itemClass, channel || '微信码', operatorName(ctx))
    return { id: flowId, status: '已结算' }
  })
}

async function supplierPay(body, ctx) {
  const { supplier, amount, account, channel, remark, payee, bank_account, bank_name } = body
  if (!supplier) throw new Error('缺少供应商')
  const amt = parseMoney(amount)
  if (!(amt > 0)) throw new Error('付款金额必须大于 0')

  return withTx(() => {
    // 1) 取该供应商未结清采购单（FIFO：id 升序），再按数值精筛（兼容逗号 TEXT 与 NULL）
    const pos = db.prepare(
      `SELECT * FROM purchase_orders
        WHERE supplier = ? AND (payment_status IS NULL OR payment_status != 'paid')
        ORDER BY id ASC`
    ).all(supplier)
    // 采购单金额列历史不统一：种子数据在 total，迁移数据在 amount，两者兼容
    const poTotal = (p) => parseMoney(p.total) || parseMoney(p.amount)
    const open = pos.filter((p) => poTotal(p) - parseMoney(p.paid_amount) > 0.005)
    if (!open.length) throw new Error('该供应商暂无待付款采购单')

    // 2) FIFO 分配并回写采购单
    let remaining = amt
    const allocation = []
    for (const po of open) {
      if (remaining <= 0.005) break
      const total = poTotal(po)
      const paid = parseMoney(po.paid_amount)
      const due = total - paid
      const apply = Math.min(due, remaining)
      const newPaid = paid + apply
      const newStatus = newPaid >= total - 0.005 ? 'paid' : 'unpaid'
      db.prepare('UPDATE purchase_orders SET paid_amount = ?, payment_status = ? WHERE id = ?')
        .run(fmtMoney(newPaid), newStatus, po.id)
      allocation.push({ poId: po.id, poNo: po.po_no || String(po.id), applied: fmtMoney(apply), status: newStatus })
      remaining -= apply
    }
    const appliedTotal = amt - remaining
    if (appliedTotal <= 0.005) throw new Error('付款金额未覆盖任何待付款采购单')
    if (remaining > 0.005) throw new Error(`付款金额 ${fmtMoney(amt)} 超过待付余额 ${fmtMoney(appliedTotal)}`)

    // 3) 收款方兜底：body 优先，其次 suppliers 档案
    const supRow = db.prepare('SELECT * FROM suppliers WHERE name = ?').get(supplier)
    const payeeName = payee || supRow?.name || supplier
    const bankAcct = bank_account || supRow?.bank_account || ''
    const bankNm = bank_name || supRow?.bank_name || ''

    // 4) 写供应商付款记录（付款台账）
    const info = db.prepare(
      `INSERT INTO supplier_payments (pay_no, supplier, amount, account, channel, payee, bank_account, bank_name, status, operator, remark, allocation, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'))`
    ).run('', supplier, fmtMoney(appliedTotal), account || '', channel || '银行转账', payeeName, bankAcct, bankNm, '已付款', operatorName(ctx), remark || '', JSON.stringify(allocation))
    const payId = Number(info.lastInsertRowid)
    const payNo = `SP${String(payId).padStart(4, '0')}`
    db.prepare('UPDATE supplier_payments SET pay_no = ? WHERE id = ?').run(payNo, payId)

    // 5) 写全局资金流水（结算台账，直接置「已结算」，在业绩结算中心可见）
    const flowInfo = db.prepare(
      `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, payee_no, status)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(fmtDateTime(), '支出', payNo, fmtMoney(appliedTotal), account || '', '采购货款', payeeName, bankAcct, '已结算')
    const flowId = Number(flowInfo.lastInsertRowid)

    // 6) 写支付执行日志（与 payExecute 同款事务留痕）
    db.prepare(
      'INSERT INTO pay_logs (flow_id, paid_amount, account, item_class, channel, operator) VALUES (?,?,?,?,?,?)'
    ).run(flowId, fmtMoney(appliedTotal), account || '', '采购货款', channel || '银行转账', operatorName(ctx))

    return { payId, payNo, amount: fmtMoney(appliedTotal), supplier, allocation }
  })
}

// ── C 阶段：回收打款 → 财务闭环 ──
// 打款渠道由出款账户推导：微信账户→微信码、支付宝账户→支付宝码、其余→银行转账
function channelOf(account) {
  if (/微信/.test(account || '')) return '微信码'
  if (/支付宝/.test(account || '')) return '支付宝码'
  return '银行转账'
}

async function recyclePay(body, ctx) {
  const { orderId, amount, account, itemClass } = body
  if (!orderId) throw new Error('缺少订单号')
  const amt = parseMoney(amount)
  if (!(amt > 0)) throw new Error('打款金额必须大于 0')
  return withTx(() => {
    const order = db.prepare('SELECT * FROM recycle_orders WHERE id = ?').get(orderId)
    if (!order) throw new Error('回收订单不存在: ' + orderId)
    const valuation = parseMoney(order.valuation)
    const paid = parseMoney(order.paid_amount)
    const newPaid = paid + amt
    if (newPaid > valuation + 0.005) throw new Error(`打款 ${fmtMoney(newPaid)} 超过估值 ¥${fmtMoney(valuation)}`)
    const isFullyPaid = newPaid >= valuation - 0.005

    // 1) 回写回收订单（全款时标记 paid，并记录真实打款时间）
    const now = fmtDateTime()
    db.prepare('UPDATE recycle_orders SET paid_amount = ?, paid = ?, payment_applied = ?, paid_time = ? WHERE id = ?')
      .run(fmtMoney(newPaid), isFullyPaid ? 1 : 0, 1, now, orderId)

    // 2) 全局资金流水（支出、直接置已结算，业绩结算中心可见）
    const flowInfo = db.prepare(
      `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, payee_no, status)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      fmtDateTime(),
      '支出', orderId, fmtMoney(amt), account || '', itemClass || '回收货款',
      order.user_name || '微信用户', order.phone || '', '已结算'
    )
    const flowId = Number(flowInfo.lastInsertRowid)

    // 3) 支付执行日志（与 payExecute 同款事务留痕）
    db.prepare(
      'INSERT INTO pay_logs (flow_id, paid_amount, account, item_class, channel, operator) VALUES (?,?,?,?,?,?)'
    ).run(flowId, fmtMoney(amt), account || '', itemClass || '回收货款', channelOf(account), operatorName(ctx))

    // 4) 累加 C 端客户回收总额（按手机号）
    if (order.phone) {
      const cus = db.prepare('SELECT * FROM customers WHERE phone = ?').get(order.phone)
      if (cus) {
        const newTotal = parseMoney(cus.total_value) + amt
        db.prepare('UPDATE customers SET total_value = ? WHERE id = ?').run(fmtMoney(newTotal), cus.id)
      }
    }

    return { orderId, newPaid: fmtMoney(newPaid), isFullyPaid: isFullyPaid ? 1 : 0, paidTime: now }
  })
}

async function stockWriteoff(body, ctx) {
  const { stockItemId, batchId, qty, reason } = body
  if (!stockItemId || !batchId || !qty) throw new Error('参数不完整')
  return withTx(() => {
    const batch = db.prepare('SELECT * FROM stock_batches WHERE id = ?').get(batchId)
    if (!batch) throw new Error('批次不存在')
    const newAmt = (batch.amount || 0) - qty
    if (newAmt < 0) throw new Error('核销数量超过批次可用量')
    if (newAmt === 0) db.prepare('DELETE FROM stock_batches WHERE id = ?').run(batchId)
    else db.prepare('UPDATE stock_batches SET amount = ? WHERE id = ?').run(newAmt, batchId)

    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(stockItemId)
    if (!item) throw new Error('库存项不存在')
    const newQty = Math.max(0, (item.qty || 0) - qty)
    const newValue = item.cost_price ? item.cost_price * newQty : item.value
    db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?').run(newQty, newValue, stockItemId)
    db.prepare(
      'INSERT INTO stock_writeoffs (stock_item_id, batch_id, qty, reason, operator) VALUES (?,?,?,?,?)'
    ).run(stockItemId, batchId, qty, reason || '', operatorName(ctx))
    // 补写资金流水（报损销账的资产减值损失在业绩结算中心 Tab3 可见）
    const lossAmount = (item.cost_price || 0) * qty
    if (lossAmount > 0) {
      db.prepare(
        `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, status)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        fmtDateTime(),
        '支出', String(stockItemId), fmtMoney(lossAmount), '',
        '报损销账', item.name || '', '待结算'
      )
    }
    return { ok: true }
  })
}

async function auditPost(body, ctx) {
  const { planId, results } = body
  if (!planId || !Array.isArray(results) || !results.length) throw new Error('参数不完整')
  return withTx(() => {
    const plan = db.prepare('SELECT * FROM audit_plans WHERE id = ?').get(planId)
    if (!plan) throw new Error('盘点计划不存在')
    const opName = operatorName(ctx)
    for (const r of results) {
      if (!r.stockItemId) throw new Error('盘点明细缺少 stockItemId')
      db.prepare(
        'INSERT INTO audit_results (plan_id, stock_item_id, book_qty, real_qty, diff) VALUES (?,?,?,?,?)'
      ).run(planId, r.stockItemId, r.bookQty, r.realQty, (r.realQty || 0) - (r.bookQty || 0))
      // D3：以实盘为准，把差异入账到库存；同步资产估值（value = cost_price × realQty）
      const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(r.stockItemId)
      const newValue = item && item.cost_price ? item.cost_price * (r.realQty || 0) : (item ? item.value : 0)
      db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?').run(r.realQty, newValue, r.stockItemId)
      // 关联库存查询：差异≠0 写 stock_writeoffs 流水，出入库流水/核销查询可见盘点调整
      const diff = (r.realQty || 0) - (r.bookQty || 0)
      if (diff !== 0) {
        const reason = (diff > 0 ? '盘点盘盈 ' : '盘点盘亏 ') + (plan.plan_no || '')
        db.prepare(
          'INSERT INTO stock_writeoffs (stock_item_id, batch_id, qty, reason, operator) VALUES (?,?,?,?,?)'
        ).run(r.stockItemId, '', Math.abs(diff), reason, opName)
        // 补写资金流水（盘点盈亏的财务影响在业绩结算中心 Tab3 可见）
        const adjustAmount = (item && item.cost_price ? item.cost_price : 0) * Math.abs(diff)
        if (adjustAmount > 0) {
          db.prepare(
            `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, status)
             VALUES (?,?,?,?,?,?,?,?)`
          ).run(
            fmtDateTime(),
            diff > 0 ? '收入' : '支出',
            plan.plan_no || String(planId),
            fmtMoney(adjustAmount), '',
            diff > 0 ? '盘点盘盈' : '盘点盘亏',
            opName, '待结算'
          )
        }
      }
    }
    db.prepare("UPDATE audit_plans SET status='已完成', progress=100 WHERE id=?").run(planId)
    return { ok: true }
  })
}

// ── D1：采购入库 → 加库存 + 建批次 + 完成采购单 ──
async function purchaseInbound(body, ctx) {
  const { purchaseOrderId, items, recycleOrderId, warehouseId } = body
  if (!purchaseOrderId) throw new Error('缺少采购单号')
  if (!Array.isArray(items) || !items.length) throw new Error('缺少入库明细')
  return withTx(() => {
    // 兼容前端传 po_no（TEXT）或数据库主键 id（INTEGER）
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? OR po_no = ?').get(purchaseOrderId, purchaseOrderId)
    if (!po) throw new Error('采购单不存在: ' + purchaseOrderId)
    // 解析关联键：优先用入参，其次从主单读
    const rid = recycleOrderId || po.recycle_order_id || ''
    const pid = po.id
    const poNo = po.po_no || String(pid)
    items.forEach((it, i) => {
      const qty = Number(it.qty)
      if (!it.stockItemId || !(qty > 0)) throw new Error(`第 ${i + 1} 条入库明细不完整`)
      const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(it.stockItemId)
      if (!item) throw new Error('库存项不存在: ' + it.stockItemId)
      const newQty = (item.qty || 0) + qty
      const newValue = item.cost_price ? item.cost_price * newQty : (item.value || 0)
      db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?').run(newQty, newValue, it.stockItemId)
      const batchId = `BIN${poNo}-${it.stockItemId}-${i + 1}`
      db.prepare(
        'INSERT INTO stock_batches (id, stock_item_id, batch_no, mfd, amount, health, recycle_order_id, purchase_order_id) VALUES (?,?,?,?,?,?,?,?)'
      ).run(batchId, it.stockItemId, it.batchNo || '', it.mfd || '', qty, 100, rid, String(pid))
    })
    // 若主单携带来源回收单，把 source_type 升级为 recycle（首次入库时记录）
    if (rid && (!po.source_type || po.source_type === 'direct')) {
      db.prepare("UPDATE purchase_orders SET source_type = 'recycle', recycle_order_id = ?, warehouse_id = COALESCE(?, warehouse_id) WHERE id = ?")
        .run(rid, warehouseId || '', pid)
    }
    db.prepare("UPDATE purchase_orders SET status = 'completed', step = 6 WHERE id = ?").run(pid)
    return { purchaseOrderId: pid, poNo, inboundCount: items.length, recycleOrderId: rid, warehouseId: warehouseId || '' }
  })
}

// ── D0：采购单创建 → 写主单 + N 条明细子表 ──
async function purchaseOrderCreate(body, ctx) {
  const { po } = body
  const items = Array.isArray(body.items) ? body.items : []
  if (!po || !po.po_no) throw new Error('缺少采购单号 po_no')
  if (!po.supplier) throw new Error('请填写供应商')
  if (!items.length) throw new Error('请至少添加一条采购明细')
  return withTx(() => {
    const totalAmount = items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unit_price || 0), 0)
    const headItem = items[0]
    const ins = db.prepare(`INSERT INTO purchase_orders
       (po_no, supplier, payment_terms, item, unit_price, qty, amount, tax_rate, status, step, type,
        product_name, price, total, source_type, recycle_order_id, warehouse_id, payment_status, delivery_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      po.po_no, po.supplier, po.payment_terms || '月结30天',
      headItem.product_name || headItem.name || '通用物资',
      Number(headItem.unit_price) || 0,
      Number(headItem.qty) || 0,
      totalAmount,
      String(po.tax_rate || '13'),
      'pending_approval', 1, po.type || '通用物资',
      headItem.product_name || headItem.name || '',
      String(headItem.unit_price || ''),
      String(totalAmount),
      po.recycle_order_id ? 'recycle' : 'direct',
      po.recycle_order_id || '',
      po.warehouse_id || '',
      'unpaid',
      po.delivery_date || ''
    )
    const pid = Number(ins.lastInsertRowid)
    const stmt = db.prepare(`INSERT INTO purchase_order_items
       (po_no, product_name, spec, serial_no, qty, unit, unit_price, amount, stock_item_id, recycle_order_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`)
    for (const it of items) {
      stmt.run(po.po_no,
        it.product_name || it.name || '', it.spec || '', it.serial_no || '',
        Number(it.qty) || 0, it.unit || '组', Number(it.unit_price) || 0,
        Number(it.qty || 0) * Number(it.unit_price || 0),
        Number(it.stock_item_id) || null,
        po.recycle_order_id || '')
    }
    const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(pid)
    const subRows = db.prepare('SELECT * FROM purchase_order_items WHERE po_no = ?').all(po.po_no)
    return { id: pid, po_no: row.po_no, total: row.total, status: row.status, source_type: row.source_type, recycle_order_id: row.recycle_order_id, items: subRows }
  })
}

// ── D2：销售出库 → 扣库存 + 写核销记录 + 更新销售单 ──
async function salesOutbound(body, ctx) {
  const { salesOrderId, items, logisticsCo, trackingNo } = body
  if (!salesOrderId) throw new Error('缺少销售单号')
  if (!Array.isArray(items) || !items.length) throw new Error('缺少出库明细')
  return withTx(() => {
    const so = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(salesOrderId)
    if (!so) throw new Error('销售单不存在: ' + salesOrderId)
    for (const it of items) {
      const qty = Number(it.qty)
      if (!(qty > 0)) throw new Error('出库明细不完整')
      // 库存项解析兼容三态：stock_items.id（主键）→ stock_batches.id（批次）→ sku（前端 SKU）
      let item = null
      if (it.stockItemId) {
        item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(it.stockItemId)
        if (!item) {
          const bat = db.prepare('SELECT * FROM stock_batches WHERE id = ?').get(it.stockItemId)
          if (bat) item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(bat.stock_item_id)
        }
      }
      if (!item && it.sku) item = db.prepare('SELECT * FROM stock_items WHERE sku = ?').get(it.sku)
      if (!item) throw new Error('库存项不存在: ' + (it.stockItemId || it.sku || '?'))
      const newQty = (item.qty || 0) - qty
      if (newQty < 0) throw new Error(`库存不足：${item.name} 仅剩 ${item.qty || 0}`)
      const newValue = item.cost_price ? item.cost_price * newQty : (item.value || 0)
      db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?').run(newQty, newValue, item.id)
      db.prepare(
        'INSERT INTO stock_writeoffs (stock_item_id, batch_id, qty, reason, operator) VALUES (?,?,?,?,?)'
      ).run(item.id, salesOrderId, qty, '销售出库', operatorName(ctx))
    }
    db.prepare("UPDATE sales_orders SET status = 'shipping', logistics_co = ?, tracking_no = ? WHERE id = ?")
      .run(logisticsCo || '', trackingNo || '', salesOrderId)
    return { salesOrderId, outboundCount: items.length }
  })
}

async function staffCreate(body, ctx) {
  const { name, username, deptId, roleId, password } = body
  if (!name || !username) throw new Error('缺少姓名或登录账号')
  const displayName = '@' + String(username).replace('@', '').toUpperCase()
  const loginName = String(username).replace('@', '').toLowerCase()
  const pwd = password || '123456'
  return withTx(() => {
    // 角色 → role_id 校验 + 取角色名
    const role = roleId ? db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) : null
    if (roleId && !role) throw new Error('角色不存在: ' + roleId)
    // 登录账号唯一性
    const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(loginName)
    if (dup) throw new Error('登录账号已存在: ' + loginName)
    // 1) 员工档案（staff，@ 前缀展示账号）
    db.prepare('INSERT INTO staff (name, username, dept_id, role, role_id, status) VALUES (?,?,?,?,?,?)')
      .run(name, displayName, deptId || null, role?.name || '员工', roleId || null, '正常')
    // 2) 登录账号（users，去 @ 小写 + sha256 密码）
    db.prepare('INSERT INTO users (username, password_hash, real_name, role_id, dept_id, status) VALUES (?,?,?,?,?,?)')
      .run(loginName, hash(pwd), name, roleId || null, deptId || null, 1)
    return { username: loginName, initialPassword: pwd, roleName: role?.name || '员工' }
  })
}

// ── 修改本人密码（初始账号强制改密闭环：must_change_pwd 置 1 → 改密后置 0）──
// body: { oldPassword, newPassword }
async function passwordChange(body, ctx) {
  const uid = ctx?.auth?.id
  if (!uid) throw new Error('未登录')
  const { oldPassword, newPassword } = body
  if (!newPassword || String(newPassword).length < 6) throw new Error('新密码长度至少 6 位')
  if (String(oldPassword || '') === String(newPassword)) throw new Error('新密码不能与原密码相同')
  const u = getUserById(uid)
  if (!u) throw new Error('账号不存在')
  if (!verify(String(oldPassword || ''), u.password_hash)) throw new Error('原密码不正确')
  return withTx(() => {
    db.prepare('UPDATE users SET password_hash = ?, must_change_pwd = 0 WHERE id = ?')
      .run(hash(newPassword), uid)
    return { ok: true }
  })
}

async function notificationBatch(body) {
  const { op } = body || {}
  if (op === 'read-all') {
    const info = db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
    return { op, count: info.changes }
  }
  if (op === 'clear-all') {
    const info = db.prepare('DELETE FROM notifications').run()
    return { op, count: info.changes }
  }
  throw new Error('未知操作: ' + op)
}

// ── E1：库存调拨 → 源仓扣减 + 目标仓累加/新建 + 核销留痕 ──
async function stockTransfer(body, ctx) {
  const { stockItemId, fromWarehouse, toWarehouse, qty, remark } = body
  if (!stockItemId || !toWarehouse) throw new Error('参数不完整（缺少库存项或调入仓库）')
  const n = Number(qty)
  if (!(n > 0)) throw new Error('调拨数量必须大于 0')
  return withTx(() => {
    const src = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(stockItemId)
    if (!src) throw new Error('库存项不存在: ' + stockItemId)
    if (fromWarehouse && src.warehouse && src.warehouse !== fromWarehouse) {
      throw new Error(`库存项当前在「${src.warehouse}」，与所选调出仓库不一致`)
    }
    const srcQty = src.qty || 0
    if (n > srcQty) throw new Error(`调拨数量超过可用库存（当前 ${srcQty}）`)

    // 1) 源仓扣减
    const newSrcQty = srcQty - n
    const newSrcValue = src.cost_price ? src.cost_price * newSrcQty : (src.value || 0)
    db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?')
      .run(newSrcQty, newSrcValue, stockItemId)

    // 2) 目标仓：同 SKU 已存在则累加，否则新建
    const dst = db.prepare('SELECT * FROM stock_items WHERE sku = ? AND warehouse = ?')
      .get(src.sku, toWarehouse)
    if (dst) {
      const newDstQty = (dst.qty || 0) + n
      const newDstValue = src.cost_price ? src.cost_price * newDstQty : (dst.value || 0)
      db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?')
        .run(newDstQty, newDstValue, dst.id)
    } else {
      db.prepare(
        'INSERT INTO stock_items (name, sku, category, qty, unit, warehouse, cost_price, value) VALUES (?,?,?,?,?,?,?,?)'
      ).run(src.name, src.sku, src.category, n, src.unit, toWarehouse, src.cost_price, src.cost_price ? src.cost_price * n : null)
    }

    // 3) 核销留痕（调拨视作库存移动，可在核销台账追溯）
    db.prepare(
      'INSERT INTO stock_writeoffs (stock_item_id, batch_id, qty, reason, operator) VALUES (?,?,?,?,?)'
    ).run(stockItemId, `TRANSFER-${Date.now()}`, n, '库存调拨' + (remark ? `：${remark}` : ''), operatorName(ctx))
    return { stockItemId, fromWarehouse: src.warehouse, toWarehouse, qty: n, dstId: dst ? dst.id : null }
  })
}

// ── E2：质检录入 → 更新批次健康度 + 质检指标/备注 ──
async function qcRecord(body, ctx) {
  const { batchId, health, remark, values } = body
  if (!batchId) throw new Error('缺少批次号')
  return withTx(() => {
    const batch = db.prepare('SELECT * FROM stock_batches WHERE id = ?').get(batchId)
    if (!batch) throw new Error('批次不存在: ' + batchId)
    db.prepare('UPDATE stock_batches SET health = ?, remark = ?, qc_values = ? WHERE id = ?')
      .run(health ?? batch.health, remark ?? batch.remark, values ? JSON.stringify(values) : batch.qc_values, batchId)
    return { batchId, health: health ?? batch.health }
  })
}

// ── E3：提成结算（月度绩效）──
//   op='generate'   生成月度绩效记录（前端传入绩效明细）
//   op='pay'        单笔发放：commissions 状态置已发放 + 写资金流水/支付日志
//   op='apply-plan' 批量方案：按部门范围更新待发放记录的提成比例
//   op='audit'      单笔审核：approve/reject，写入审核人/时间/意见
async function commissionSettle(body, ctx) {
  const { op } = body || {}
  if (op === 'generate') {
    const { month, staffList } = body
    if (!month || !Array.isArray(staffList) || !staffList.length) throw new Error('缺少月份或绩效明细')
    return withTx(() => {
      let created = 0
      for (const s of staffList) {
        const recycleVal = s.recycleVal || '0'
        const salesVal = s.salesVal || '0'
        const base = parseMoney(recycleVal) + parseMoney(salesVal)
        const rate = Number(s.rate) || 0
        const finalAmount = base * rate / 100
        db.prepare(
          `INSERT INTO commissions (month, staff_name, dept, recycle_val, sales_val, base, rate, final_amount, status, operator)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).run(
          month, s.name, s.dept || '', fmtMoney(parseMoney(recycleVal)), fmtMoney(parseMoney(salesVal)),
          fmtMoney(base), rate, fmtMoney(finalAmount), '待发放', operatorName(ctx)
        )
        created++
      }
      return { op, month, created }
    })
  }
  if (op === 'pay') {
    const { id, account } = body
    if (!id) throw new Error('缺少提成记录 id')
    return withTx(() => {
      const c = db.prepare('SELECT * FROM commissions WHERE id = ?').get(id)
      if (!c) throw new Error('提成记录不存在: ' + id)
      if (c.status === '已发放') throw new Error('该提成已发放，不可重复发放')
      if (c.audit_status !== '已审核') throw new Error('该提成尚未审核通过，不可发放（请先在审核列完成审核）')
      db.prepare("UPDATE commissions SET status='已发放', settled_at = datetime('now','localtime'), operator = ? WHERE id = ?")
        .run(operatorName(ctx), id)
      // 写全局资金流水（支出、已结算，业绩结算中心可见）
      const flowInfo = db.prepare(
        `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, status)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        fmtDateTime(),
        '支出', `COMM-${String(id).padStart(4, '0')}`, c.final_amount,
        account || '', '提成佣金', c.staff_name, '已结算'
      )
      db.prepare(
        'INSERT INTO pay_logs (flow_id, paid_amount, account, item_class, channel, operator) VALUES (?,?,?,?,?,?)'
      ).run(Number(flowInfo.lastInsertRowid), c.final_amount, account || '', '提成佣金', '银行转账', operatorName(ctx))
      return { op: 'pay', id, staffName: c.staff_name, amount: c.final_amount, status: '已发放' }
    })
  }
  if (op === 'apply-plan') {
    const { rate, scope } = body
    const r = Number(rate)
    if (!(r > 0 && r <= 100)) throw new Error('提成比例必须在 0–100 之间')
    return withTx(() => {
      let where = "status = '待发放'"
      const args = []
      if (Array.isArray(scope) && scope.length) {
        // scope 可能传前端 code（sales_dept_1/2）或部门名，统一映射为部门名
        const DEPT_MAP = { sales_dept_1: '销售一部', sales_dept_2: '销售二部', new_staff: '新人' }
        const deptNames = scope
          .filter((s) => typeof s === 'string')
          .map((s) => DEPT_MAP[s] || s)
        if (deptNames.length) {
          where += ` AND dept IN (${deptNames.map(() => '?').join(',')})`
          args.push(...deptNames)
        }
      }
      const rows = db.prepare(`SELECT id, base FROM commissions WHERE ${where}`).all(...args)
      if (!rows.length) throw new Error('所选范围内没有待发放的提成记录，请先执行月度结算生成记录')
      for (const row of rows) {
        const base = parseMoney(row.base)
        db.prepare('UPDATE commissions SET rate = ?, final_amount = ? WHERE id = ?')
          .run(r, fmtMoney(base * r / 100), row.id)
      }
      return { op: 'apply-plan', rate: r, affected: rows.length }
    })
  }
  //   op='audit'   单条审核：decision=approve|reject，写入 audit_status/auditor/audit_time/comment
  //                  已发放的记录禁止再审核；驳回必填意见
  if (op === 'audit') {
    const { id, decision, comment } = body
    if (!id) throw new Error('缺少提成记录 id')
    if (!['approve', 'reject'].includes(decision)) throw new Error('审核结果必须为 approve 或 reject')
    return withTx(() => {
      const c = db.prepare('SELECT id, status, audit_status FROM commissions WHERE id = ?').get(id)
      if (!c) throw new Error('提成记录不存在: ' + id)
      if (c.status === '已发放') throw new Error('已发放的提成不可再审核（资金已结算）')
      if (decision === 'reject' && !(comment || '').trim()) {
        throw new Error('驳回时必须填写审核意见')
      }
      const nextAudit = decision === 'approve' ? '已审核' : '已驳回'
      const now = fmtDateTime()
      const auditor = operatorName(ctx)
      db.prepare(
        `UPDATE commissions
         SET audit_status = ?, auditor = ?, audit_time = ?, audit_comment = ?
         WHERE id = ?`
      ).run(nextAudit, auditor, now, (comment || '').trim(), id)
      return { op: 'audit', id, auditStatus: nextAudit, auditor, auditTime: now }
    })
  }
  throw new Error('未知操作: ' + op)
}

// ── E4：采购退货出库 → 单据置退货 + 回退付款状态 ──
async function returnOutbound(body, ctx) {
  const { purchaseOrderId, reason } = body
  if (!purchaseOrderId) throw new Error('缺少采购单号')
  return withTx(() => {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? OR po_no = ?').get(purchaseOrderId, purchaseOrderId)
    if (!po) throw new Error('采购单不存在: ' + purchaseOrderId)
    if (po.status === 'returned') throw new Error('该采购单已在退货流程中')
    db.prepare("UPDATE purchase_orders SET status='returned', payment_status='unpaid' WHERE id = ?").run(po.id)
    db.prepare(
      'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
    ).run('order', '↩️ 采购退货', `${po.po_no || po.id} 已启动退货出库${reason ? '：' + reason : ''}，请及时联系供应商处理退款。`, po.po_no || String(po.id), 'system')
    // 补写资金流水（采购退货触发供应商退款，在业绩结算中心 Tab3 可见）
    const refundAmount = parseMoney(po.total) || parseMoney(po.amount)
    if (refundAmount > 0) {
      db.prepare(
        `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, payee_no, status)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(
        fmtDateTime(),
        '收入', po.po_no || String(po.id), fmtMoney(refundAmount), '',
        '采购退货退款', po.supplier || '', '', '待结算'
      )
    }
    return { purchaseOrderId: po.id, poNo: po.po_no, status: 'returned' }
  })
}

// ── E5：报价录用 → 报价单置已录用 + 竞价标记最优 + 自动生成销售单 ──
async function quoteAccept(body, ctx) {
  const { quotationId, bidId } = body
  if (!quotationId) throw new Error('缺少报价单号')
  return withTx(() => {
    const q = db.prepare('SELECT * FROM quotations WHERE id = ? OR project_id = ?').get(quotationId, quotationId)
    if (!q) throw new Error('报价单不存在: ' + quotationId)
    if (q.status === 'accepted') throw new Error('该报价单已录用，不可重复转单')
    // 1) 报价单置已录用
    db.prepare("UPDATE quotations SET status = 'accepted' WHERE id = ?").run(q.id)
    // 2) 竞价标记最优（指定则标记，未指定自动取最低价/最高价）
    if (bidId) {
      db.prepare('UPDATE quotation_bids SET is_best = 0 WHERE quotation_id = ?').run(q.project_id || q.id)
      db.prepare('UPDATE quotation_bids SET is_best = 1 WHERE id = ?').run(bidId)
    }
    // 3) 取中标方案明细 → 生成销售单
    let bid = null
    if (bidId) bid = db.prepare('SELECT * FROM quotation_bids WHERE id = ?').get(bidId)
    if (!bid) bid = db.prepare('SELECT * FROM quotation_bids WHERE quotation_id = ? AND is_best = 1').get(q.project_id || q.id)
    const items = bid?.items_json ? JSON.parse(bid.items_json) : []
    const soId = `SO-${q.project_id || q.id}-${Date.now().toString().slice(-6)}`
    const total = bid?.price || q.total || '0'
    const summary = items.length
      ? items.map((i) => `${i.name || ''} x${i.qty ?? 1}`).join('、').slice(0, 80)
      : (q.target || q.project || '')
    db.prepare(
      `INSERT INTO sales_orders (id, customer, product_summary, item_count, total, status, time, items_json, quotation_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      soId,
      bid?.name || '竞价客户',
      summary,
      items.length || 1,
      total,
      'pending_outbound',
      fmtDateTime(),
      JSON.stringify(items.map((i) => ({ productName: i.name, sku: '', price: i.unitPrice || 0, amount: i.qty || 1 }))),
      q.project_id || String(q.id)
    )
    db.prepare(
      'INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)'
    ).run('quote', '✅ 报价已录用', `${q.target || q.project} 已录用 ${bid?.name || '客户'} 的方案，销售单 ${soId} 已生成。`, q.project_id || String(q.id), 'system')
    return { quotationId: q.project_id || q.id, bidId: bid?.id, salesOrderId: soId, customer: bid?.name || '竞价客户' }
  })
}

// ── E6：启动盘点任务 ──
async function auditStart(body, ctx) {
  const { planId } = body
  if (!planId) throw new Error('缺少盘点计划 id')
  return withTx(() => {
    const plan = db.prepare('SELECT * FROM audit_plans WHERE id = ?').get(planId)
    if (!plan) throw new Error('盘点计划不存在: ' + planId)
    if (plan.status === '已完成') throw new Error('该盘点计划已完成，不可重复启动')
    db.prepare("UPDATE audit_plans SET status = '进行中' WHERE id = ?").run(planId)
    return { planId, planNo: plan.plan_no, status: '进行中' }
  })
}

// ── E7：权限同步 → 角色权限模板对齐回写（与 db.js 种子策略一致）──
async function permissionSync(body) {
  const ROLE_PERMS = {
    超级管理员: ['*'],
    管理员: ['*'],
    销售经理: ['sales', 'recycle', 'finance'],
    销售代表: ['sales', 'recycle', 'finance'],
    财务专员: ['finance'],
    财务审计: ['finance'],
    仓库管理员: ['inventory', 'recycle'],
    仓库WMS: ['inventory', 'recycle'],
  }
  return withTx(() => {
    let updated = 0
    for (const [rname, rperms] of Object.entries(ROLE_PERMS)) {
      const info = db.prepare('UPDATE roles SET permissions = ? WHERE name = ?')
        .run(JSON.stringify(rperms), rname)
      updated += info.changes
    }
    // 兼容 roles 表里存在但模板未覆盖的角色：权限置空数组兜底
    const all = db.prepare('SELECT name FROM roles').all()
    for (const r of all) {
      if (!(r.name in ROLE_PERMS)) {
        const info = db.prepare('UPDATE roles SET permissions = ? WHERE name = ?')
          .run('[]', r.name)
        updated += info.changes
      }
    }
    return { op: 'sync', updated }
  })
}

// ── E8：支付账户保存 → 写入 payment_accounts（业绩结算中心维护）──
async function accountSave(body, ctx) {
  const { name, no, type, balance } = body
  if (!name || !no) throw new Error('请填写账户名称和账号')
  return withTx(() => {
    const info = db.prepare(
      'INSERT INTO payment_accounts (name, no, type, balance) VALUES (?,?,?,?)'
    ).run(name, no, type || 'bank', balance ? String(balance) : '0.00')
    const row = db.prepare('SELECT * FROM payment_accounts WHERE id = ?').get(Number(info.lastInsertRowid))
    return { id: row.id, name: row.name, no: row.no, type: row.type, balance: row.balance }
  })
}

// ── 回收退货发起（事务）：return_applied=1 + 建支出流水（待结算） + flow_id 回写到订单 ──
// body: { orderId, reason }
async function recycleReturnStart(body, ctx) {
  const { orderId, reason } = body
  if (!orderId) throw new Error('缺少回收单号')
  return withTx(() => {
    const order = db.prepare('SELECT * FROM recycle_orders WHERE id = ?').get(orderId)
    if (!order) throw new Error('回收订单不存在: ' + orderId)
    if (order.return_applied === 1) throw new Error('该订单已在退货处理中')
    if (order.return_applied === 2) throw new Error('该订单退货已完成，无需重新启动')
    const refundAmount = parseMoney(order.paid_amount)
    if (refundAmount <= 0) throw new Error('该订单尚未打款，无需退款')

    const now = fmtDateTime()
    // 1) 写一条「支出-待结算」流水（item_class: 回收退款-处理中）
    const flowInfo = db.prepare(
      `INSERT INTO settlement_flows (time, type, order_id, amount, account, item_class, payee, payee_no, status)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      now, '支出', orderId, fmtMoney(refundAmount), '',
      '回收退款-处理中', order.user_name || '回收客户', order.phone || '',
      '待结算'
    )
    const flowId = Number(flowInfo.lastInsertRowid)

    // 2) 更新回收单 return_applied=1 + return_flow_id 回写
    db.prepare(
      "UPDATE recycle_orders SET return_applied = 1, return_time = ?, return_flow_id = ?, remarks = ? WHERE id = ?"
    ).run(now, flowId, reason || '退货处理中，款项原路退回', orderId)

    return { orderId, flowId, refundAmount: fmtMoney(refundAmount), status: '退货处理中' }
  })
}

// ── 回收退货完成（事务）：return_applied=2 + 待结算流水改已结算 + 写 pay_logs ──
// body: { orderId }
async function recycleReturnDone(body, ctx) {
  const { orderId } = body
  if (!orderId) throw new Error('缺少回收单号')
  return withTx(() => {
    const order = db.prepare('SELECT * FROM recycle_orders WHERE id = ?').get(orderId)
    if (!order) throw new Error('回收订单不存在: ' + orderId)
    if (order.return_applied !== 1) throw new Error('该订单未处于退货处理中，无法完成退货')
    const flowId = order.return_flow_id
    if (!flowId) throw new Error('该订单未关联退款流水，请联系管理员')

    const now = fmtDateTime()
    // 1) 关闭那条「待结算」流水 → 已结算
    const flow = db.prepare('SELECT * FROM settlement_flows WHERE id = ?').get(flowId)
    if (flow && flow.status !== '已结算') {
      db.prepare("UPDATE settlement_flows SET status = '已结算', time = ? WHERE id = ?").run(now, flowId)
    }
    // 2) 写支付执行日志（与 payExecute 同款留痕）；item_class 与 settlement_flows 维度对齐（不掺杂状态后缀）
    if (flow) {
      db.prepare(
        'INSERT INTO pay_logs (flow_id, paid_amount, account, item_class, channel, operator) VALUES (?,?,?,?,?,?)'
      ).run(
        flowId, flow.amount || '', '', '回收退款-处理中',
        order.payee_channel === '微信' ? '微信码' : order.payee_channel === '支付宝' ? '支付宝码' : '银行转账',
        operatorName(ctx)
      )
    }
    // 3) 更新回收单 return_applied=2 + return_done_time + remarks
    db.prepare(
      "UPDATE recycle_orders SET return_applied = 2, return_done_time = ?, remarks = ? WHERE id = ?"
    ).run(now, '退货已完成，款项已原路退回', orderId)

    return { orderId, flowId, status: '退货完成' }
  })
}

// ── 物流入库（事务）：已到达的物流单 → 加库存项 + 建批次 + 置已入库 + 通知 ──
// body: { id, warehouse }  warehouse 可选（缺省用物流单 dest_warehouse，再缺省取第一个仓库）
async function logisticsInbound(body, ctx) {
  const id = Number(body.id)
  if (!id) throw new Error('缺少物流单 id')
  return withTx(() => {
    const lo = db.prepare('SELECT * FROM logistics_orders WHERE id = ?').get(id)
    if (!lo) throw new Error('物流单不存在: ' + id)
    if (lo.status !== '已到达') throw new Error('仅「已到达」的物流单可入库')
    const qty = Number(lo.qty) || 0
    if (!(qty > 0)) throw new Error('物流单件数无效，无法入库')

    // 入库仓库：body > 物流单 > 第一个仓库
    let wh = body.warehouse || lo.dest_warehouse
    if (!wh) {
      const first = db.prepare('SELECT name FROM warehouses ORDER BY id LIMIT 1').get()
      wh = first?.name || ''
    }

    // 库存项按「货物名 + 仓库」合并：已存在则累加，否则新建
    let item = db.prepare('SELECT * FROM stock_items WHERE name = ? AND warehouse = ?').get(lo.goods, wh)
    if (item) {
      const newQty = (item.qty || 0) + qty
      const newValue = item.cost_price ? item.cost_price * newQty : (item.value || 0)
      db.prepare('UPDATE stock_items SET qty = ?, value = ? WHERE id = ?').run(newQty, newValue, item.id)
    } else {
      const info = db.prepare(
        `INSERT INTO stock_items (name, sku, category, qty, unit, locked, warehouse, cost_price, value)
         VALUES (?,?,?,?,'件',0,?,0,0)`
      ).run(lo.goods, '', '待分类', qty, wh)
      item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(Number(info.lastInsertRowid))
    }

    // 入库批次留痕（关联物流单号，便于追溯）
    db.prepare(
      `INSERT INTO stock_batches (id, stock_item_id, batch_no, mfd, amount, health, purchase_order_id)
       VALUES (?,?,?,?,?,100,?)`
    ).run(`LIN-${lo.lg_no}-${item.id}`, item.id, lo.lg_no, '', qty, `物流入库:${lo.lg_no}`)

    // 物流单置已入库
    db.prepare(
      "UPDATE logistics_orders SET status = '已入库', dest_warehouse = ?, inbound_time = datetime('now','localtime') WHERE id = ?"
    ).run(wh, id)

    // 通知留痕
    db.prepare('INSERT INTO notifications (type, title, content, ref_id, source) VALUES (?,?,?,?,?)')
      .run('stock', '📦 物流已入库', `${lo.lg_no}（${lo.goods} x${qty} 件）已入库至「${wh}」。`, lo.lg_no, 'system')

    return { id, lgNo: lo.lg_no, stockItemId: item.id, qty, warehouse: wh, operator: operatorName(ctx) }
  })
}

// ── 回收订单创建（事务）：写主单 + N 条明细 + valuation=sum(items.amount) ──
// body: { order: { id, date, supplier, ... }, items: [{ product_name, spec, serial_no, qty, unit, unit_price, need_dismantle, remark }] }
async function recycleOrderCreate(body, ctx) {
  const { order = {}, items = [] } = body
  if (!order.id) throw new Error('缺少订单号 id')
  if (!Array.isArray(items) || items.length === 0) throw new Error('至少需要一条资产明细')
  return withTx(() => {
    // 1) 行金额 + 应付总额
    const enriched = items.map((it, idx) => {
      const qty = Math.max(1, parseInt(it.qty, 10) || 1)
      const unitPrice = parseMoney(it.unit_price)
      const amount = qty * unitPrice
      return {
        order_id: order.id,
        product_id: it.product_id || null,
        product_name: it.product_name || '未知资产',
        spec: it.spec || '',
        serial_no: it.serial_no || `SN-${order.id}-${String(idx + 1).padStart(3, '0')}`,
        qty,
        unit: it.unit || '组',
        unit_price: fmtMoney(unitPrice),
        amount: fmtMoney(amount),
        need_dismantle: it.need_dismantle ? 1 : 0,
        remark: it.remark || '',
      }
    })
    const totalAmount = enriched.reduce((s, it) => s + parseMoney(it.amount), 0)
    const valuation = fmtMoney(totalAmount)

    // 2) 写主单 recycle_orders（valuation 取 sum(明细)，前端传入的 valuation 仅作兜底）
    db.prepare(
      `INSERT INTO recycle_orders
        (id, user_name, phone, brand, type, count, capacity, valuation, amount, status, time,
         payment_applied, paid, paid_amount, address, date, supplier, source_type, source, warehouse,
         summary, total_items, commission, freight_amount, freight_payer, payment_type,
         has_dismantle_items, remarks, contact)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      order.id,
      order.user_name || order.supplier || '',
      order.phone || '',
      order.brand || '',
      order.type || '',
      order.count || enriched.length,
      order.capacity || '',
      valuation,
      valuation,                         // amount 与 valuation 保持一致
      order.status || 'pending',
      order.time || fmtDateTime(),
      order.payment_applied ?? 0,
      order.paid ?? 0,
      order.paid_amount || '0.00',
      order.address || '',
      order.date || new Date().toISOString().split('T')[0],
      order.supplier || '',
      order.source_type || 'enterprise',
      'manual',                          // 来源标记：销售手动录入
      order.warehouse || '',
      order.summary || enriched.map((it) => it.product_name).join(', '),
      enriched.length,
      order.commission || fmtMoney(totalAmount * 0.012),
      order.freight_amount ?? 0,
      order.freight_payer || '对方',
      order.payment_type || '现结',
      enriched.some((it) => it.need_dismantle) ? 1 : 0,
      order.remarks || '',
      order.contact || ''
    )

    // 3) 循环写明细行
    const insertItem = db.prepare(
      `INSERT INTO recycle_order_items
        (order_id, product_id, product_name, spec, serial_no, qty, unit, unit_price, amount, need_dismantle, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    for (const it of enriched) {
      insertItem.run(
        it.order_id, it.product_id, it.product_name, it.spec, it.serial_no,
        it.qty, it.unit, it.unit_price, it.amount, it.need_dismantle, it.remark
      )
    }

    return { orderId: order.id, valuation, itemCount: enriched.length, items: enriched }
  })
}

export async function handleTx(req, res, url, method, ctx) {
  const { send, readBody } = ctx
  const action = url.pathname.split('/').filter(Boolean)[2]
  if (method !== 'POST') return send(405, { code: 405, message: 'method not allowed' })
  try {
    const body = await readBody()
    let data
    if (action === 'pay-execute') data = await payExecute(body, ctx)
    else if (action === 'supplier-pay') data = await supplierPay(body, ctx)
    else if (action === 'stock-writeoff') data = await stockWriteoff(body, ctx)
    else if (action === 'audit-post') data = await auditPost(body, ctx)
    else if (action === 'notification-batch') data = await notificationBatch(body)
    else if (action === 'staff-create') data = await staffCreate(body, ctx)
    else if (action === 'recycle-pay') data = await recyclePay(body, ctx)
    else if (action === 'purchase-inbound') data = await purchaseInbound(body, ctx)
    else if (action === 'sales-outbound') data = await salesOutbound(body, ctx)
    else if (action === 'stock-transfer') data = await stockTransfer(body, ctx)
    else if (action === 'qc-record') data = await qcRecord(body, ctx)
    else if (action === 'commission-settle') data = await commissionSettle(body, ctx)
    else if (action === 'return-outbound') data = await returnOutbound(body, ctx)
    else if (action === 'quote-accept') data = await quoteAccept(body, ctx)
    else if (action === 'audit-start') data = await auditStart(body, ctx)
    else if (action === 'permission-sync') data = await permissionSync(body)
    else if (action === 'account-save') data = await accountSave(body, ctx)
    else if (action === 'recycle-order-create') data = await recycleOrderCreate(body, ctx)
    else if (action === 'purchase-order-create') data = await purchaseOrderCreate(body, ctx)
    else if (action === 'recycle-return-start') data = await recycleReturnStart(body, ctx)
    else if (action === 'recycle-return-done') data = await recycleReturnDone(body, ctx)
    else if (action === 'logistics-inbound') data = await logisticsInbound(body, ctx)
    else if (action === 'password-change') data = await passwordChange(body, ctx)
    else return send(404, { code: 404, message: 'unknown tx: ' + action })
    return send(200, { code: 0, message: 'ok', data })
  } catch (err) {
    return send(400, { code: 400, message: err.message })
  }
}
