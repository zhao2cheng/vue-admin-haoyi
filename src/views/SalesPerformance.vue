<template>
  <div class="my-performance min-h-screen" style="background:#f4f7f9">
    <!-- Header -->
    <div class="flex justify-between items-center px-6 py-4 mb-3 bg-white rounded-3xl shadow-sm border border-white">
      <div class="flex items-center gap-4">
        <div class="w-1.5 h-8 bg-blue-600 rounded-full"></div>
        <div>
          <h2 class="text-xl font-black text-gray-900 leading-none">我的业绩概览</h2>
          <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">业绩追踪仪表盘</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <el-date-picker v-model="month" type="month" placeholder="切换统计月份" size="small" class="!w-32 pro-month-picker" />
        <el-button type="primary" :icon="Download" size="small" round class="font-black" @click="exportReport">导出报表</el-button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-4 gap-3 mb-3">
      <div v-for="s in stats" :key="s.label"
        class="bg-white p-4 rounded-3xl border border-white shadow-sm flex flex-col justify-between hover:shadow-md transition-all group"
      >
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">{{ s.label }}</p>
        <div class="flex items-baseline gap-1 mt-2">
          <span class="text-2xl font-black text-gray-900 tracking-tighter">{{ s.value }}</span>
          <span class="text-[10px] text-gray-400 font-bold uppercase">{{ s.unit }}</span>
        </div>
        <div class="mt-2 flex items-center justify-between border-t border-gray-50 pt-2">
          <span :class="[s.trendUp ? 'text-[#10b981]' : 'text-rose-500', 'text-[9px] font-black uppercase']">
            {{ s.trendUp ? '↑' : '↓' }} {{ s.trend }}%
          </span>
          <span class="text-[8px] text-gray-300 font-bold uppercase tracking-tighter">环比</span>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-12 gap-3">
      <!-- Trend Chart -->
      <el-card shadow="never" class="col-span-8 !rounded-3xl border-none shadow-sm overflow-hidden">
        <div class="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <h4 class="text-[10px] font-black text-gray-400 uppercase tracking-widest">业绩趋势分析（近30天）</h4>
          <div class="flex gap-3">
            <span class="flex items-center gap-1.5 text-[9px] font-black text-gray-400 uppercase">
              <i class="w-2 h-2 bg-blue-500 rounded-full"></i> 销售
            </span>
            <span class="flex items-center gap-1.5 text-[9px] font-black text-gray-400 uppercase">
              <i class="w-2 h-2 bg-[#10b981] rounded-full"></i> 回收
            </span>
          </div>
        </div>
        <div class="p-6 h-[200px] flex items-end justify-between gap-1">
          <div v-for="d in trendData" :key="d.date" class="flex-1 flex flex-col items-center gap-2 min-w-0 h-full"
            :title="`${d.date} 销售 ¥${fmtMoney(d.sales)} / 回收 ¥${fmtMoney(d.recycle)}`">
            <div class="w-full flex gap-0.5 items-end h-full">
              <div class="flex-1 bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors"
                :style="{ height: Math.max(d.salesH, d.sales > 0 ? 4 : 0.5) + '%' }"></div>
              <div class="flex-1 bg-[#10b981] rounded-t-sm hover:bg-emerald-600 transition-colors"
                :style="{ height: Math.max(d.recycleH, d.recycle > 0 ? 4 : 0.5) + '%' }"></div>
            </div>
            <span class="text-[8px] font-black text-gray-300 truncate w-full text-center">{{ d.label }}</span>
          </div>
        </div>
      </el-card>

      <!-- Pending Commissions -->
      <el-card shadow="never" class="col-span-4 !rounded-3xl border-none shadow-sm overflow-hidden flex flex-col">
        <div class="p-4 border-b border-gray-50 bg-gray-50/50">
          <h4 class="text-[10px] font-black text-gray-400 uppercase tracking-widest">待结算酬金</h4>
        </div>
        <div class="p-2 space-y-1.5 overflow-y-auto max-h-[260px] custom-scrollbar">
          <div v-for="p in pending" :key="p.id"
            class="flex justify-between items-center p-3 bg-white border border-gray-50 rounded-xl hover:border-blue-100 transition-all"
          >
            <div>
              <span class="text-[10px] font-black text-blue-400 font-mono">{{ p.id }}</span>
              <p class="text-[13px] font-black text-gray-700 mt-0.5 truncate w-32">{{ p.type }}</p>
            </div>
            <div class="text-right">
              <span class="text-[15px] font-black text-[#059669]">+¥{{ p.amount }}</span>
              <p class="text-[8px] text-gray-300 font-bold uppercase mt-1 italic">{{ p.date }}</p>
            </div>
          </div>
        </div>
      </el-card>

      <!-- Performance Log Table -->
      <el-card shadow="never" class="col-span-12 !rounded-3xl border-none shadow-sm overflow-hidden">
        <div class="p-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
          <h4 class="text-[10px] font-black text-gray-400 uppercase tracking-widest">最近业务战报</h4>
          <el-button type="primary" size="small" class="!px-6 font-black !text-[12px]" @click="dlgHistory = true">
            查看全部业绩历史
          </el-button>
        </div>
        <el-table :data="recentLog" style="width:100%" size="small" class="dense-perf-table">
          <el-table-column label="日期" width="120">
            <template #default="{ row }"><span class="text-[13px] font-bold text-gray-400">{{ row.date }}</span></template>
          </el-table-column>
          <el-table-column label="业务" width="100">
            <template #default="{ row }">
              <el-tag :type="row.type === '销售' ? 'primary' : 'success'" size="small" effect="dark" class="!rounded-md font-black px-2 !text-[9px]">{{ row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="关联主体 (商户/散户)" min-width="200">
            <template #default="{ row }"><span class="text-[15px] font-black text-gray-800">{{ row.target }}</span></template>
          </el-table-column>
          <el-table-column label="业务额" width="180" align="right">
            <template #default="{ row }"><span class="text-[18px] font-black text-gray-900">¥{{ row.amount }}</span></template>
          </el-table-column>
          <el-table-column label="产生绩效" width="180" align="right">
            <template #default="{ row }">
              <div class="flex flex-col items-end">
                <span class="text-[16px] font-black text-[#059669]">+¥{{ row.commission }}</span>
                <span class="text-[8px] text-gray-300 font-bold mt-1 uppercase tracking-widest">预估奖励</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- History Dialog -->
    <el-dialog v-model="dlgHistory" title="全部业绩历史明细" width="900px" class="pro-dialog" align-center>
      <div class="p-4">
        <div class="flex justify-between items-center mb-6 bg-gray-50 p-4 rounded-2xl">
          <el-radio-group v-model="historyFilter" size="default">
            <el-radio-button label="all">全部业绩</el-radio-button>
            <el-radio-button label="sales">仅销售</el-radio-button>
            <el-radio-button label="recycle">仅回收</el-radio-button>
          </el-radio-group>
          <el-date-picker v-model="dateRange" type="daterange" size="default" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" class="!w-72" />
        </div>
        <el-table :data="filteredHistory" style="width:100%" size="default" height="450" class="dense-perf-table">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="id" label="单据流水号" width="180">
            <template #default="{ row }"><span class="font-mono font-black text-blue-500">{{ row.id }}</span></template>
          </el-table-column>
          <el-table-column prop="type" label="业务类型" width="100">
            <template #default="{ row }">
              <el-tag :type="row.type === '销售' ? 'primary' : 'success'" size="small" effect="dark" class="!rounded-md">{{ row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="target" label="关联主体" min-width="200">
            <template #default="{ row }"><span class="font-black text-gray-800">{{ row.target }}</span></template>
          </el-table-column>
          <el-table-column prop="amount" label="业务额" width="150" align="right">
            <template #default="{ row }"><span class="font-black text-gray-900">¥{{ row.amount }}</span></template>
          </el-table-column>
          <el-table-column prop="commission" label="预估绩效" width="120" align="right">
            <template #default="{ row }"><span class="font-black text-[#059669]">¥{{ row.commission }}</span></template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { ElMessage } from 'element-plus'
import { exportCsv, toNum, fmtMoney, nowStamp } from '@/utils/export'

const month = ref(null)
const dlgHistory = ref(false)
const historyFilter = ref('all')
const dateRange = ref([])

const stats = [
  { label: '本月销售总额', value: '842,500', unit: 'CNY', trend: '12.5', trendUp: true },
  { label: '本月回收总额', value: '156,200', unit: 'CNY', trend: '4.2', trendUp: true },
  { label: '预估绩效奖励', value: '12,480', unit: 'CNY', trend: '8.1', trendUp: true },
  { label: '业绩达成率', value: '92', unit: '%', trend: '1.5', trendUp: false },
]

const pending = [
  { id: 'SO-99283', type: '整组销售提成奖励', amount: '1,420', date: '待发放' },
  { id: 'RC-11202', type: '大货回收阶梯奖金', amount: '850', date: '审核中' },
  { id: 'SO-99110', type: '模组分销业务抽成', amount: '220', date: '待发放' },
  { id: 'SO-99111', type: '售后服务补贴', amount: '150', date: '已入账' },
]

const recentLog = computed(() => {
  let data = historyData.value
  if (month.value) {
    const ym = `${month.value.getFullYear()}-${String(month.value.getMonth() + 1).padStart(2, '0')}`
    data = data.filter((r) => (r.date || '').startsWith(ym))
  }
  return data.slice(0, 5).map((r) => ({
    date: (r.date || '').slice(5),
    type: r.type,
    target: r.target,
    amount: r.amount,
    commission: r.commission,
  }))
})

const historyData = ref([])

// ── 30 天业绩趋势图数据 ──
function getTrendDays() {
  if (month.value && month.value instanceof Date) {
    const y = month.value.getFullYear()
    const m = month.value.getMonth()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, '0')
      const showLabel = (i + 1) % 5 === 1 || i === daysInMonth - 1
      return {
        date: `${y}-${String(m + 1).padStart(2, '0')}-${d}`,
        label: showLabel ? `${i + 1}日` : '',
      }
    })
  }
  const days = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const showLabel = i === 29 || i === 0 || (29 - i) % 5 === 0
    days.push({
      date: `${year}-${month}-${date}`,
      label: showLabel ? `${d.getMonth() + 1}/${d.getDate()}` : '',
    })
  }
  return days
}

