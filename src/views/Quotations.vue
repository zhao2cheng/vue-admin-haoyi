<template>
  <div class="quote-page">
    <!-- Header (dark gradient, matches prototype) -->
    <div class="bh">
      <div class="bh-left">
        <h1 class="bh-title">报价竞价台</h1>
        <div class="bh-stats">
          <div class="stat"><span class="l">待比对:</span> <span class="v">08</span></div>
          <div class="stat"><span class="l">在谈价值:</span> <span class="v text-emerald-300">¥8.15M</span></div>
        </div>
      </div>
      <div class="bh-actions">
        <el-button size="small" class="ghost" @click="previewExternal">预览外部页</el-button>
        <el-button size="small" class="ghost" :icon="Download" @click="exportQuotes">导出报价</el-button>
        <el-button type="primary" size="small" class="accent" @click="openCreate">
          <el-icon><Plus /></el-icon>
          <span>发起新计划</span>
        </el-button>
      </div>
    </div>

    <!-- Body -->
    <div class="body">
      <el-card shadow="never" class="main">
        <div class="main-head">
          <div class="segmented">
            <span :class="{ active: tab === 'active' }" @click="tab = 'active'">进行中</span>
            <span :class="{ active: tab === 'all' }" @click="tab = 'all'">待比对</span>
            <span :class="{ active: tab === 'accepted' }" @click="tab = 'accepted'">已成交</span>
          </div>
          <p class="live">实时数据: {{ clock }}</p>
        </div>

        <div class="list-toolbar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索项目名称、编号..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            clearable
          />
        </div>

        <el-table :data="pagedList" size="small" class="dense">
          <el-table-column label="项目 / 状态" min-width="260">
            <template #default="{ row }">
              <div class="proj">
                <el-tag :type="statusType(row.status)" size="small" effect="dark" class="proj-tag"> {{ statusLabel(row.status) }} </el-tag>
                <div class="proj-info">
                  <p class="proj-name">{{ row.target }}</p>
                  <p class="proj-meta">ID: #{{ row.id }} • {{ row.isBidding ? '多方竞价' : '专属报价' }}</p>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="参与热度" width="140" align="center">
            <template #default="{ row }">
              <div class="heat">
                <div class="heat-top">
                  <span class="heat-num">{{ row.submissionCount }} 人出价</span>
                  <span class="heat-clicks">142 点击</span>
                </div>
                <div class="heat-bar"><div class="heat-fill" :style="{ width: (row.submissionCount * 25) + '%' }"></div></div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="最高出价" width="120">
            <template #default="{ row }">
              <p class="top-bid">¥{{ row.total }}</p>
              <p v-if="row.status === 'active'" class="premium">竞争溢价: +12%</p>
            </template>
          </el-table-column>

          <el-table-column label="倒计时" width="160" align="center">
            <template #default="{ row }">
              <div class="cd">
                <span :class="row.status === 'accepted' ? 'archived' : 'countdown'">
                  {{ row.status === 'accepted' ? '已归档' : '02d 14h 20m' }}
                </span>
                <div class="track"><div class="dot"></div></div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="100" align="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" class="cmp-btn" @click="openCompare(row)">详情比对</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页：对筛选后的全集切片，tab/搜索/日期筛选仍作用于全部数据 -->
        <div v-if="filteredList.length" class="pagination-wrap">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :total="filteredList.length"
            :page-sizes="[10, 20, 50, 100, 200]"
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
          />
        </div>
      </el-card>

      <!-- Sidebar -->
      <div class="side">
        <el-card shadow="never" class="side-card">
          <p class="side-title">资产溢价雷达</p>
          <div class="radar-viz">
            <div class="radar-ring"></div>
          </div>
        </el-card>
        <el-card shadow="never" class="side-card">
          <p class="side-title">动态流水</p>
          <div class="stream">
            <div v-for="(it, i) in stream" :key="i" class="stream-item border-l-2 border-emerald-500 pl-3">
              <p class="st">{{ it.text }}</p>
              <p class="sa">{{ it.amount }}</p>
              <span class="stime">{{ it.time }}</span>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- New plan dialog: 构建资产处置竞价计划 (3 sections tiled, matches prototype exactly) -->
    <el-dialog
      v-model="dlg"
      title="构建资产处置竞价计划"
      width="1000px"
      class="pro-dialog custom-bidding-dialog"
      :close-on-click-modal="false"
    >
      <div class="dlg-body">
        <!-- Left column: 1. 基础计划定义 + 竞价策略 -->
        <div class="dlg-col-left">
          <section class="dlg-sec">
            <h4 class="sec-h">1. 基础计划定义</h4>
            <el-form :model="form" label-position="top">
              <el-form-item label="竞价项目名称">
                <el-input v-model="form.target" placeholder="例如：2024Q2 退役电池包处置" />
              </el-form-item>
              <el-form-item label="截止日期">
                <el-date-picker v-model="form.expireDate" type="datetime" class="!w-full" placeholder="选择竞价截止时间" />
              </el-form-item>
              <el-form-item label="备注说明">
                <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="补充竞价要求或资产状况描述..." />
              </el-form-item>
            </el-form>
          </section>
          <div class="strategy-tip">
            <p class="st-t">竞价策略</p>
            <p class="st-d">发布后，选定的供应商将收到系统推送，并可通过 H5 页面直接提交其报价方案。</p>
          </div>
        </div>

        <!-- Right column: 2. 构造处置产品明细 + 3. 指定受邀竞价人 -->
        <div class="dlg-col-right">
          <section class="dlg-sec">
            <div class="sec-head">
              <h4 class="sec-h">2. 构造处置产品明细</h4>
              <el-button type="primary" link icon="Plus" @click="addItem">添加产品项</el-button>
            </div>
            <el-table :data="form.items" size="small" class="item-construction-table">
              <el-table-column label="产品名称/型号" min-width="200">
                <template #default="{ row }">
                  <el-select
                    v-model="row.name"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择或输入产品"
                    size="small"
                    class="!w-full"
                  >
                    <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.name" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="处置数量" width="100">
                <template #default="{ row }">
                  <el-input-number v-model="row.qty" :min="1" controls-position="right" size="small" class="!w-full" />
                </template>
              </el-table-column>
              <el-table-column label="单位" width="80">
                <template #default="{ row }">
                  <el-input v-model="row.unit" size="small" placeholder="个/组" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="60" align="center">
                <template #default="{ $index }">
                  <el-button link type="danger" icon="Delete" @click="removeItem($index)" />
                </template>
              </el-table-column>
            </el-table>
            <div v-if="form.items.length === 0" class="empty">
              <p class="empty-text">尚未添加任何处置资产</p>
            </div>
          </section>

          <section class="dlg-sec">
            <h4 class="sec-h">3. 指定受邀竞价人</h4>
            <el-checkbox-group v-model="form.invitedBidders" class="bidders">
              <el-checkbox
                v-for="s in suppliers"
                :key="s.id"
                :label="s.id"
                border
                class="bidder-checkbox"
              >
                <div class="bidder-inner">
                  <span class="bn">{{ s.name }}</span>
                  <span class="bc">{{ s.contact }} • {{ s.level }}级</span>
                </div>
              </el-checkbox>
            </el-checkbox-group>
          </section>
        </div>
      </div>

      <template #footer>
        <div class="dlg-foot">
          <el-button class="!rounded-xl px-6" @click="dlg = false">取消</el-button>
          <el-button type="primary" :loading="publishing" class="submit-green !rounded-xl px-10" @click="submitPlan"> 立即发布竞价计划 </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Download, Search } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { exportCsv, toNum, nowStamp } from '@/utils/export'

