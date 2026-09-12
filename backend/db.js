// db.js — SQLite 数据层（Node 内置 node:sqlite，零第三方依赖）
//
// 启动引导策略（保证"关系型 + 真后端"）：
//   1. 打开库 + WAL + 打开外键约束
//   2. 执行 schema.sql 建立全部规范化关系表（IF NOT EXISTS，幂等）
//   3. 若旧库 users 缺 role_id/dept_id 列则补列（兼容迁移脚本建过的库）
//   4. 种子化：角色 / 部门 / 管理员 / 演示数据（列感知 UPSERT，绝不破坏既有数据）
//   5. app_meta 系统配置默认值（Settings 页真实读写）
//
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { hash, verify } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(join(dataDir, 'app.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

// ── 2. 应用规范化关系表 schema ──
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
db.exec(schema)

// ── 2b. 移除已下线业务（充电桩）遗留的表（老库含旧表则一并清理）──
for (const t of ['charging_stations', 'charging_orders', 'channels', 'api_logs']) {
  db.exec(`DROP TABLE IF EXISTS ${t}`)
}

// ── 3. 兼容旧库：补齐 users 的关联列 ──
function ensureUserColumns() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  if (!cols.includes('role_id')) {
    db.exec('ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)')
  }
  if (!cols.includes('dept_id')) {
    db.exec('ALTER TABLE users ADD COLUMN dept_id INTEGER REFERENCES departments(id)')
  }
}
ensureUserColumns()

// 初始管理员/演示账号密码：生产必须通过 INITIAL_ADMIN_PASSWORD 注入强口令，缺省 123456 仅限开发
const INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || '123456'
if (!process.env.INITIAL_ADMIN_PASSWORD) {
  console.warn('[db] ⚠️ 未设置 INITIAL_ADMIN_PASSWORD，使用默认初始密码 123456（仅限开发环境，生产必须设置）')
}
// 初始账号强制改密标志列（首次登录后端返回 mustChangePwd，前端引导改密）
ensureColumns('users', { must_change_pwd: 'INTEGER DEFAULT 0' })

// ── 3b. 兼容旧库：为 channels / quotations / purchase_orders / recycle_orders 补列 ──
function ensureColumns(table, cols) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  for (const [col, ddl] of Object.entries(cols)) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`)
    }
  }
}
ensureColumns('quotations', {
  target: 'TEXT', owner: 'TEXT', total: 'TEXT', is_bidding: 'INTEGER DEFAULT 0',
  submission_count: 'INTEGER DEFAULT 0',
})
ensureColumns('purchase_orders', {
  product_name: 'TEXT', price: 'TEXT', total: 'TEXT', step: 'INTEGER DEFAULT 0',
  type: 'TEXT', payment_status: 'TEXT', paid_amount: 'TEXT',
  delivery_date: 'TEXT', payee: 'TEXT', bank_account: 'TEXT', bank_name: 'TEXT',
  recycle_order_id: 'TEXT', warehouse_id: 'TEXT', source_type: "TEXT DEFAULT 'direct'",
})
ensureColumns('stock_batches', {
  purchase_order_id: 'TEXT',
})
ensureColumns('audit_plans', {
  note: 'TEXT',
})
ensureColumns('recycle_orders', {
  supplier: 'TEXT', source_type: 'TEXT', warehouse: 'TEXT', summary: 'TEXT',
  total_items: 'INTEGER', commission: 'TEXT', freight_amount: 'REAL',
  freight_payer: 'TEXT', payment_type: 'TEXT', has_dismantle_items: 'INTEGER DEFAULT 0',
  remarks: 'TEXT', contact: 'TEXT', date: 'TEXT',
  return_applied: 'INTEGER DEFAULT 0', return_time: 'TEXT', return_done_time: 'TEXT',
  return_flow_id: 'INTEGER',
})
ensureColumns('warehouses', {
  total_area: 'INTEGER DEFAULT 500', fire_level: 'TEXT',
})
ensureColumns('suppliers', {
  address: 'TEXT', tax_id: 'TEXT', bank_account: 'TEXT', bank_name: 'TEXT',
  alipay_qr: 'TEXT', wechat_qr: 'TEXT',
})
ensureColumns('products', {
  description: 'TEXT', specs: 'TEXT', current_stock: 'INTEGER DEFAULT 0',
  safety_stock: 'INTEGER DEFAULT 20', supplier: 'TEXT', warranty: 'TEXT',
  image: 'TEXT', ext_params: 'TEXT',
})
ensureColumns('staff', {
  role_id: 'INTEGER',
})
// 销售订单补 items_json：前端「选定实物资产」的选品明细落库（rowsApi 只写 PRAGMA 存在的列）
ensureColumns('sales_orders', {
  items_json: 'TEXT',
})
// 回收订单补客户收款信息：渠道 + 三个收款码位 + 银行卡（报价接受后由业务员登记）
ensureColumns('recycle_orders', {
  payee_channel: 'TEXT', payee_wechat_qr: 'TEXT', payee_alipay_qr: 'TEXT',
  payee_unionpay_qr: 'TEXT', payee_bank_holder: 'TEXT', payee_bank_name: 'TEXT',
  payee_bank_branch: 'TEXT', payee_bank_account: 'TEXT',
  photos: 'TEXT',
  audit_time: 'TEXT', payment_applied_time: 'TEXT', paid_time: 'TEXT', completed_time: 'TEXT',
  source: 'TEXT', amount: 'TEXT',
})
// 回收单按时间排序频繁，建索引提升列表/排序性能
db.exec('CREATE INDEX IF NOT EXISTS idx_recycle_orders_time ON recycle_orders(time)')
// 归一：补「来源标记 source」与「金额 amount」字段（幂等，仅补 NULL）
//   source: 小程序提交=miniapp，销售手动录入=manual
//   amount: 统一金额字段，默认与 valuation 一致
db.exec(`UPDATE recycle_orders SET source='miniapp' WHERE source IS NULL AND source_type='miniapp'`)
db.exec(`UPDATE recycle_orders SET source='manual' WHERE source IS NULL AND (source_type IS NULL OR source_type<>'miniapp')`)
db.exec(`UPDATE recycle_orders SET amount=valuation WHERE amount IS NULL OR amount=''`)
// 库存批次补质检结论（qc-record 写入质检备注 + 动态质检指标 JSON）
ensureColumns('stock_batches', {
  remark: 'TEXT',
  qc_values: 'TEXT',
})
// 物流单补现场照片（/api/open/logistics-photo 追加图片 URL，JSON 数组）
ensureColumns('logistics_orders', {
  photos: 'TEXT',
})
// 销售订单补来源报价单（quote-accept 录用后回填，便于追溯）
ensureColumns('sales_orders', {
  quotation_id: 'TEXT',
})
// 报价竞价明细补公开报价字段（/api/open/quote-submit 写入联系电话/物流方式）
ensureColumns('quotation_bids', {
  phone: 'TEXT',
  logistics: 'TEXT',
})
// 月度绩效补审核字段（commission-settle 的 audit op 写入；旧记录默认未审核）
ensureColumns('commissions', {
  audit_status: "TEXT DEFAULT '未审核'",
  auditor: 'TEXT',
  audit_time: 'TEXT',
  audit_comment: 'TEXT',
})
// 老库回填：历史无审核状态的记录默认显示为「未审核」，避免 UI 出现空白标签
db.exec("UPDATE commissions SET audit_status='未审核' WHERE audit_status IS NULL OR audit_status=''")

// ── 3c. 时间归一：toLocaleString('zh-CN') 产生的「2026/8/28 09:30:00」→ 统一「2026-08-28 09:30:00」──
// 统一存储格式后字符串排序/区间筛选可靠；日期/纯时间不做处理
function normalizeTimeCol(table, col) {
  const rows = db.prepare(`SELECT id, ${col} AS t FROM ${table} WHERE ${col} LIKE '%/%/%:%'`).all()
  const re = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/
  const pad = (n) => String(n).padStart(2, '0')
  const upd = db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`)
  for (const r of rows) {
    const m = r.t && String(r.t).match(re)
    if (m) upd.run(`${m[1]}-${pad(m[2])}-${pad(m[3])} ${pad(m[4])}:${m[5]}:${m[6]}`, r.id)
  }
}
for (const [t, c] of [['recycle_orders', 'time'], ['sales_orders', 'time'], ['settlement_flows', 'time'], ['quotation_bids', 'time']]) {
  normalizeTimeCol(t, c)
}

