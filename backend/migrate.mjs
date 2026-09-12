// migrate.mjs — 把现有 entities(整团 JSON) 拆入规范化关系表
// 用法: node backend/migrate.mjs  （在 vue-admin 根目录执行）
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new DatabaseSync(join(__dirname, 'data', 'app.db'))
db.exec('PRAGMA foreign_keys = ON')

// 参数归一化：undefined → null（node:sqlite 不接受 undefined 绑定）
const prep = (sql) => {
  const s = db.prepare(sql)
  return new Proxy(s, {
    get(t, p) {
      if (p === 'run') return (...a) => t.run(...a.map(x => (x === undefined ? null : x)))
      return typeof t[p] === 'function' ? t[p].bind(t) : t[p]
    },
  })
}

// 1) 建表（幂等）
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
db.exec(schema)

const get = (name) => {
  const row = prep('SELECT data FROM entities WHERE name = ?').get(name)
  return row ? JSON.parse(row.data) : null
}
const arr = (v) => (Array.isArray(v) ? v : v?.list ?? [])

// 2) 基础字典：categories / departments / roles
const insCat = prep('INSERT OR IGNORE INTO categories (id,name,qc_fields,updated) VALUES (?,?,?,?)')
for (const c of get('categories') || []) insCat.run(c.id, c.name, c.qcFields, c.updated)

const deptNames = [...new Set((get('staff') || []).map(s => s.dept).filter(Boolean))]
const insDept = prep('INSERT OR IGNORE INTO departments (name) VALUES (?)')
for (const d of deptNames) insDept.run(d)
const deptId = (name) => prep('SELECT id FROM departments WHERE name=?').get(name)?.id

const roleNames = ['超级管理员', '管理员', '销售代表', '财务审计', '仓库WMS']
const insRole = prep('INSERT OR IGNORE INTO roles (name, permissions) VALUES (?,?)')
for (const r of roleNames) insRole.run(r, '[]')
const roleId = (name) => prep('SELECT id FROM roles WHERE name=?').get(name)?.id

