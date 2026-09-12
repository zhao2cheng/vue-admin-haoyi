// api/permissions.js — 后端接口权限映射与校验
//
// 权限模型（与前端路由 meta.perm 对齐）：
//   超级管理员/管理员 -> ['*']  放行一切
//   销售经理/销售代表 -> ['sales', 'recycle', 'finance']
//   财务专员/财务审计 -> ['finance']
//   仓库管理员/仓库WMS -> ['inventory', 'recycle']
//
// 校验规则：
//   1. GET（读）：登录即可读所有业务表（Dashboard / 报表 / 跨域筛选需要），
//      但敏感列（password_hash 等）在 rows.js 统一过滤，永不下发。
//   2. rows 写（POST/PUT/DELETE）：按表 -> 允许域集合校验（TABLE_WRITE_PERMS）。
//   3. tx 事务：按 action -> 允许域集合校验（TX_PERMS）。
//   4. 未映射的表/action：默认拒绝写（安全兜底），避免新接口裸奔。
import { db, getUserById } from '../db.js'

// 读取某账号的权限数组（user.id -> role -> roles.permissions JSON）
export function loadUserPerms(userId) {
  const u = getUserById(userId)
  if (!u) return []
  if (!u.role_id) return []
  const role = db.prepare('SELECT permissions FROM roles WHERE id = ?').get(u.role_id)
  if (!role) return []
  try {
    const arr = JSON.parse(role.permissions || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// 判断权限：超管 * 或命中任一所需域
export function hasPerm(userPerms, required) {
  if (!Array.isArray(required) || required.length === 0) return true
  if (userPerms.includes('*')) return true
  return required.some((p) => userPerms.includes(p))
}

// rows 写操作：表 -> 允许域
// 注意：一张表常被多个权限域的页面写（如 recycle_orders 同时被回收页和销售页写），
// 映射必须覆盖前端全部调用点，否则会误伤正常功能。
const TABLE_WRITE_PERMS = {
  // 销售域
  sales_orders: ['sales'],
  sales_order_items: ['sales'],
  quotations: ['sales'],
  quotation_bids: ['sales'],
  // 回收域（销售页也会写回收单：我的回收记录 / 销售工作台）
  recycle_orders: ['recycle', 'sales'],
  notifications: ['recycle'],
  feedbacks: ['recycle'],
  // 客户：数据管理页维护；销售工作台只读
  customers: ['recycle', 'data'],
  // 库存域
  stock_items: ['inventory'],
  stock_batches: ['inventory'],
  stock_writeoffs: ['inventory'],
  audit_plans: ['inventory'],
  audit_results: ['inventory'],
  purchase_orders: ['inventory'],
  // 主数据：数据管理页维护；库存/销售/采购页只读
  warehouses: ['inventory', 'data'],
  products: ['inventory', 'data'],
  categories: ['inventory', 'data'],
  suppliers: ['inventory', 'data'],
  // 财务域
  supplier_payments: ['finance'],
  settlement_flows: ['finance'],
  pay_logs: ['finance'],
  payment_accounts: ['finance'],
  commissions: ['finance'],
  // 费用报销：财务/管理员审批（M2 新增，业务域归属 finance）
  expense_claims: ['finance'],
  // 物流运输单：仓储域登记与状态推进（小程序发起走开放接口，不经过这里）
  logistics_orders: ['inventory'],
  // 组织权限：员工与权限管理页（finance 域）
  staff: ['finance'],
  departments: ['finance'],
  roles: ['finance'],
  users: ['finance'],
  // 系统配置：设置页（data 域）；销售工作台只读
  app_meta: ['data', 'finance'],
}

// tx 事务操作：action -> 允许域
const TX_PERMS = {
  // 财务动作
  'pay-execute': ['finance'],
  'supplier-pay': ['finance'],
  'recycle-pay': ['finance'],
  'commission-settle': ['finance'],
  'account-save': ['finance'],
  'staff-create': ['finance'],
  'permission-sync': ['finance'],
  // 库存动作（销售出库页属于 sales 域，故同时放行 sales / inventory）
  'stock-writeoff': ['inventory'],
  'stock-transfer': ['inventory'],
  'qc-record': ['inventory'],
  'audit-post': ['inventory'],
  'audit-start': ['inventory'],
  'purchase-inbound': ['inventory'],
  'return-outbound': ['inventory'],
  'sales-outbound': ['sales', 'inventory'],
  // 其他
  'notification-batch': ['recycle'],
  'quote-accept': ['sales'],
  'password-change': [],      // 修改本人密码：任何已登录账号可用
  // 回收业务：回收单录入（业务员/回收域）
  'recycle-order-create': ['recycle', 'sales'],
  'purchase-order-create': ['sales', 'recycle'],
  // 回收退货流程：业务员发起 / 财务确认完成
  'recycle-return-start': ['recycle', 'sales'],
  'recycle-return-done': ['finance'],
  // 物流入库：已到达的物流单 → 加库存 + 建批次（仓储域）
  'logistics-inbound': ['inventory'],
}

// rows 写校验：返回 null 放行 / 403 消息
export function checkRowsWrite(userPerms, table) {
  const required = TABLE_WRITE_PERMS[table]
  if (required === undefined) return `该操作不在权限白名单内（${table}）`
  if (!hasPerm(userPerms, required)) return '无权限执行此操作（需要' + required.join('/') + '权限）'
  return null
}

// tx 校验：返回 null 放行 / 403 消息
export function checkTx(userPerms, action) {
  const required = TX_PERMS[action]
  if (required === undefined) return `未知事务操作或未授权（${action}）`
  if (!hasPerm(userPerms, required)) return '无权限执行此操作（需要' + required.join('/') + '权限）'
  return null
}

// rows 读校验：敏感表（财务流水 / 账号）按域校验；其余业务表登录即可读，
// 以兼容 Dashboard / 销售工作台等跨域聚合读取（departments/app_meta 由销售工作台与设置页读，不在此列）
const READ_TABLE_PERMS = {
  // 财务域
  settlement_flows: ['finance'],
  pay_logs: ['finance'],
  supplier_payments: ['finance'],
  commissions: ['finance'],
  payment_accounts: ['finance'],
  // 组织/账号域
  users: ['finance'],
  staff: ['finance'],
  roles: ['finance'],
}

export function checkRowsRead(userPerms, table) {
  const required = READ_TABLE_PERMS[table]
  if (required === undefined) return null
  if (!hasPerm(userPerms, required)) return '无权限查看（需要' + required.join('/') + '权限）'
  return null
}
