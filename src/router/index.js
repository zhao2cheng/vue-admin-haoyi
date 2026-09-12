import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/store/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  { path: '/public-quote', name: 'PublicQuote', component: () => import('@/views/PublicQuote.vue'), meta: { public: true } },
  {
    path: '/', component: () => import('@/views/layout/Index.vue'), redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '仪表盘' } },
      { path: 'recycle/orders', name: 'RecycleOrders', component: () => import('@/views/RecycleOrders.vue'), meta: { title: '电池回收订单', perm: 'recycle' } },
      { path: 'inventory/stock', name: 'InventoryStock', component: () => import('@/views/InventoryStock.vue'), meta: { title: '库存查询', perm: 'inventory' } },
      { path: 'inventory/purchase', name: 'InventoryPurchase', component: () => import('@/views/InventoryPurchase.vue'), meta: { title: '采购入库', perm: 'inventory' } },
      { path: 'logistics/orders', name: 'LogisticsManagement', component: () => import('@/views/LogisticsManagement.vue'), meta: { title: '物流管理', perm: 'inventory' } },
      { path: 'inventory/sales', name: 'InventorySales', component: () => import('@/views/InventorySales.vue'), meta: { title: '销售出库', perm: 'sales' } },
      { path: 'inventory/audit', name: 'InventoryAudit', component: () => import('@/views/InventoryAudit.vue'), meta: { title: '库存盘点', perm: 'inventory' } },
      { path: 'inventory/quotations', name: 'Quotations', component: () => import('@/views/Quotations.vue'), meta: { title: '报价单管理', perm: 'sales' } },
      { path: 'quotations/:id', name: 'QuoteDetail', component: () => import('@/views/QuoteDetail.vue'), meta: { title: '多方出价横向比对中心', perm: 'sales' } },
      { path: 'sales/workbench', name: 'SalesWorkbench', component: () => import('@/views/SalesWorkbench.vue'), meta: { title: '销售个人工作台', perm: 'sales' } },
      { path: 'sales/recycle-orders', name: 'MyRecycleOrders', component: () => import('@/views/MyRecycleOrders.vue'), meta: { title: '我的回收记录', perm: 'sales' } },
      { path: 'sales/performance', name: 'SalesPerformance', component: () => import('@/views/SalesPerformance.vue'), meta: { title: '我的业绩概览', perm: 'sales' } },
      { path: 'finance/settlement', name: 'FinanceSettlement', component: () => import('@/views/FinanceSettlement.vue'), meta: { title: '业绩结算中心', perm: 'finance' } },
      { path: 'finance/expense', name: 'ExpenseManagement', component: () => import('@/views/ExpenseManagement.vue'), meta: { title: '费用报销管理', perm: 'finance' } },
      { path: 'finance/supplier-payments', name: 'SupplierPayments', component: () => import('@/views/SupplierPayments.vue'), meta: { title: '供应商付款', perm: 'finance' } },
      { path: 'staff', name: 'Staff', component: () => import('@/views/Staff.vue'), meta: { title: '员工与权限管理', perm: 'finance' } },
      { path: 'data/products', name: 'DataProducts', component: () => import('@/views/DataProducts.vue'), meta: { title: '产品资料', perm: 'data' } },
      { path: 'data/categories', name: 'DataCategories', component: () => import('@/views/DataCategories.vue'), meta: { title: '产品分类管理', perm: 'data' } },
      { path: 'data/suppliers', name: 'DataSuppliers', component: () => import('@/views/DataSuppliers.vue'), meta: { title: '供应商管理', perm: 'data' } },
      { path: 'data/warehouses', name: 'DataWarehouses', component: () => import('@/views/DataWarehouses.vue'), meta: { title: '仓库管理', perm: 'data' } },
      { path: 'data/customers', name: 'Customers', component: () => import('@/views/Customers.vue'), meta: { title: '客户管理', perm: 'data' } },
      { path: 'feedback', name: 'Feedback', component: () => import('@/views/Feedback.vue'), meta: { title: '意见反馈', perm: 'recycle' } },
      { path: 'messages', name: 'Messages', component: () => import('@/views/Messages.vue'), meta: { title: '消息中心', perm: 'recycle' } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: '系统设置', perm: 'data' } },
    ]
  }
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.token) {
    next('/login')
  } else if (to.meta.perm) {
    const p = auth.user?.permissions || []
    if (!p.includes('*') && !p.includes(to.meta.perm)) {
      next('/dashboard')
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router