const router = useRouter()

/* ---------- data (aligned with prototype) ---------- */
const suppliers = [
  { id: 1, name: '宁德时代 (CATL)', contact: '张晓明', level: 'A' },
  { id: 2, name: '顺风物流园', contact: '张总', level: 'B' },
  { id: 3, name: '深圳特来电', contact: '李工', level: 'B' },
  { id: 4, name: '中原拆解场', contact: '王经理', level: 'C' },
  { id: 5, name: '汽修连锁中心', contact: '赵经理', level: 'B' },
]

const products = [
  { id: 1, name: '120kW 直流双枪快速桩' },
  { id: 2, name: '7kW 交流家用桩' },
  { id: 3, name: '磷酸铁锂电池组 (48V/100Ah)' },
  { id: 4, name: '二级拆解交流充电枪 (5m)' },
  { id: 5, name: '75kWh 翻新动力电池组' },
]

const projects = ref([])

const stream = [
  { text: '顺风物流提交了新报价', amount: '¥268,000', time: '10:24 AM' },
]

/* ---------- segmented filter ---------- */
const tab = ref('active')
const searchQuery = ref('')
const dateRange = ref(null)

const filteredList = computed(() => {
  let data = projects.value
  if (tab.value === 'accepted') data = data.filter(p => p.status === 'accepted')
  if (tab.value === 'active') data = data.filter(p => p.status === 'active')
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter(p =>
      String(p.id).toLowerCase().includes(q) || (p.target || '').toLowerCase().includes(q)
    )
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter(p => {
      const d = (p.time || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

// 分页：对筛选后的全集切片，tab/搜索/日期筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([tab, searchQuery, dateRange, () => projects.value.length], () => {
  currentPage.value = 1
})

function statusType(s) {
  return { draft: 'info', active: 'primary', accepted: 'success', expired: 'danger' }[s] || 'info'
}
function statusLabel(s) {
  return { draft: '草稿', active: '进行中', accepted: '已成交', expired: '已结束' }[s] || s
}

/* ---------- export ---------- */
function exportQuotes() {
  if (!filteredList.value.length) {
    ElMessage.warning('当前列表没有可导出的报价项目')
    return
  }
  const headers = ['项目编号', '项目名称', '类型', '状态', '出价人数', '最高出价']
  const rows = filteredList.value.map((p) => [
    p.id,
    p.target,
    p.isBidding ? '多方竞价' : '专属报价',
    statusLabel(p.status),
    p.submissionCount,
    toNum(p.total),
  ])
  exportCsv(`报价竞价_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条报价项目`)
}

/* ---------- clock ---------- */
const clock = ref('')
let clockTimer = null
function tick() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  clock.value = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/* ---------- create dialog (tiled 3-section) ---------- */
const dlg = ref(false)
const publishing = ref(false)
const form = reactive({
  target: '',
  isBidding: true,
  expireDate: '',
  remark: '',
  items: [{ name: '75kWh 翻新动力电池组', qty: 12, unit: '组' }],
  invitedBidders: [],
})

function openCreate() {
  Object.assign(form, {
    target: '', isBidding: true, expireDate: '', remark: '',
    items: [{ name: '', qty: 1, unit: '个' }],
    invitedBidders: [],
  })
  dlg.value = true
}
function addItem() {
  form.items.push({ name: '', qty: 1, unit: '个' })
}
function removeItem(i) {
  form.items.splice(i, 1)
}
function submitPlan() {
  if (!form.target) return ElMessage.warning('请输入项目名称')
  if (form.items.length === 0) return ElMessage.warning('请至少添加一个处置产品项')
  publishing.value = true
  const qtId = 'QT' + Date.now().toString().slice(-6)
  rowsApi.create('quotations', {
    project_id: qtId,
    target: form.target,
    is_bidding: 1,
    owner: 'Admin',
    total: '0',
    status: 'active',
    submission_count: 0,
    project: form.target,
    bidders: 0,
    top_bid: 0,
  })
    .then(() => {
      projects.value.unshift({
        id: qtId,
        target: form.target, isBidding: true, owner: 'Admin',
        total: '0', status: 'active', submissionCount: 0,
      })
      ElMessage.success('竞价计划已成功发布并推送至受邀供应商')
    })
    .catch(() => ElMessage.error('发布失败'))
    .finally(() => { publishing.value = false; dlg.value = false })
}

/* ---------- compare / preview ---------- */
function openCompare(row) {
  router.push(`/quotations/${row.id}`)
}
function previewExternal() {
  ElMessage.info('正在打开外部用户录入页...')
  window.open('/#/public-quote', '_blank')
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
  // 从后端加载报价项目
  rowsApi.list('quotations', { size: 200 }).then(res => {
    projects.value = (res.data?.list || []).map(r => ({
      id: r.project_id || String(r.id), target: r.target || r.project || '',
      isBidding: !!r.is_bidding, owner: r.owner || '', total: r.total || String(r.top_bid || ''),
      status: r.status || 'active', submissionCount: r.submission_count || r.bidders || 0,
      time: r.created_at || '',
    }))
  }).catch(() => { /* 后端不可达时保留空列表 */ })
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style scoped>
.quote-page { padding: 0; }

/* Header */
.bh {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap;
  background: linear-gradient(120deg, #0f172a 0%, #1e3a5f 60%, #0e7490 100%);
  border-radius: 20px; padding: 22px 28px; color: #fff; margin-bottom: 18px;
  box-shadow: 0 12px 30px -12px rgba(15,23,42,.5);
}
.bh-title { font-size: 14px; font-weight: 900; letter-spacing: .15em; margin: 0 0 12px; }
.bh-stats { display: flex; gap: 28px; }
.stat .l { font-size: 11px; color: #94a3b8; margin-right: 6px; }
.stat .v { font-size: 22px; font-weight: 900; }
.text-emerald-300 { color: #6ee7b7 !important; }
.bh-actions { display: flex; align-items: center; gap: 10px; }
.ghost {
  background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.25); color: #e2e8f0;
}
.ghost:hover { background: rgba(255,255,255,.18); color: #fff; }
.accent { background: #10b981 !important; border-color: #10b981 !important; font-weight: 700; }
.accent:hover { background: #059669 !important; border-color: #059669 !important; }

/* Body */
.body { display: grid; grid-template-columns: 1fr 300px; gap: 18px; align-items: start; }
.main { border-radius: 16px; }
.main :deep(.el-card__body) { padding: 16px; }
.main-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 12px; margin-bottom: 4px;
}
.list-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding-bottom: 12px;
}
.list-toolbar .search-input { width: 220px; }
.segmented { display: inline-flex; gap: 4px; }
.segmented span {
  font-size: 12px; font-weight: 700; color: #64748b; cursor: pointer;
  padding: 4px 12px; border-radius: 999px; transition: .15s;
}
.segmented span.active { background: #ecfdf5; color: #059669; }
.live { font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: .1em; margin: 0; }

.proj { display: flex; align-items: center; gap: 10px; }
.proj-tag { transform: scale(.9); flex-shrink: 0; }
.proj-info { min-width: 0; }
.proj-name { font-size: 14px; font-weight: 800; color: #111827; margin: 0; }
.proj-meta { font-size: 11px; color: #9ca3af; margin: 2px 0 0; }

.heat-top { display: flex; flex-direction: column; align-items: center; }
.heat-num { font-size: 14px; font-weight: 900; color: #111827; }
.heat-clicks { font-size: 10px; color: #34d399; font-weight: 800; }
.heat-bar { margin-top: 6px; height: 4px; border-radius: 4px; background: #e2e8f0; overflow: hidden; }
.heat-fill { height: 100%; background: #10b981; border-radius: 4px; }

.top-bid { font-size: 16px; font-weight: 900; color: #059669; margin: 0; }
.premium { font-size: 12px; font-weight: 800; color: #f43f5e; margin: 2px 0 0; }
.cd { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.countdown { font-size: 13px; font-weight: 700; color: #2563eb; }
.archived { font-size: 12px; color: #94a3b8; }
.track { width: 18px; height: 4px; border-radius: 4px; background: rgba(37,99,235,.15); position: relative; }
.dot { position: absolute; top: -2px; left: 0; width: 8px; height: 8px; border-radius: 50%; background: #2563eb; animation: blink 1.2s infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
.cmp-btn { font-weight: 800; font-size: 10px; }

/* Sidebar */
.side { display: flex; flex-direction: column; gap: 18px; }
.side-card { border-radius: 16px; }
.side-card :deep(.el-card__body) { padding: 16px; }
.side-title {
  font-size: 10px; font-weight: 900; color: #94a3b8;
  text-transform: uppercase; letter-spacing: .15em; margin: 0 0 12px;
}
.radar-viz {
  height: 96px; background: #f9fafb; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.radar-ring {
  width: 64px; height: 64px; border-radius: 50%;
  border: 2px dashed #a7f3d0; animation: spin 6s linear infinite;
}
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
.stream { display: flex; flex-direction: column; gap: 12px; }
.stream-item { padding-left: 12px; }
.st { font-size: 12px; font-weight: 700; color: #1f2937; margin: 0; }
.sa { font-size: 12px; font-weight: 900; color: #059669; margin: 2px 0 0; }
.stime { font-size: 9px; color: #9ca3af; }

/* Dialog — exact replica of prototype's pro-dialog GLOBAL styles */
.pro-dialog :deep(.el-dialog__header) {
  margin-bottom: 0; border-bottom: 1px solid #f9fafb; padding-bottom: 1rem;
}
.pro-dialog :deep(.el-dialog__title) {
  font-size: 10px !important; font-weight: 900 !important;
  text-transform: uppercase !important; letter-spacing: .4em !important;
  color: #9ca3af !important;
}
.pro-dialog :deep(.el-dialog__body) { padding: 0 !important; padding-top: .5rem !important; }

.dlg-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1.5rem;
  align-items: stretch;
}
.dlg-col-left {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.dlg-col-left .strategy-tip { margin-top: auto; }
.dlg-col-right {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}
.dlg-sec { display: flex; flex-direction: column; }
.sec-h {
  font-size: 10px; font-weight: 900; color: #9ca3af;
  text-transform: uppercase; letter-spacing: .1em; margin: 0 0 16px;
}
.sec-head { display: flex; justify-content: space-between; align-items: center; }
.strategy-tip { background: #eff6ff; border: 1px solid #dbeafe; border-radius: 16px; padding: 14px 16px; }
.st-t { font-size: 10px; font-weight: 800; color: #2563eb; margin: 0 0 4px; }
.st-d { font-size: 11px; color: #1e40af; line-height: 1.6; margin: 0; }

.item-construction-table :deep(.el-table__header-wrapper),
.item-construction-table :deep(.el-table__header),
.item-construction-table :deep(tr) { background: transparent !important; }
.item-construction-table :deep(.el-table__inner-wrapper::before) { display: none; }

.empty { text-align: center; color: #9ca3af; padding: 24px 0; }
.empty-text { font-size: 12px; font-weight: 700; margin: 0; }

.bidders { display: flex; flex-wrap: wrap; gap: 12px; }
.bidder-checkbox {
  height: auto !important; margin: 0 !important;
  background: #ffffff !important; padding: .5rem 1rem !important;
  border-radius: 12px !important;
  transition: all .15s cubic-bezier(.4,0,.2,1);
}
.bidder-checkbox:hover { border-color: #a7f3d0 !important; }
.bidder-checkbox.is-checked { border-color: #10b981 !important; background: #ecfdf5 !important; }
.bidder-checkbox :deep(.el-checkbox__label) { padding-left: .75rem !important; }
.bidder-checkbox :deep(.el-checkbox__inner) { border-color: #a7f3d0 !important; }
.bidder-checkbox.is-checked :deep(.el-checkbox__inner) { border-color: #10b981 !important; background: #10b981 !important; }
.bidder-inner { display: flex; flex-direction: column; line-height: 1.3; }
.bn { font-size: 13px; font-weight: 700; color: #111827; }
.bc { font-size: 11px; color: #9ca3af; }

.dlg-foot { display: flex; justify-content: flex-end; gap: 10px; }
.submit-green {
  background: #10b981 !important; border-color: #10b981 !important; font-weight: 700;
  box-shadow: 0 10px 20px -6px rgba(16,185,129,.45) !important;
}
.submit-green:hover { background: #059669 !important; border-color: #059669 !important; }

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