// ── 3d. 状态归一：recycle_orders 中文状态 → 英文枚举（与前端 statusLabel / 小程序一致）──
db.exec("UPDATE recycle_orders SET status = 'pending'    WHERE status IN ('待评估','待审核')")
db.exec("UPDATE recycle_orders SET status = 'processing' WHERE status = '处理中'")
db.exec("UPDATE recycle_orders SET status = 'completed'  WHERE status IN ('已完成','已回收')")
db.exec("UPDATE recycle_orders SET status = 'shipped'    WHERE status = '已出库'")
db.exec("UPDATE recycle_orders SET status = 'cancelled'  WHERE status = '已取消'")

// ── 4. 种子化：角色 / 部门 / 管理员 ──
const DEFAULT_ROLES = {
  超级管理员: ['*'],
  销售经理: ['sales', 'customer', 'order', 'recycle'],
  财务专员: ['finance', 'settlement', 'pay'],
  仓库管理员: ['inventory', 'stock', 'audit'],
}
for (const [name, perms] of Object.entries(DEFAULT_ROLES)) {
  db.prepare('INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)').run(
    name,
    JSON.stringify(perms)
  )
}
// 角色权限统一对齐到前端菜单域（sales / recycle / inventory / finance / data）：
// 种子角色由上面 INSERT OR IGNORE 建立，这里覆盖权限；旧角色（migrate 空权限）一并生效
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
for (const [rname, rperms] of Object.entries(ROLE_PERMS)) {
  db.prepare('UPDATE roles SET permissions = ? WHERE name = ?').run(JSON.stringify(rperms), rname)
}