const trendData = computed(() => {
  const days = getTrendDays()
  const data = days.map((d) => {
    const sales = historyData.value
      .filter((r) => r.date === d.date && r.type === '销售')
      .reduce((sum, r) => sum + parseFloat(toNum(r.amount)), 0)
    const recycle = historyData.value
      .filter((r) => r.date === d.date && r.type === '回收')
      .reduce((sum, r) => sum + parseFloat(toNum(r.amount)), 0)
    return { ...d, sales, recycle }
  })
  const max = Math.max(...data.map((d) => Math.max(d.sales, d.recycle)), 1)
  return data.map((d) => ({
    ...d,
    salesH: max ? (d.sales / max) * 100 : 0,
    recycleH: max ? (d.recycle / max) * 100 : 0,
  }))
})

// ── 历史明细筛选：类型 / 日期范围 / 月份 ──
const filteredHistory = computed(() => {
  let data = historyData.value
  if (historyFilter.value === 'sales') data = data.filter((r) => r.type === '销售')
  if (historyFilter.value === 'recycle') data = data.filter((r) => r.type === '回收')
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter((r) => (r.date || '') >= start && (r.date || '') <= end)
  } else if (month.value) {
    const ym = `${month.value.getFullYear()}-${String(month.value.getMonth() + 1).padStart(2, '0')}`
    data = data.filter((r) => (r.date || '').startsWith(ym))
  }
  return data
})

