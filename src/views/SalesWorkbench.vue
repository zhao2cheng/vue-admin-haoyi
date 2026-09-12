<template>
  <div class="sales-workbench p-2">
    <!-- ── Top Section: 2 cards ── -->
    <div class="grid grid-cols-12 gap-6 mb-8">
      <!-- Left: Avatar + greeting + stats -->
      <div class="col-span-12 lg:col-span-8 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative overflow-hidden">
        <!-- Background blur decoration -->
        <div class="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <!-- Left content: avatar + greeting + inline stats -->
        <div class="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10 flex-1">
          <div class="flex items-center gap-6">
            <el-avatar :size="80" src="https://api.dicebear.com/7.x/avataaars/svg?seed=SF" class="shadow-xl border-4 border-white flex-shrink-0" />
            <div>
              <p class="text-2xl font-black text-gray-900">早安，{{ wb.user.name }}</p>
              <p class="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{{ wb.user.role }} • {{ wb.user.dept }}</p>
            </div>
          </div>
          <!-- Inline stats -->
          <div class="flex items-center gap-10 pl-0 sm:pl-10 border-0 sm:border-l border-gray-100">
            <div class="stat cursor-pointer group" @click="$router.push('/sales/recycle-orders')">
              <p class="label text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">本月回收数</p>
              <p class="val text-3xl font-black text-blue-600">{{ wb.monthRecycle }} <span class="text-xs font-bold">组</span></p>
            </div>
            <div class="stat">
              <p class="label text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">本月销售额</p>
              <p class="val text-3xl font-black text-[#059669]">¥{{ (wb.monthSales / 10000).toFixed(1) }}W</p>
            </div>
          </div>
        </div>
        <!-- Right: action buttons -->
        <div class="relative z-10 flex sm:flex-col gap-3">
          <el-button type="primary" class="!rounded-2xl !h-12 !px-8 !text-sm !font-black !shadow-lg" @click="handleRecycle">回收物品录入</el-button>
          <el-button type="success" class="!rounded-2xl !h-12 !px-8 !text-sm !font-black !shadow-lg" @click="handleSales">发起销售订单</el-button>
        </div>
      </div>

      <!-- Right: Goal card (emerald dark) -->
      <div class="col-span-12 lg:col-span-4 bg-[#064e3b] p-8 rounded-[40px] text-white shadow-xl flex flex-col justify-between">
        <div>
          <p class="text-[10px] font-black text-[#6ee7b7] uppercase tracking-[0.2em] mb-4">月度目标达成率</p>
          <div class="flex items-end gap-3 mb-2">
            <span class="text-4xl font-black italic">{{ wb.targetRate }}%</span>
            <span class="text-[#34d399] text-xs font-bold mb-1">↑ 12% vs LY</span>
          </div>
          <el-progress :percentage="wb.targetRate" :show-text="false" color="#10b981" class="!h-2" />
        </div>
        <p class="text-[11px] opacity-60 leading-relaxed mt-4 font-medium">距离 Q2 销售冠军仅差 ¥12,500，加油！</p>
      </div>
    </div>

    <!-- ── Bottom Section: 12-col grid ── -->
    <div class="grid grid-cols-12 gap-6">
      <!-- Left: Business log table -->
      <div class="col-span-12 lg:col-span-8 flex flex-col gap-6">
        <el-card shadow="never" class="!rounded-[40px] border-none shadow-sm flex-1">
          <template #header>
            <div class="flex justify-between items-center">
              <h3 class="text-sm font-black text-gray-900 uppercase tracking-widest">我的最近业务流水</h3>
              <div class="flex items-center gap-3">
                <el-button size="small" :icon="Download" @click="exportLogs">导出流水</el-button>
                <el-radio-group v-model="filterType" size="small">
                  <el-radio-button label="all">全部</el-radio-button>
                  <el-radio-button label="recycle">回收</el-radio-button>
                  <el-radio-button label="sales">销售</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </template>

          <!-- 查询栏：日期范围 / 关键字 / 状态 / 重置 -->
          <div class="query-bar flex flex-wrap items-center gap-3 mb-5">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              size="small"
              class="!w-72"
            />
            <el-input
              v-model="searchKeyword"
              placeholder="搜索产品名称 / 客户"
              :prefix-icon="Search"
              clearable
              size="small"
              class="!w-56"
            />
            <el-select
              v-model="statusFilter"
              placeholder="全部状态"
              clearable
              size="small"
              class="!w-32"
            >
              <el-option v-for="s in allStatuses" :key="s" :label="s" :value="s" />
            </el-select>
            <el-button :icon="Refresh" size="small" plain @click="resetQuery">重置</el-button>
          </div>

          <el-table :data="paginatedLogs" size="small" empty-text="没有符合条件的流水">
            <el-table-column label="日期" prop="date" width="120" />
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="row.type === 'recycle' ? 'primary' : 'success'" size="small" class="!rounded-md">
                  {{ row.type === 'recycle' ? '回收' : '销售' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="产品名称" prop="product" />
            <el-table-column label="数量" prop="qty" width="80" />
            <el-table-column label="金额/估价" width="120">
              <template #default="{ row }">
                <span class="font-bold">¥{{ row.price }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <span :class="row.status === '完成' ? 'text-[#10b981]' : 'text-orange-500'" class="text-[10px] font-black uppercase tracking-tighter"> ● {{ row.status }}</span>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页 -->
          <div class="flex justify-end mt-4" v-if="filteredLogs.length > pageSize">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :total="filteredLogs.length"
              :page-sizes="[8, 16, 24, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              small
              background
            />
          </div>
        </el-card>
      </div>

      <!-- Right column: Ranking + Settlement -->
      <div class="col-span-12 lg:col-span-4 flex flex-col gap-6">
        <!-- Department ranking -->
        <div class="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
          <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">回收 TOP 客户</h3>
          <div class="space-y-6">
            <div v-for="(item, idx) in wb.rankings" :key="item.name" class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span :class="idx === 0 ? 'text-orange-500' : 'text-gray-300'" class="text-sm font-black italic">{{ String(idx + 1).padStart(2, '0') }}</span>
                <el-avatar :size="32" :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${item.name}`" />
                <span class="text-xs font-bold text-gray-800">{{ item.name }}</span>
              </div>
              <span class="text-xs font-black text-gray-900">¥{{ item.value }}</span>
            </div>
          </div>
        </div>

        <!-- Pending settlement -->
        <div class="bg-gray-900 p-8 rounded-[40px] shadow-xl text-white">
          <p class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">待结算绩效</p>
          <p class="text-3xl font-black mb-6">¥{{ wb.pendingSettlement }}</p>
          <el-button class="w-full !rounded-2xl !h-12 !bg-white/10 !border-none !text-white !font-bold" @click="handleSettlement">查看结算明细</el-button>
        </div>
      </div>
    </div>

    <!-- ── Dialogs (kept from original) ── -->
    <el-dialog v-model="dlgRecycle" title="回收物品录入向导" width="600px">
      <el-form :model="rf" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="客户姓名"><el-input v-model="rf.customer"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="rf.phone"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="电池类型"><el-select v-model="rf.type" style="width:100%"><el-option v-for="t in ['动力电池','磷酸铁锂','三元锂','混合动力电池']" :key="t" :label="t" :value="t"/></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="电池品牌"><el-input v-model="rf.brand" placeholder="如: 特斯拉"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="预估重量(kg)"><el-input v-model="rf.weight" type="number"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="估价金额"><el-input v-model="rf.price"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="回收地址"><el-input v-model="rf.address" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlgRecycle=false">取消</el-button><el-button type="primary" @click="submit('recycle')">提交</el-button></template>
    </el-dialog>

    <el-dialog v-model="dlgSales" title="发起销售订单" width="550px">
      <el-form :model="sf" label-width="100px">
        <el-form-item label="客户名称"><el-input v-model="sf.customer"/></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="产品"><el-select v-model="sf.product" style="width:100%" placeholder="请选择"><el-option v-for="p in ['75kWh 翻新电池组','60kWh 三元锂电池']" :key="p" :label="p" :value="p"/></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="数量"><el-input v-model="sf.qty" type="number"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="销售单价"><el-input v-model="sf.price"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlgSales=false">取消</el-button><el-button type="primary" @click="submit('sales')">创建订单</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { rowsApi } from '@/api/rows'
import { useAuthStore } from '@/store/auth'
import { ElMessage } from 'element-plus'
import { Download, Search, Refresh } from '@element-plus/icons-vue'
import { exportCsv, toNum, nowStamp } from '@/utils/export'

const router = useRouter()
const auth = useAuthStore()
const wb = ref({
  user: { name: '', role: '', dept: '' },
  monthRecycle: 0,
  monthSales: 0,
  targetRate: 0,
  pendingSettlement: 0,
  rankings: [],
  logs: [],
})

function moneyNum(v) {
  return parseFloat(String(v ?? '0').replace(/,/g, '')) || 0
}
function ymOf(t) {
  const m = String(t || '').match(/(\d{4})[/-](\d{1,2})/)
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : ''
}
const now = new Date()
const thisYM = ymOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)

const RC_STATUS = { pending: '待报价', processing: '处理中', completed: '已完成', shipped: '已出库', cancelled: '已取消' }
const SO_STATUS = { pending_payment: '待付款', pending_outbound: '待出库', shipping: '出库中', completed: '已完成' }

async function loadWorkbench() {
  try {
    const [roRes, soRes, cusRes, metaRes, deptRes] = await Promise.all([
      rowsApi.list('recycle_orders', { size: 200 }),
      rowsApi.list('sales_orders', { size: 200 }),
      rowsApi.list('customers', { size: 200 }),
      rowsApi.list('app_meta', { size: 200 }),
      rowsApi.list('departments', { size: 100 }),
    ])
    const orders = roRes?.data?.list || []
    const sales = soRes?.data?.list || []
    const customers = cusRes?.data?.list || []
    const metas = metaRes?.data?.list || []
    const depts = deptRes?.data?.list || []

    // 登录用户信息（真实 staff/users）
    const u = auth.user || {}
    const dept = (depts.find((d) => d.id === u.dept_id) || {}).name || '销售中心'
    wb.value.user = { name: u.real_name || u.name || '销售', role: u.role || '销售', dept }

    // 本月回收单数 / 本月销售额
    const monthOrders = orders.filter((o) => ymOf(o.time) === thisYM)
    const monthSalesList = sales.filter((o) => ymOf(o.time) === thisYM)
    wb.value.monthRecycle = monthOrders.length
    wb.value.monthSales = monthSalesList.reduce((s, o) => s + moneyNum(o.total), 0)

    // 目标达成率 = 本月销售额 / salesTarget（app_meta 配置）
    const metaMap = {}
    for (const m of metas) metaMap[m.key] = moneyNum(m.value)
    const target = metaMap.salesTarget || 0
    wb.value.targetRate = target > 0 ? Math.min(100, Math.round((wb.value.monthSales / target) * 100)) : 0

    // 待结算 = 销售未收余额 + 回收未付估价
    const salesBalance = sales.reduce((s, o) => s + moneyNum(o.balance), 0)
    const rcUnpaid = orders.reduce((s, o) => s + Math.max(0, moneyNum(o.valuation) - moneyNum(o.paid_amount)), 0)
    wb.value.pendingSettlement = (salesBalance + rcUnpaid).toLocaleString('en-US')

    // 回收 TOP 客户（customers.total_value 真实排名）
    wb.value.rankings = [...customers]
      .map((c) => ({ name: c.name || c.phone || '客户', value: moneyNum(c.total_value).toLocaleString('en-US') }))
      .sort((a, b) => moneyNum(b.value) - moneyNum(a.value))
      .slice(0, 5)

    // 业务流水（合并全部回收 + 销售，不限本月，供查询栏筛选）
    const logs = []
    for (const o of orders) {
      logs.push({
        date: (o.time || '').slice(0, 10), type: 'recycle',
        product: o.summary || o.type || '回收',
        customer: o.user_name || o.supplier || '',
        qty: o.count || 1,
        price: moneyNum(o.valuation).toLocaleString('en-US'),
        status: RC_STATUS[o.status] || o.status || '—', sort: o.time || '',
      })
    }
    for (const s of sales) {
      logs.push({
        date: (s.time || '').slice(0, 10), type: 'sales',
        product: s.product_summary || '销售',
        customer: s.customer || '',
        qty: s.item_count || 1,
        price: moneyNum(s.total).toLocaleString('en-US'),
        status: SO_STATUS[s.status] || s.status || '—', sort: s.time || '',
      })
    }
    logs.sort((a, b) => b.sort.localeCompare(a.sort))
    wb.value.logs = logs
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(() => {
  // 默认日期范围：本月第一天 → 今天
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  dateRange.value = [formatYmd(first), formatYmd(now)]
  loadWorkbench()
})
const filterType = ref('all')
const dlgRecycle = ref(false)
const dlgSales = ref(false)

// ═══ 查询栏状态 ═══
const dateRange = ref([])            // ['YYYY-MM-DD', 'YYYY-MM-DD']
const searchKeyword = ref('')
const statusFilter = ref('')
const currentPage = ref(1)
const pageSize = ref(8)
const allStatuses = [...new Set([...Object.values(RC_STATUS), ...Object.values(SO_STATUS)])]

function formatYmd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const rf = reactive({ customer: '', phone: '', type: '', brand: '', weight: '', price: '', address: '' })
const sf = reactive({ customer: '', product: '', qty: '', price: '' })

// ═══ 业务流水：按类型 / 日期 / 关键字 / 状态 多条件过滤 ═══
const filteredLogs = computed(() => {
  let data = wb.value.logs
  // 类型
  if (filterType.value !== 'all') {
    data = data.filter((l) => l.type === filterType.value)
  }
  // 日期范围
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter((l) => (l.date || '') >= start && (l.date || '') <= end)
  }
  // 关键字：产品名称 / 客户
  if (searchKeyword.value && searchKeyword.value.trim()) {
    const q = searchKeyword.value.trim().toLowerCase()
    data = data.filter((l) =>
      (l.product || '').toLowerCase().includes(q) ||
      (l.customer || '').toLowerCase().includes(q)
    )
  }
  // 状态
  if (statusFilter.value) {
    data = data.filter((l) => l.status === statusFilter.value)
  }
  return data
})

// 翻页
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredLogs.value.slice(start, start + pageSize.value)
})

// 任何过滤条件变化都把页码拨回 1
function _bumpToFirstPage() { currentPage.value = 1 }
watch([filterType, dateRange, searchKeyword, statusFilter], _bumpToFirstPage)

function resetQuery() {
  filterType.value = 'all'
  searchKeyword.value = ''
  statusFilter.value = ''
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  dateRange.value = [formatYmd(first), formatYmd(now)]
  currentPage.value = 1
}

function exportLogs() {
  if (!filteredLogs.value.length) {
    ElMessage.warning('当前没有可导出的业务流水')
    return
  }
  const headers = ['日期', '类型', '产品名称', '数量', '金额/估价', '状态']
  const rows = filteredLogs.value.map((l) => [
    l.date,
    l.type === 'recycle' ? '回收' : '销售',
    l.product,
    l.qty,
    toNum(l.price),
    l.status,
  ])
  exportCsv(`我的业务流水_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条业务流水`)
}

function handleRecycle() {
  dlgRecycle.value = true
}
function handleSales() {
  dlgSales.value = true
}
function handleSettlement() {
  router.push('/finance/settlement')
}

async function submit(k) {
  if (k === 'recycle') {
    if (!rf.customer || !rf.type) return ElMessage.warning('请完善回收信息')
    const newId = 'RC' + Date.now().toString().slice(-8)
    try {
      await rowsApi.create('recycle_orders', {
        id: newId,
        user_name: rf.customer,
        phone: rf.phone || '',
        brand: rf.brand || '',
        type: rf.type,
        count: 1,
        capacity: rf.weight ? rf.weight + 'kg' : '',
        valuation: rf.price || '0',
        status: 'pending',
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        supplier: rf.customer,
        source_type: 'individual',
        summary: `${rf.brand || rf.type} x1`,
        amount: rf.price || '0',
        payment_type: '现结',
        payment_applied: 0,
        paid: 0,
        paid_amount: '0.00',
        contact: rf.phone || '',
        address: rf.address || '',
      })
      ElMessage.success('回收登记已创建')
      dlgRecycle.value = false
      loadWorkbench()
    } catch (e) {
      ElMessage.error('创建失败：' + (e?.response?.data?.message || e.message))
    }
    return
  }
  if (k === 'sales') {
    if (!sf.customer || !sf.product) return ElMessage.warning('请完善销售信息')
    const newId = 'SO' + Date.now().toString().slice(-8)
    try {
      await rowsApi.create('sales_orders', {
        id: newId,
        customer: sf.customer,
        product_summary: `${sf.product} x${sf.qty || 1}`,
        item_count: 1,
        total: sf.price || '0',
        status: 'pending_payment',
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        received_amount: '0.00',
        balance: sf.price || '0',
      })
      ElMessage.success('销售单已创建')
      dlgSales.value = false
      loadWorkbench()
    } catch (e) {
      ElMessage.error('创建失败：' + (e?.response?.data?.message || e.message))
    }
  }
}
</script>

<style scoped>
.sales-workbench {
/* container */
}

.stat .val {
  font-weight: 900;
  line-height: 1;
}

/* Override radio-button to match target design */
:deep(.el-radio-button__inner) {
  margin-left: 0.25rem !important;
  margin-right: 0.25rem !important;
  border-radius: 0.75rem !important;
  border-style: none !important;
  background-color: #f9fafb !important;
  padding-left: 1.5rem !important;
  padding-right: 1.5rem !important;
  font-weight: 700 !important;
  color: #9ca3af !important;
  transition: all 0.15s;
}
:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #111827 !important;
  color: #fff !important;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1) !important;
}

/* Table transparent background */
:deep(.el-table) {
  background: transparent !important;
}
:deep(.el-table th.el-table__cell) {
  background: transparent !important;
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.1em !important;
  color: #d1d5db !important;
}
:deep(.el-table td.el-table__cell) {
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
}
</style>