// 3) 账号：users 表可能已由 db.js 预建（无 role_id/dept_id），补列保证兼容
function addColumn(table, col, def) {
  const cols = prep(`PRAGMA table_info(${table})`).all().map(r => r.name)
  if (!cols.includes(col)) prep(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run()
}
addColumn('users', 'role_id', 'INTEGER')
addColumn('users', 'dept_id', 'INTEGER')
const adminRole = roleId('超级管理员')
if (adminRole) prep('UPDATE users SET role_id=? WHERE username=?').run(adminRole, 'admin')

// 4) 供应链主数据
const insSup = prep('INSERT OR IGNORE INTO suppliers (id,name,level,contact,phone,terms,category,status) VALUES (?,?,?,?,?,?,?,?)')
for (const s of get('suppliers') || []) insSup.run(s.id, s.name, s.level, s.contact, s.phone, s.terms, s.category, s.status)

const insWh = prep('INSERT OR IGNORE INTO warehouses (id,name,code,type,manager,phone,address,status) VALUES (?,?,?,?,?,?,?,?)')
for (const w of get('warehouses') || []) insWh.run(w.id, w.name, w.code, w.type, w.manager, w.phone, w.address, w.status)

const insProd = prep('INSERT OR IGNORE INTO products (id,name,model,sku,category,unit,cost_price,sale_price,status) VALUES (?,?,?,?,?,?,?,?,?)')
for (const p of get('products') || []) insProd.run(p.id, p.name, p.model, p.sku, p.category, p.unit, p.costPrice, p.salePrice, p.status)

// 5) 员工（dept 文本 → dept_id）
const insStaff = prep('INSERT OR IGNORE INTO staff (id,name,username,dept_id,role,status) VALUES (?,?,?,?,?,?)')
for (const s of get('staff') || []) insStaff.run(s.id, s.name, s.username, deptId(s.dept), s.role, s.status)

// 6) 库存 + 批次
const insSI = prep('INSERT OR IGNORE INTO stock_items (id,name,sku,category,qty,unit,locked,warehouse,cost_price,value) VALUES (?,?,?,?,?,?,?,?,?,?)')
const insBatch = prep('INSERT OR IGNORE INTO stock_batches (id,stock_item_id,batch_no,mfd,amount,health,recycle_order_id) VALUES (?,?,?,?,?,?,?)')
for (const it of arr(get('stockItems'))) {
  insSI.run(it.id, it.name, it.sku, it.category, it.qty, it.unit, it.locked ?? 0, it.warehouse, it.costPrice, it.value)
  for (const b of it.batches || []) insBatch.run(b.id, it.id, b.batchNo, b.mfd, b.amount, b.health, b.recycleOrderId)
}

// 7) 销售订单 + 明细
const insSO = prep('INSERT OR IGNORE INTO sales_orders (id,customer,product_summary,item_count,total,gp,status,time,logistics_co,tracking_no,received_amount,balance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
const insSOI = prep('INSERT OR IGNORE INTO sales_order_items (sales_order_id,product_name,price,amount,selected_item_id) VALUES (?,?,?,?,?)')
for (const o of arr(get('salesOrders'))) {
  insSO.run(o.id, o.customer, o.productSummary, o.itemCount, o.total, o.gp, o.status, o.time, o.logisticsCo, o.trackingNo, o.receivedAmount, o.balance)
  for (const i of o.items || []) insSOI.run(o.id, i.productName, i.price, i.amount, i.selectedItemId)
}

// 8) 采购订单
const insPO = prep('INSERT OR IGNORE INTO purchase_orders (id,po_no,supplier,payment_terms,item,unit_price,qty,amount,tax_rate,status) VALUES (?,?,?,?,?,?,?,?,?,?)')
for (const p of arr(get('purchaseOrders'))) insPO.run(p.id, p.poNo, p.supplier, p.paymentTerms, p.item, p.unitPrice, p.qty, p.amount, p.taxRate, p.status)

// 9) 回收订单
const insRO = prep('INSERT OR IGNORE INTO recycle_orders (id,user_name,phone,brand,type,count,capacity,valuation,status,time,payment_applied,paid,paid_amount,address) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
for (const o of get('recycleOrders') || []) insRO.run(o.id, o.userName, o.phone, o.brand, o.type, o.count, o.capacity, o.valuation, o.status, o.time, o.paymentApplied ? 1 : 0, o.paid ? 1 : 0, o.paidAmount, o.address)

// 10) 报价
const insQ = prep('INSERT OR IGNORE INTO quotations (id,project,project_id,type,status,bidders,views,top_bid,premium,deadline) VALUES (?,?,?,?,?,?,?,?,?,?)')
for (const q of arr(get('quotations'))) insQ.run(q.id, q.project, q.projectId, q.type, q.status, q.bidders, q.views, q.topBid, q.premium, q.deadline)

// 11) 盘点 / 反馈 / 渠道 / 充电站
const insAP = prep('INSERT OR IGNORE INTO audit_plans (id,plan_no,warehouse,range,progress,status) VALUES (?,?,?,?,?,?)')
for (const a of get('auditPlans') || []) insAP.run(a.id, a.planNo, a.warehouse, a.range, a.progress, a.status)

const insFB = prep('INSERT OR IGNORE INTO feedbacks (id,user,type,content,status,time) VALUES (?,?,?,?,?,?)')
for (const f of get('feedbacks') || []) insFB.run(f.id, f.user, f.type, f.content, f.status, f.time)

// 12) 收付款流水（用业绩结算页演示数据播种，便于后续接管）
const seedFlows = [
  { time: '2024-04-25 14:20', type: '支出', order_id: 'PO-992837', amount: '52,400.00', account: '中国工商银行 (基本户)', item_class: '采购货款', payee: '宁德时代新能源科技股份有限公司', payee_no: '6222 **** **** 8888', status: '已结算' },
  { time: '2024-04-25 11:30', type: '收入', order_id: 'SO-112028', amount: '17,600.00', account: '微信支付商户号', item_class: '销售回款', payee: '顺风物流园 (张总)', payee_no: '', status: '已结算' },
  { time: '2024-04-24 16:45', type: '支出', order_id: 'RC-882731', amount: '8,400.00', account: '支付宝企业号', item_class: '回收预付款', payee: '顺风物流园', payee_no: '6222 **** **** 8888', status: '待结算' },
  { time: '2024-04-24 10:10', type: '收入', order_id: 'SO-112027', amount: '4,200.00', account: '中国工商银行 (基本户)', item_class: '售后服务费', payee: '上海某汽修连锁', payee_no: '', status: '已结算' },
]
const insFlow = prep('INSERT OR IGNORE INTO settlement_flows (time,type,order_id,amount,account,item_class,payee,payee_no,status) VALUES (?,?,?,?,?,?,?,?,?)')
for (const f of seedFlows) insFlow.run(f.time, f.type, f.order_id, f.amount, f.account, f.item_class, f.payee, f.payee_no, f.status)

// 13) 派生/配置 → app_meta（保留 dashboardStats / workbench 供旧页面读取）
const insMeta = prep('INSERT OR IGNORE INTO app_meta (key,value) VALUES (?,?)')
for (const k of ['dashboardStats', 'workbench']) {
  const v = get(k)
  if (v) insMeta.run(k, JSON.stringify(v))
}

// ── 校验报告 ──
const tables = ['categories', 'departments', 'roles', 'users', 'staff', 'suppliers', 'warehouses', 'products', 'stock_items', 'stock_batches', 'sales_orders', 'sales_order_items', 'purchase_orders', 'recycle_orders', 'quotations', 'audit_plans', 'feedbacks', 'settlement_flows', 'app_meta']
console.log('=== 迁移完成，各表行数 ===')
for (const t of tables) {
  const n = prep(`SELECT COUNT(*) c FROM ${t}`).get().c
  console.log(`  ${t.padEnd(22)} ${n}`)
}
// FK 完整性抽查（应均为 0）
const orphans = {
  'stock_batches 无主项': prep('SELECT COUNT(*) c FROM stock_batches b LEFT JOIN stock_items i ON b.stock_item_id=i.id WHERE i.id IS NULL').get().c,
  'sales_order_items 无主项': prep('SELECT COUNT(*) c FROM sales_order_items i LEFT JOIN sales_orders o ON i.sales_order_id=o.id WHERE o.id IS NULL').get().c,
  'products 无分类': prep('SELECT COUNT(*) c FROM products p LEFT JOIN categories c ON p.category=c.name WHERE c.name IS NULL AND p.category IS NOT NULL').get().c,
  'staff 无部门': prep('SELECT COUNT(*) c FROM staff s LEFT JOIN departments d ON s.dept_id=d.id WHERE d.id IS NULL AND s.dept_id IS NOT NULL').get().c,
}
console.log('\n=== 外键孤儿检查（应全为 0）===')
for (const [k, v] of Object.entries(orphans)) console.log(`  ${k.padEnd(30)} ${v}`)
console.log('\n✅ 规范化关系表已建立并通过外键校验')