function exportReport() {
  const rows = filteredHistory.value.length ? filteredHistory.value : recentLog.value
  if (!rows.length) {
    ElMessage.warning('暂无绩效数据可导出')
    return
  }
  const headers = ['日期', '单据流水号', '业务类型', '关联主体', '业务额', '预估绩效']
  const csvRows = rows.map((r) => [
    r.date,
    r.id || '',
    r.type,
    r.target,
    toNum(r.amount),
    toNum(r.commission),
  ])
  exportCsv(`业绩报表_${nowStamp()}.csv`, headers, csvRows)
  ElMessage.success(`已导出 ${csvRows.length} 条业绩记录`)
}

// 统一把后端可能返回的 2026/8/18、2026-08-18 14:02 等格式转成 YYYY-MM-DD
function normalizeDate(v) {
  if (!v) return ''
  const m = String(v).match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (!m) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
}

onMounted(async () => {
  try {
    const [salesRes, recycleRes] = await Promise.all([
      rowsApi.list('sales_orders', { size: 200, sort: 'time', order: 'desc' }),
      rowsApi.list('recycle_orders', { size: 200, sort: 'time', order: 'desc' }),
    ])
    const sales = (salesRes.data?.list || []).map((r) => ({
      date: normalizeDate(r.time),
      id: r.id, type: '销售', target: r.customer || '',
      amount: r.total || '0', commission: r.gp ? String(r.gp) : '0',
    }))
    const recycle = (recycleRes.data?.list || []).map((r) => ({
      date: normalizeDate(r.time || r.date),
      id: r.id, type: '回收', target: r.supplier || r.user_name || '',
      amount: r.amount || r.valuation || '0', commission: r.commission || '0',
    }))
    historyData.value = [...sales, ...recycle].sort((a, b) => (a.date < b.date ? 1 : -1))
  } catch { /* 后端不可达时保留空列表 */ }
})
</script>

<style scoped>
.my-performance {
  margin: -1.5rem;
  padding: 1.5rem;
}
.dense-perf-table :deep(.el-table__header th) {
  background: transparent !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d1d5db !important;
}
.dense-perf-table :deep(.el-table__body td) {
  padding-top: 14px;
  padding-bottom: 14px;
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
</style>