// 顺序即 fresh 库的自增 id（1-7），与 staff 种子的 dept_id 对应；老库已有则忽略
const DEFAULT_DEPTS = ['销售一部', '总经办', '资产管理部', '运营中心', '销售中心', '财务中心', '仓储物流']
for (const d of DEFAULT_DEPTS) {
  db.prepare('INSERT OR IGNORE INTO departments (name, description) VALUES (?, ?)').run(
    d,
    `${d}（系统默认部门）`
  )
}

const adminRoleId = db.prepare("SELECT id FROM roles WHERE name='超级管理员'").get()?.id
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
const insCols = ['username', 'password_hash', 'real_name']
const insVals = ['admin', hash(INITIAL_ADMIN_PASSWORD), '管理员']
if (userCols.includes('role_id')) {
  insCols.push('role_id')
  insVals.push(adminRoleId)
}
if (userCols.includes('role')) {
  insCols.push('role')
  insVals.push('超级管理员')
}
if (userCols.includes('must_change_pwd')) {
  insCols.push('must_change_pwd')
  insVals.push(1)
}
const adminExists = db.prepare("SELECT id FROM users WHERE username='admin'").get()
if (!adminExists) {
  const ph = insCols.map(() => '?').join(',')
  db.prepare(`INSERT INTO users (${insCols.join(',')}) VALUES (${ph})`).run(...insVals)
}

// ── 4a. 演示角色账号（后端权限区分验证用；仅首次创建，初始密码统一 123456）──
const DEMO_ACCOUNTS = [
  { username: 'sales01', realName: '王销售', roleName: '销售经理' },
  { username: 'finance01', realName: '张财务', roleName: '财务专员' },
  { username: 'warehouse01', realName: '李仓管', roleName: '仓库管理员' },
]
const demoUserCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
for (const a of DEMO_ACCOUNTS) {
  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(a.username)
  if (dup) continue
  const rid = db.prepare('SELECT id FROM roles WHERE name = ?').get(a.roleName)?.id
  const cols = ['username', 'password_hash', 'real_name', 'role_id', 'status']
  const vals = [a.username, hash(INITIAL_ADMIN_PASSWORD), a.realName, rid || null, 1]
  if (demoUserCols.includes('must_change_pwd')) { cols.push('must_change_pwd'); vals.push(1) }
  db.prepare(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...vals)
}

