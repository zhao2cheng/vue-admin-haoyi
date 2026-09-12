// rows.js — 关系型数据访问层，对接后端 /api/rows 与 /api/tx
// 后端返回结构统一为 { code, message, data }，axios 响应拦截器已拆出 data。
import api from './index'

// ── 通用 CRUD ──
export const rowsApi = {
  list: (table, params) => api.get(`/rows/${table}`, { params }),
  get: (table, id) => api.get(`/rows/${table}/${id}`),
  create: (table, data) => api.post(`/rows/${table}`, data),
  update: (table, id, data) => api.put(`/rows/${table}/${id}`, data),
  remove: (table, id) => api.delete(`/rows/${table}/${id}`),
}

// ── 价格参考（加权平均）──
export const priceApi = {
  // 按产品查近 N 天历史成交的加权平均参考价
  reference: (productId, days = 90) => api.get('/price/reference', { params: { product_id: productId, days } }),
}

// ── 事务型业务 ──
export const txApi = {
  payExecute: (data) => api.post('/tx/pay-execute', data),
  supplierPay: (data) => api.post('/tx/supplier-pay', data),
  stockWriteoff: (data) => api.post('/tx/stock-writeoff', data),
  auditPost: (data) => api.post('/tx/audit-post', data),
  notificationBatch: (data) => api.post('/tx/notification-batch', data),
  staffCreate: (data) => api.post('/tx/staff-create', data),
  recyclePay: (data) => api.post('/tx/recycle-pay', data),
  purchaseInbound: (data) => api.post('/tx/purchase-inbound', data),
  salesOutbound: (data) => api.post('/tx/sales-outbound', data),
  stockTransfer: (data) => api.post('/tx/stock-transfer', data),
  qcRecord: (data) => api.post('/tx/qc-record', data),
  commissionSettle: (data) => api.post('/tx/commission-settle', data),
  returnOutbound: (data) => api.post('/tx/return-outbound', data),
  quoteAccept: (data) => api.post('/tx/quote-accept', data),
  auditStart: (data) => api.post('/tx/audit-start', data),
  permissionSync: (data) => api.post('/tx/permission-sync', data),
  accountSave: (data) => api.post('/tx/account-save', data),
  recycleOrderCreate: (data) => api.post('/tx/recycle-order-create', data),
  purchaseOrderCreate: (data) => api.post('/tx/purchase-order-create', data),
  recycleReturnStart: (data) => api.post('/tx/recycle-return-start', data),
  recycleReturnDone: (data) => api.post('/tx/recycle-return-done', data),
  logisticsInbound: (data) => api.post('/tx/logistics-inbound', data),
}
