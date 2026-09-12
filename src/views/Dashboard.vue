<template>
  <div class="dashboard-page">
    <!-- Stat Cards Row -->
    <el-row :gutter="24">
      <el-col v-for="s in stats" :key="s.label" :span="12">
        <div class="stat-card group">
          <div class="stat-info">
            <p class="label">{{ s.label }}</p>
            <h3 class="value">{{ s.value }}</h3>
            <div class="trend" :class="s.isUp ? 'up' : 'down'">
              <el-icon :size="14"><CaretTop v-if="s.isUp" /><CaretBottom v-else /></el-icon>
              {{ s.change }}
              <span class="compare">较上月</span>
            </div>
          </div>
          <div class="icon-box" :style="{ background: s.color, boxShadow: '0 8px 16px -4px ' + s.color + '66' }">
            <el-icon :size="24" color="#fff"><component :is="s.icon" /></el-icon>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Order Table + Stock Alerts -->
    <el-row :gutter="24" class="mt-8">
      <el-col :span="16">
        <el-card shadow="never" class="order-card">
          <template #header>
            <div class="card-header">
              <div class="title-group">
                <h3>最新回收订单</h3>
                <p>实时监控进货流量</p>
              </div>
              <div class="header-tools">
                <el-input v-model="orderQuery" placeholder="搜索客户/产品/流水号" clearable size="small" class="!w-48" :prefix-icon="Search">
                </el-input>
                <el-select v-model="orderStatusFilter" placeholder="全部状态" clearable size="small" class="!w-28">
                  <el-option v-for="s in ORDER_STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
                </el-select>
                <el-button v-if="hasOrderFilter" link type="primary" class="font-bold" @click="clearOrderFilter">清除筛选</el-button>
                <el-button link type="primary" class="font-bold" @click="$router.push('/recycle/orders')">查看全部</el-button>
              </div>
            </div>
          </template>
          <el-table :data="displayOrders" style="width: 100%" class="order-table" empty-text="无匹配订单">
            <el-table-column label="客户/产品" min-width="200">
              <template #default="{ row }">
                <div class="item-info">
                  <div class="icon-circle"><el-icon><Box /></el-icon></div>
                  <div class="texts">
                    <p class="name">{{ row.user }} - {{ row.type }}</p>
                    <p class="id">{{ row.id }} • {{ row.time }}</p>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="weight" label="重量" align="center" width="100">
              <template #default="{ row }">
                <span class="font-bold text-gray-700">{{ row.weight }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" align="right" width="120">
              <template #default="{ row }">
                <el-tag :type="row.statusType" effect="light" class="rounded-full font-bold">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card shadow="never" class="stock-card">
          <template #header><h3 class="font-bold">库存预警</h3></template>
          <div class="stock-list">
            <div v-for="a in alerts" :key="a.label" class="stock-item">
              <div class="info">
                <span class="label">{{ a.label }}</span>
                <span class="percent" :class="a.value < 20 ? 'danger' : ''">{{ a.value }}%</span>
              </div>
              <el-progress :percentage="a.value" :stroke-width="8" :color="a.color" :show-text="false" />
            </div>
          </div>
          <div class="tips-box mt-12">
            <div class="tips-content">
              <h4>销售建议</h4>
              <p>{{ tip }}</p>
            </div>
            <div class="tips-bg"></div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { rowsApi } from '@/api/rows'
import { Box, RefreshRight, Clock, CaretTop, CaretBottom, Search } from '@element-plus/icons-vue'

const stats = ref([])
const allRecentOrders = ref([])
const alerts = ref([])
const tip = ref('')

// 回收单状态 → 中文 / tag 类型（与 RecycleOrders 页一致）
const STATUS_TEXT = { pending: '待报价', processing: '处理中', completed: '已完成', shipped: '已出库', cancelled: '已取消' }
const STATUS_TAG = { pending: 'warning', processing: 'warning', completed: 'success', shipped: 'success', cancelled: 'info' }
// 状态筛选项（label=展示文本，value=与 row.status 完全一致的字符串）
const ORDER_STATUS_OPTIONS = [
  { value: '待报价', label: '待报价' },
  { value: '处理中', label: '处理中' },
  { value: '已完成', label: '已完成' },
  { value: '已出库', label: '已出库' },
  { value: '已取消', label: '已取消' },
]

// 头部查询
const orderQuery = ref('')
const orderStatusFilter = ref('')
const hasOrderFilter = computed(() => !!orderQuery.value.trim() || !!orderStatusFilter.value)
function clearOrderFilter() { orderQuery.value = ''; orderStatusFilter.value = '' }
// 表格显示列表：未筛选时取前 6 条最新；筛选时取全部匹配
const displayOrders = computed(() => {
  if (!hasOrderFilter.value) return allRecentOrders.value.slice(0, 6)
  const q = orderQuery.value.trim().toLowerCase()
  const sf = orderStatusFilter.value
  return allRecentOrders.value.filter((o) => {
    if (sf && o.status !== sf) return false
    if (q) {
      const hay = (o.user + ' ' + o.type + ' ' + o.id).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function moneyNum(v) {
  return parseFloat(String(v ?? '0').replace(/,/g, '')) || 0
}

// 取时间里的年月（兼容 '2024-01-23 09:30' 与小程序 '2026/8/16 20:17'）
function ymOf(t) {
  const m = String(t || '').match(/(\d{4})[/-](\d{1,2})/)
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : ''
}

const now = new Date()
const thisYM = ymOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const lastYM = ymOf(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-01`)

async function loadDashboard() {
  const [roRes, soRes, siRes, prodRes] = await Promise.all([
    rowsApi.list('recycle_orders', { size: 200 }),
    rowsApi.list('sales_orders', { size: 200 }),
    rowsApi.list('stock_items', { size: 200 }),
    rowsApi.list('products', { size: 200 }),
  ])
  const orders = roRes?.data?.list || []
  const stock = siRes?.data?.list || []
  const products = prodRes?.data?.list || []

  // 本月/上月回收金额 + 待处理单环比
  let thisAmount = 0, lastAmount = 0, thisPending = 0, lastPending = 0
  for (const o of orders) {
    const ym = ymOf(o.time)
    const v = moneyNum(o.valuation)
    if (ym === thisYM) { thisAmount += v; if (['pending', 'processing'].includes(o.status)) thisPending++ }
    else if (ym === lastYM) { lastAmount += v; if (['pending', 'processing'].includes(o.status)) lastPending++ }
  }
  let amtPct, amtUp = true
  if (lastAmount > 0) {
    amtPct = ((thisAmount - lastAmount) / lastAmount * 100).toFixed(1) + '%'
    amtUp = thisAmount >= lastAmount
  } else {
    amtPct = thisAmount > 0 ? '新增' : '—'
  }
  const pDelta = thisPending - lastPending

  stats.value = [
    {
      label: '本月回收金额',
      value: '¥' + thisAmount.toLocaleString('en-US'),
      change: (amtUp ? '+' : '') + amtPct,
      isUp: amtUp,
      icon: RefreshRight,
      color: '#10b981'
    },
    {
      label: '待处理回收单',
      value: thisPending + ' 个',
      change: (pDelta >= 0 ? '+' : '') + pDelta,
      isUp: pDelta >= 0,
      icon: Clock,
      color: '#f97316'
    },
  ]

  // 最新回收订单（真实 recycle_orders，按时间倒序取 30 条作为查询源）
  // 默认仅展示前 6 条；触发搜索/状态筛选时展示全部匹配
  allRecentOrders.value = [...orders]
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    .slice(0, 30)
    .map((o) => ({
      id: o.id,
      user: o.user_name || o.contact || '—',
      type: o.type || o.summary || '回收',
      weight: (o.count || 1) + '件 ' + (o.capacity || ''),
      status: STATUS_TEXT[o.status] || o.status || '—',
      statusType: STATUS_TAG[o.status] || 'info',
      time: o.time || '',
    }))

  // 库存预警：stock_items 关联 products.safety_stock（缺省 20），按水位升序取 4
  const safetyBySku = {}
  for (const p of products) safetyBySku[p.sku] = moneyNum(p.safety_stock) || 20
  const alertRows = stock
    .map((s) => {
      const safety = safetyBySku[s.sku] || 20
      const level = Math.min(100, Math.round((moneyNum(s.qty) / safety) * 100))
      return { label: s.name, value: level, color: level < 30 ? '#ef4444' : level < 60 ? '#f59e0b' : '#3b82f6' }
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 4)
  alerts.value = alertRows
  const lowest = alertRows[0]
  tip.value = lowest && lowest.value < 100
    ? `「${lowest.label}」库存已低于安全水位（${lowest.value}%），建议补货。`
    : '当前库存充足，建议维持常规采购节奏。'
}

onMounted(loadDashboard)
</script>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Stat Cards ── */
.stat-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-radius: 24px;
  border: 1px solid #f3f4f6;
  background: #fff;
  padding: 1.5rem;
  box-shadow: 0 1px 2px 0 rgba(0,0,0,.05);
  transition: box-shadow .15s, transform .15s;
  cursor: default;
}
.stat-card:hover {
  box-shadow: 0 12px 24px -8px rgba(0,0,0,.12);
  transform: translateY(-2px);
}

.stat-info { flex: 1; }
.stat-info .label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #9ca3af;
  margin-bottom: 8px;
}
.stat-info .value {
  font-size: 24px;
  font-weight: 900;
  color: #111827;
  line-height: 1.2;
  margin-bottom: 8px;
}

.trend {
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 2px;
}
.trend.up { color: #10b981; }
.trend.down { color: #f59e0b; }
.trend .compare { color: #9ca3af; font-weight: 400; margin-left: 4px; }

.icon-box {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 8px 16px -4px rgba(0,0,0,.15);
}
.icon-box.bg-yellow-500  { background: #eab308; box-shadow: 0 8px 16px -4px rgba(234,179,8,.4); }
.icon-box.bg-blue-500    { background: #3b82f6; box-shadow: 0 8px 16px -4px rgba(59,130,246,.4); }
.icon-box.bg-emerald-500 { background: #10b981; box-shadow: 0 8px 16px -4px rgba(16,185,129,.4); }
.icon-box.bg-orange-500  { background: #f97316; box-shadow: 0 8px 16px -4px rgba(249,115,22,.4); }

/* ── Order Card ── */
.order-card { border-radius: 24px !important; box-shadow: 0 1px 2px 0 rgba(0,0,0,.05) !important; }

.card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.header-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.title-group h3 {
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #111827;
}
.title-group p { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.font-bold { font-weight: 700; }

.item-info { display: flex; align-items: center; gap: 12px; }
.icon-circle {
  width: 40px; height: 40px;
  border-radius: 12px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  flex-shrink: 0;
}
.texts .name { font-size: 13px; font-weight: 700; color: #111827; }
.texts .id { font-size: 11px; color: #9ca3af; margin-top: 2px; }

:deep(.order-table) { background: transparent !important; }
:deep(.order-table th.el-table__cell) {
  background: transparent !important;
  padding-top: 12px !important;
  padding-bottom: 12px !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #d1d5db !important;
  border-bottom: 1px solid #f3f4f6;
}
:deep(.order-table td.el-table__cell) {
  padding-top: 14px !important;
  padding-bottom: 14px !important;
  border-bottom: 1px solid #f9fafb;
}

/* ── Stock Card ── */
.stock-card { border-radius: 24px !important; box-shadow: 0 1px 2px 0 rgba(0,0,0,.05) !important; height: 100%; }
.stock-list { display: flex; flex-direction: column; gap: 20px; }
.stock-item .info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.stock-item .info .label { font-size: 12px; font-weight: 700; color: #374151; }
.stock-item .info .percent { font-size: 13px; font-weight: 900; color: #6b7280; }
.stock-item .info .percent.danger { color: #ea580c; }

.tips-box {
  position: relative;
  overflow: hidden;
  border-radius: 1.5rem;
  background: #065f46;
  padding: 1.5rem;
  color: #fff;
  margin-top: 48px;
}
.tips-content { position: relative; z-index: 10; }
.tips-content h4 {
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .1em;
  margin-bottom: 6px;
}
.tips-content p { font-size: 12px; opacity: .8; line-height: 1.6; }
.tips-bg {
  position: absolute;
  right: -1rem;
  bottom: -1rem;
  height: 4rem;
  width: 4rem;
  border-radius: 9999px;
  background: rgba(255,255,255,.1);
  filter: blur(24px);
}

.mt-8 { margin-top: 32px; }
</style>