// ── 4b. 种子化：扩展表演示数据（仅当表为空时插入）──
function seedIfEmpty(table, rows) {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c
  if (count > 0) return
  for (const row of rows) {
    const cols = Object.keys(row)
    const vals = cols.map((c) => row[c])
    const ph = cols.map(() => '?').join(',')
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})`).run(...vals)
  }
}

seedIfEmpty('quotations', [
  { id: 1, project_id: 'QT240401', target: '顺风物流园电池处置项目', is_bidding: 1, owner: '陈业务', total: '268,000', status: 'active', submission_count: 4, project: '顺风物流园电池处置项目', bidders: 4, top_bid: 268000 },
  { id: 2, project_id: 'QT240402', target: '拆解场年度回收询价', is_bidding: 1, owner: '王主管', total: '124,500', status: 'active', submission_count: 2, project: '拆解场年度回收询价', bidders: 2, top_bid: 124500 },
  { id: 3, project_id: 'QT240403', target: '个人二手电池购买单议', is_bidding: 0, owner: '李业务', total: '8,200', status: 'accepted', submission_count: 1, project: '个人二手电池购买单议', bidders: 1, top_bid: 8200 },
  { id: 4, project_id: 'QT240404', target: '某公交集团退役模组招标', is_bidding: 1, owner: '张经理', total: '1,560,000', status: 'active', submission_count: 8, project: '某公交集团退役模组招标', bidders: 8, top_bid: 1560000 },
  { id: 5, project_id: 'QT240405', target: '备件中心闲置物资拍卖', is_bidding: 1, owner: '陈业务', total: '45,000', status: 'active', submission_count: 3, project: '备件中心闲置物资拍卖', bidders: 3, top_bid: 45000 },
])

seedIfEmpty('quotation_bids', [
  { quotation_id: 'QT240401', name: '顺风物流园 (张总)', price: '268,000', credit: '9.8', payment: '全额预付', time: '10分钟前', is_best: 1, items_json: '[{"name":"75kWh 翻新电池组 (原装)","qty":12,"unitPrice":21000},{"name":"额外模组 - 三元锂 (补件)","qty":2,"unitPrice":8000}]' },
  { quotation_id: 'QT240401', name: '某汽修连锁中心', price: '254,000', credit: '9.2', payment: '定金 30%', time: '2小时前', is_best: 0, items_json: '[{"name":"75kWh 翻新电池组","qty":12,"unitPrice":21166}]' },
  { quotation_id: 'QT240401', name: '中原拆解场', price: '280,000', credit: '8.1', payment: '账期 30 天', time: '1天前', is_best: 0, items_json: '[{"name":"75kWh 翻新电池组","qty":12,"unitPrice":20000},{"name":"旧件回收服务费","qty":1,"unitPrice":40000}]' },
])

// 采购单种子数据（如果 purchase_orders 表为空）
seedIfEmpty('purchase_orders', [
  { id: 1, po_no: 'PO240123001', product_name: '75kWh 动力电池包 (CATL)', amount: 10, price: '26,500', total: '265,000', tax_rate: '13', supplier: '宁德时代科技', payment_terms: '月结30天', status: 'completed', step: 6, type: '核心件采购', payment_status: 'paid', paid_amount: '265,000', delivery_date: '2024-05-10', payee: '宁德时代科技', bank_account: '6222 0210 0100 8888 666', bank_name: '中国工商银行宁德分行', item: '75kWh 动力电池包 (CATL)', unit_price: 26500, qty: 10 },
  { id: 2, po_no: 'PO240123002', product_name: '直流充电桩控制主板', amount: 50, price: '1,200', total: '60,000', tax_rate: '13', supplier: '星星充电', payment_terms: '现结', status: 'pending_approval', step: 1, type: '备件采购', payment_status: 'unpaid', paid_amount: '0.00', delivery_date: '', payee: '', bank_account: '', bank_name: '', item: '直流充电桩控制主板', unit_price: 1200, qty: 50 },
  { id: 3, po_no: 'PO240123003', product_name: 'Type-2 充电枪 7M', amount: 100, price: '380', total: '38,000', tax_rate: '13', supplier: '特来电配件部', payment_terms: '月结30天', status: 'arrived', step: 3, type: '通用物资', payment_status: 'unpaid', paid_amount: '0.00', delivery_date: '', payee: '', bank_account: '', bank_name: '', item: 'Type-2 充电枪 7M', unit_price: 380, qty: 100 },
])

// 通知中心种子消息（仅首次为空时写入，持久化到库，便于演示消息提醒）
seedIfEmpty('notifications', [
  { type: 'recycle', title: '🔔 新回收报价', content: '三元锂 宁德时代新能源 x2，等待评估报价（单号 REC-20260816-003）。', ref_id: 'REC-20260816-003', source: 'miniapp', read: 0 },
  { type: 'quote', title: '📨 新的竞价报价', content: '顺风物流园电池处置项目收到 1 笔新报价 ¥268,000（报价方：顺风物流园 (张总)）。', ref_id: 'QT240401', source: 'system', read: 0 },
  { type: 'system', title: '⚙️ 系统提示', content: '本月共有 4 笔竞价报价待审核，请及时跟进。', ref_id: '', source: 'system', read: 0 },
])

// ── 4c. 演示数据种子（原 mock 数据灌入真实表，仅表空时插入，保证系统完整性）──
// 顺序即依赖顺序：主数据 → 库存 → 单据 → 反馈/盘点
seedIfEmpty('categories', [
  { id: 1, name: '动力电池', qc_fields: '当前电压(V) | 内阻系数(mΩ) | 电芯温差(℃) | SOH健康度(%)', updated: '2024-01-25 10:30' },
  { id: 2, name: '充电配件', qc_fields: '外观完好 | 包装完整 | 通断性能', updated: '2024-01-20 14:15' },
  { id: 3, name: '充电设备', qc_fields: '功率(kW) | 绝缘阻抗 | 防火等级', updated: '2024-01-18 09:00' },
])

seedIfEmpty('products', [
  { id: 1, name: '75kWh 磷酸铁锂动力电池包', model: 'TP-EV-75D-V3', sku: 'BAT-TS-LITH', category: '动力电池', unit: '组', cost_price: 26500, sale_price: 28500, status: '在售', current_stock: 12, safety_stock: 20 },
  { id: 2, name: '60kWh 三元锂电池', model: 'TP-EV-60D-V2', sku: 'BAT-TS-TER', category: '动力电池', unit: '组', cost_price: 18000, sale_price: 20500, status: '在售', current_stock: 0, safety_stock: 20 },
  { id: 3, name: '120kW 直流双枪快速桩', model: 'CHG-DC-120', sku: 'CHG-DC-120', category: '充电设备', unit: '台', cost_price: 45000, sale_price: 52000, status: '在售', current_stock: 0, safety_stock: 20 },
  { id: 4, name: '7kW 交流家用桩', model: 'CHG-AC-007', sku: 'CHG-AC-007', category: '充电设备', unit: '台', cost_price: 2800, sale_price: 3500, status: '在售', current_stock: 0, safety_stock: 20 },
  { id: 5, name: '国标 Type-2 交流充电枪 (7米)', model: 'TP-GUN-T2', sku: 'CHG-GUN-T2', category: '充电配件', unit: '根', cost_price: 380, sale_price: 500, status: '在售', current_stock: 85, safety_stock: 20 },
  { id: 6, name: '直流充电桩控制主板', model: 'CTRL-DC-MAIN', sku: 'CTRL-DC-MAIN', category: '充电配件', unit: '块', cost_price: 6200, sale_price: 7000, status: '在售', current_stock: 24, safety_stock: 20 },
])

seedIfEmpty('suppliers', [
  { id: 1, name: '宁德时代新能源科技股份有限公司', level: 'A级战略伙伴', contact: '张晓明', phone: '138-5555-6666', terms: '月结30天', category: '动力电池', status: '已验资' },
  { id: 2, name: '星星充电科技有限公司', level: 'B级核心供应', contact: '李工', phone: '139-1234-5678', terms: '现结', category: '充电设备', status: '已验资' },
  { id: 3, name: '顺丰速运有限公司', level: 'C级一般供应', contact: '赵经理', phone: '136-9876-5432', terms: '货到付款', category: '物流服务', status: '已验资' },
])

seedIfEmpty('warehouses', [
  { id: 1, name: '1号动力电池主仓', code: '#WH-SH-01', type: '主仓', manager: '王建国', phone: '13811112222', address: '上海市浦东新区张江高科技园区 88 号', status: '运营中' },
  { id: 2, name: '1号备件仓', code: '#WH-SH-02', type: '备件仓', manager: '李工', address: '上海市闵行区虹桥商务区', status: '运营中' },
  { id: 3, name: '报废/回收仓', code: '#WH-SH-RC', type: '回收仓', manager: '陈师傅', address: '上海市浦东新区', status: '运营中' },
])

seedIfEmpty('staff', [
  { id: 1, name: '王五', username: '@WANGWU', dept_id: 1, role: '高级销售经理', status: '正常' },
  { id: 2, name: '李经理', username: '@ADMIN', dept_id: 2, role: '超级管理员', status: '正常' },
  { id: 3, name: '张晓明', username: '@ZHANGXM', dept_id: 3, role: '管理员', status: '正常' },
  { id: 4, name: '陈业务', username: '@CHENYW', dept_id: 4, role: '管理员', status: '正常' },
  { id: 5, name: '王销售', username: '@WANGX', dept_id: 5, role: '销售代表', status: '正常' },
])

seedIfEmpty('stock_items', [
  { id: 1, name: '75kWh 磷酸铁锂动力电池包', sku: 'BAT-TS-LITH', category: '动力电池', qty: 12, unit: '组', locked: 2, warehouse: '1号主仓 (上海)', cost_price: 28500, value: 342000 },
  { id: 2, name: '国标 Type-2 交流充电枪 (7米)', sku: 'CHG-GUN-T2', category: '充电配件', qty: 85, unit: '根', locked: 12, warehouse: '1号主仓 (上海)', cost_price: 500, value: 42500 },
  { id: 3, name: '直流充电桩控制主板', sku: 'CTRL-DC-MAIN', category: '充电配件', qty: 24, unit: '块', locked: 0, warehouse: '1号备件仓', cost_price: 7000, value: 168000 },
])

seedIfEmpty('stock_batches', [
  { id: 'UNIT-001', stock_item_id: 1, batch_no: 'B20231201001', mfd: '2023-12-01', amount: 8, health: 98, recycle_order_id: 'RC24042301' },
  { id: 'UNIT-002', stock_item_id: 1, batch_no: 'B20240115022', mfd: '2024-01-15', amount: 4, health: 100, recycle_order_id: 'RC24042601' },
  { id: 'GUN-24-001', stock_item_id: 2, batch_no: 'LOT-2401A', mfd: '2024-01-01', amount: 73, health: 100, recycle_order_id: 'RC24012005' },
  { id: 'GUN-24-002', stock_item_id: 2, batch_no: 'LOT-2401A', mfd: '2024-01-01', amount: 12, health: 99, recycle_order_id: 'RC24012005' },
  { id: 'CTRL-001', stock_item_id: 3, batch_no: 'B20240105003', mfd: '2024-01-05', amount: 24, health: 100, recycle_order_id: null },
])

seedIfEmpty('sales_orders', [
  { id: 'SO240123001', customer: '顺风物流园 (张总)', product_summary: '60kWh 动力电池组 x2', item_count: 1, total: '17,600', gp: 32, status: 'shipping', time: '2024-01-23 09:30', logistics_co: '顺丰速运', tracking_no: 'SF-TEST-1', received_amount: '17,600.00', balance: '0.00', items_json: '[{"productName":"60kWh 动力电池组","sku":"BAT-TS-TER","price":8800,"amount":2,"selectedItemId":"UNIT-002"}]' },
  { id: 'SO240123003', customer: '上海某汽修连锁', product_summary: '75kWh 翻新电池组 x1', item_count: 1, total: '28,500', gp: 28, status: 'pending_payment', time: '2024-01-25 14:00', logistics_co: '', tracking_no: '', received_amount: '0.00', balance: '28,500.00', items_json: '[{"productName":"75kWh 磷酸铁锂动力电池包","sku":"BAT-TS-LITH","price":28500,"amount":1,"selectedItemId":"UNIT-001"}]' },
  { id: 'SO240124001', customer: '杭州新能源科技', product_summary: 'BMS主控板 x3', item_count: 1, total: '3,600', gp: 18, status: 'pending_outbound', time: '2024-01-24 10:00', logistics_co: '', tracking_no: '', received_amount: '3,600.00', balance: '0.00', items_json: '[{"productName":"直流充电桩控制主板","sku":"CTRL-DC-MAIN","price":1200,"amount":3,"selectedItemId":"CTRL-001"}]' },
  { id: 'SO240424001', customer: '个人买家 (李先生)', product_summary: 'Type-2 充电枪 x1', item_count: 1, total: '680', gp: 15, status: 'shipping', time: '2024-04-24 11:45', logistics_co: '顺丰速运', tracking_no: 'SF99283741', received_amount: '0.00', balance: '680.00', items_json: '[{"productName":"国标 Type-2 交流充电枪 (7米)","sku":"CHG-GUN-T2","price":680,"amount":1,"selectedItemId":"GUN-24-001"}]' },
])

seedIfEmpty('recycle_orders', [
  { id: 'RE-20240123-001', user_name: '王*亮', phone: '138****8899', brand: '特斯拉', type: '动力电池', count: 1, capacity: '75kWh', valuation: '8,500', status: 'pending', time: '2024-01-23 14:30', payment_applied: 0, paid: 0, paid_amount: '0.00', address: '上海市浦东新区', source_type: 'individual' },
  { id: 'RE-20240123-002', user_name: '李*欣', phone: '159****0012', brand: '比亚迪', type: '磷酸铁锂', count: 1, capacity: '60kWh', valuation: '5,200', status: 'processing', time: '2024-01-23 10:15', payment_applied: 0, paid: 1, paid_amount: '5,200.00', address: '杭州市西湖区', source_type: 'individual' },
  { id: 'RE-20240122-045', user_name: '陈*海', phone: '133****4455', brand: '宁德时代', type: '三元锂', count: 1, capacity: '52kWh', valuation: '4,100', status: 'completed', time: '2024-01-22 16:50', payment_applied: 0, paid: 1, paid_amount: '4,100.00', address: '苏州市工业园区', source_type: 'individual' },
  { id: 'RE-20240121-012', user_name: '张*明', phone: '136****7890', brand: '中航锂电', type: '电池模组', count: 3, capacity: '100kWh', valuation: '12,000', status: 'completed', time: '2024-01-21 09:00', payment_applied: 0, paid: 1, paid_amount: '12,000.00', address: '南京市江宁区', source_type: 'individual' },
  { id: 'RE-20240120-008', user_name: '赵*强', phone: '185****3322', brand: '国轩', type: '混合动力', count: 1, capacity: '45kWh', valuation: '3,800', status: 'pending', time: '2024-01-20 11:20', payment_applied: 0, paid: 0, paid_amount: '0.00', address: '合肥市高新区', source_type: 'individual' },
])

seedIfEmpty('feedbacks', [
  { id: 1, user: '王五', type: '功能建议', content: '建议在回收订单页面增加批量导出功能', status: '已回复', time: '2024-04-20' },
  { id: 2, user: '李经理', type: 'Bug报告', content: '库存盘点页面在 Safari 浏览器中显示异常', status: '已回复', time: '2024-04-18' },
  { id: 3, user: '陈业务', type: '功能建议', content: '希望能支持手机端查看库存数据', status: '已关闭', time: '2024-04-15' },
])

seedIfEmpty('audit_plans', [
  { id: 1, plan_no: 'INV-2024Q2-001', warehouse: '1号动力电池主仓 (上海)', range: '全库盘点', progress: 100, status: '已完成' },
  { id: 2, plan_no: 'INV-2024Q2-002', warehouse: '1号备件仓', range: '充电配件区', progress: 100, status: '已完成' },
])

// 支付账户种子（业绩结算中心账户列表）
seedIfEmpty('payment_accounts', [
  { name: '中国工商银行 (基本户)', no: '6222 **** **** 8891', type: 'bank', balance: '1,250,400.00' },
  { name: '微信支付商户号', no: 'MID: 15928300', type: 'wechat', balance: '42,500.00' },
  { name: '支付宝企业号', no: 'fin@antigravity.com', type: 'alipay', balance: '85,000.00' },
])

// 月度绩效种子（业绩结算中心绩效列表）
seedIfEmpty('commissions', [
  { month: '2024-04', staff_name: '王五', dept: '销售一部', recycle_val: '245,000', sales_val: '428,000', base: '673,000', rate: 1.2, final_amount: '8,076.00', status: '待发放' },
  { month: '2024-04', staff_name: '张三', dept: '销售二部', recycle_val: '120,000', sales_val: '524,000', base: '644,000', rate: 1.2, final_amount: '7,728.00', status: '待发放' },
  { month: '2024-04', staff_name: '赵六', dept: '销售一部', recycle_val: '48,000', sales_val: '185,000', base: '233,000', rate: 1, final_amount: '2,330.00', status: '已发放' },
])

// 费用报销演示数据（expense_claims 为空时插入；M2 后由小程序写入真实单）
seedIfEmpty('expense_claims', [
  { claim_no: 'EXP-20260901-01', applicant: '王销售', role: 'salesman', type: '差旅费', amount: '580.00', date: '2026-08-28', invoice_count: 2, reason: '长沙县上门回收电池，高铁往返 + 市内交通', status: '待审批', attachments: '[{"kind":"image","name":"高铁票.jpg","path":"","size":245000},{"kind":"file","name":"报销单.pdf","path":"","size":180000}]', created_at: '2026-09-01 09:12:00' },
  { claim_no: 'EXP-20260901-02', applicant: '施羽', role: 'user', type: '办公费', amount: '12.00', date: '2026-08-30', invoice_count: 1, reason: '打印回收协议与报价单', status: '待审批', attachments: '[]', created_at: '2026-09-01 10:30:00' },
  { claim_no: 'EXP-20260831-01', applicant: '王销售', role: 'salesman', type: '车辆使用费', amount: '360.00', date: '2026-08-26', invoice_count: 1, reason: '往返客户仓库回收旧电池，加油费', status: '已通过', review_remark: '同意报销', review_time: '2026-08-31 15:20:00', attachments: '[]', created_at: '2026-08-26 18:40:00' },
  { claim_no: 'EXP-20260830-01', applicant: '李仓管', role: 'user', type: '业务招待费', amount: '428.00', date: '2026-08-24', invoice_count: 3, reason: '与供应商洽谈合作晚宴', status: '已驳回', review_remark: '超出单次招待标准，请拆分或补充说明', review_time: '2026-08-30 11:05:00', attachments: '[{"kind":"image","name":"发票1.jpg","path":"","size":150000}]', created_at: '2026-08-24 20:15:00' },
])

// 物流运输单演示数据（logistics_orders 为空时插入；状态流转：待取货→运输中→已到达→已入库）
seedIfEmpty('logistics_orders', [
  { lg_no: 'LG-20260901-01', applicant: '王销售', pickup_address: '长沙市长沙县顺风物流园 B 区 12 号库', goods: '75kWh 动力电池组', qty: 8, eta_days: 3, expect_date: '2026-09-04', dest_warehouse: '1号动力电池主仓', carrier: '顺丰速运', carrier_phone: '138-5555-6666', status: '运输中', source: 'miniapp', pickup_time: '2026-09-01 14:30:00', remark: '客户已确认清单，到货后直接入库' },
  { lg_no: 'LG-20260901-02', applicant: '陈业务', pickup_address: '苏州工业园区兴浦路 88 号（报废车拆解场）', goods: '52kWh 三元锂电池模组', qty: 15, eta_days: 2, expect_date: '2026-09-03', dest_warehouse: '报废/回收仓', carrier: '自营货车 沪A·D8821', carrier_phone: '136-9876-5432', status: '已到达', source: 'manual', pickup_time: '2026-09-01 09:00:00', arrive_time: '2026-09-03 11:20:00', remark: '到货待质检入库' },
  { lg_no: 'LG-20260830-01', applicant: '王销售', pickup_address: '合肥市高新区创新大道 66 号', goods: '60kWh 磷酸铁锂电池', qty: 4, eta_days: 4, expect_date: '2026-09-03', dest_warehouse: '1号动力电池主仓', carrier: '德邦物流', carrier_phone: '139-1234-5678', status: '待取货', source: 'miniapp', remark: '等客户通知可取货时间' },
  { lg_no: 'LG-20260828-01', applicant: '李仓管', pickup_address: '南京市江宁区将军大道 200 号', goods: 'Type-2 充电枪（7米）', qty: 60, eta_days: 2, expect_date: '2026-08-30', dest_warehouse: '1号备件仓', carrier: '德邦物流', carrier_phone: '139-1234-5678', status: '已入库', source: 'manual', pickup_time: '2026-08-28 10:00:00', arrive_time: '2026-08-30 16:40:00', inbound_time: '2026-08-30 17:05:00', remark: '' },
])

// ── 4d. 客户存量回填：从 recycle_orders 按 phone 聚合（customers 为空时执行）──
const custCount = db.prepare('SELECT COUNT(*) c FROM customers').get().c
if (custCount === 0) {
  const custRows = db.prepare(
    `SELECT phone,
            MAX(contact) AS name,
            (SELECT r2.address FROM recycle_orders r2 WHERE r2.phone = r.phone ORDER BY r2.time DESC, r2.id DESC LIMIT 1) AS address,
            COUNT(*) AS order_count,
            SUM(CAST(REPLACE(COALESCE(valuation,'0'), ',', '') AS REAL)) AS total_value,
            MIN(id) AS first_order_no,
            MAX(time) AS last_order_time
     FROM recycle_orders r
     WHERE phone IS NOT NULL AND phone != ''
     GROUP BY phone`
  ).all()
  const insCust = db.prepare(
    `INSERT INTO customers (phone, name, address, order_count, total_value, first_order_no, last_order_time, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?, datetime('now','localtime'), datetime('now','localtime'))`
  )
  for (const c of custRows) {
    insCust.run(
      c.phone,
      c.name || '微信用户',
      c.address || '',
      c.order_count,
      (c.total_value || 0).toLocaleString('en-US'),
      c.first_order_no,
      c.last_order_time
    )
  }
}

// ── 5. 系统配置默认值（app_meta 键值表，Settings 页读写；INSERT OR IGNORE 幂等）──
const APP_META_DEFAULTS = {
  systemName: '智充回收管理系统',
  domain: 'admin.zhichong.com',
  supportPhone: '400-888-9999',
  appId: 'wx888888888888',
  appSecret: '**************************',
  recycleRatio: 0.85,
  serviceFee: 50,
  salesTarget: 500000, // 月度销售目标（工作台目标达成率用，单位元）
}
const insMeta = db.prepare('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)')
for (const [k, v] of Object.entries(APP_META_DEFAULTS)) {
  insMeta.run(k, JSON.stringify(v))
}
export function getUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
}
export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}
// 密码哈希统一走 auth.js（scrypt 加盐）；这里再导出保持下游 import 兼容
export { hash, verify } from './auth.js'
