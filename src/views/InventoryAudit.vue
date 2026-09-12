<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>库存盘点</h3>
          <p>通过实地核实实物库存，发现并修正系统结存偏差</p>
        </div>
        <div class="header-actions">
          <el-button :icon="Download" @click="exportPlans">导出盘点</el-button>
          <el-button type="primary" @click="dlgCreate = true">+ 新建盘点计划</el-button>
        </div>
      </div>
    </template>

    <!-- Stats -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">盘点计划总数</div>
        <div class="value">{{ auditPlans.length }}</div>
        <div class="trend">共 {{ auditPlans.length }} 条计划</div>
      </div>
      <div class="stat-card primary">
        <div class="label">进行中盘点</div>
        <div class="value">{{ activeCount }}</div>
        <div class="trend">待完成盘点</div>
      </div>
      <div class="stat-card warning">
        <div class="label">已完成盘点</div>
        <div class="value">{{ doneCount }}</div>
        <div class="trend">本年度累计</div>
      </div>
      <div class="stat-card success">
        <div class="label">在库 SKU 总数</div>
        <div class="value">{{ stock.totalSku }}</div>
        <div class="trend">可供盘点资产</div>
      </div>
    </div>

    <!-- Filter -->
    <div class="table-wrap">
      <div class="table-header">
        <h3>盘点计划</h3>
        <div class="filter-bar">
          <el-input
            v-model="auditSearch"
            placeholder="搜索盘点单号..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-select v-model="warehouseFilter" placeholder="全部仓库" clearable class="warehouse-select">
            <el-option v-for="w in warehouses" :key="w" :label="w" :value="w" />
          </el-select>
          <el-date-picker
            v-model="auditDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            size="small"
            clearable
          />
        </div>
        <el-radio-group v-model="planFilter" size="small">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="active">进行中</el-radio-button>
          <el-radio-button label="done">已完成</el-radio-button>
        </el-radio-group>
      </div>

      <el-table :data="pagedFilteredPlans" stripe style="width: 100%">
        <el-table-column label="盘点单号" prop="planNo" width="190">
          <template #default="{ row }">
            <span style="font-weight: 700; color: #111827">{{ row.planNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目标仓库" prop="warehouse" min-width="200">
          <template #default="{ row }">
            <div>
              <p style="font-weight: 600; color: #374151">{{ row.warehouse }}</p>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 2px">{{ row.range }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="盘点进度" width="220">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 12px">
              <el-progress
                :percentage="row.progress"
                :stroke-width="8"
                :color="row.progress === 100 ? '#67c23a' : '#409eff'"
                :show-text="false"
                style="flex: 1"
              />
              <span
                style="font-weight: 900; font-size: 12px; min-width: 40px; text-align: right"
                :style="{ color: row.progress === 100 ? '#67c23a' : '#409eff' }"
              >
                {{ row.progress }}%
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="项已核实" width="110" align="center">
          <template #default="{ row }">
            <span style="font-weight: 700; color: #374151">{{ verifiedCount(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="盈亏摘要" width="170" align="center">
          <template #default="{ row }">
            <span v-if="row.status === '已完成'" style="font-weight: 700; color: #67c23a">
              盘盈 {{ surplusCount }} · 盘亏 {{ shortageCount }}
            </span>
            <span v-else style="font-weight: 700; color: #9ca3af">未结</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.status === '已完成' ? 'success' : 'warning'"
              size="small"
              effect="light"
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发起时间" width="150" align="center">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #6b7280">{{ row.time || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status !== '已完成'"
              type="primary"
              size="small"
              @click="startTask(row)"
            >
              启动任务
            </el-button>
            <el-button link type="primary" size="small" @click="openEntry(row)">
              录入实物
            </el-button>
            <el-button link type="primary" size="small" @click="openReport(row)">
              查阅报告
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页：对筛选后的全集切片，tab/搜索/仓库/日期筛选仍作用于全部数据 -->
      <div v-if="filteredPlans.length" class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredPlans.length"
          :page-sizes="[10, 20, 50, 100, 200]"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
        />
      </div>
    </div>

    <!-- Dialog: New Audit Plan -->
    <el-dialog v-model="dlgCreate" title="新建盘点计划" width="540px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px">
        <el-form-item label="盘点仓库">
          <el-select v-model="form.warehouse" style="width: 100%" placeholder="请选择仓库">
            <el-option
              v-for="w in warehouses"
              :key="w.id"
              :label="w.name"
              :value="w.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="盘点范围">
          <el-select v-model="form.range" style="width: 100%" placeholder="请选择盘点范围">
            <el-option label="全库盘点" value="全库盘点" />
            <el-option label="局部抽盘" value="局部抽盘" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划备注">
          <el-input v-model="form.note" type="textarea" :rows="3" placeholder="填写盘点目的，例如: 2024 Q2 季度大盘" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex-between" style="justify-content: flex-end">
          <el-button @click="dlgCreate = false">取消</el-button>
          <el-button type="primary" @click="submitCreate">确认发起计划</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Drawer: Physical stock entry -->
    <el-drawer v-model="dlgEntry" title="库存实物核实录入" size="700px" :close-on-click-modal="false" class="pro-drawer">
      <div v-if="currentPlan">
        <!-- 顶部单据横幅：左当前执行单据 / 中盘点仓库 / 右备注 -->
        <div class="check-banner">
          <div class="check-banner-col">
            <p class="check-banner-cap">当前执行单据</p>
            <p class="check-banner-val">{{ currentPlan.planNo || '--' }}</p>
          </div>
          <div class="check-banner-col">
            <p class="check-banner-cap">盘点仓库</p>
            <p class="check-banner-val">{{ currentPlan.warehouse || '--' }}</p>
          </div>
          <div class="check-banner-col" v-if="currentPlan.note">
            <p class="check-banner-cap">计划备注</p>
            <p class="check-banner-val-note">{{ currentPlan.note }}</p>
          </div>
        </div>

        <!-- 资产 / 来源 / 账面 / 实盘 / 盘盈亏 五列表格 -->
        <el-table :data="entryItems" class="check-table" size="small">
          <el-table-column label="资产/批次信息" min-width="220">
            <template #default="{ row }">
              <div class="check-asset">
                <p class="check-asset-name">{{ row.product }}</p>
                <p class="check-asset-batch">BATCH: {{ row.batchNo || '--' }}</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="物料来源" width="170" align="center">
            <template #default="{ row }">
              <el-link
                v-if="sourceSummary(row.stockItemId).type !== 'direct'"
                type="primary"
                :underline="false"
                style="font-weight: 700"
                @click="goSource(row.stockItemId)"
              >{{ sourceSummary(row.stockItemId).text }}</el-link>
              <span v-else class="src-direct">直采</span>
            </template>
          </el-table-column>
          <el-table-column label="系统账面" prop="book" width="100" align="center" />
          <el-table-column label="实物盘点数" width="150" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.actual" :min="0" size="small" controls-position="right" class="!w-[104px]" />
            </template>
          </el-table-column>
          <el-table-column label="盘盈亏" width="100" align="center">
            <template #default="{ row }">
              <span
                class="diff-pill"
                :class="diffOf(row) > 0 ? 'up' : diffOf(row) < 0 ? 'down' : 'flat'"
              >{{ diffOf(row) > 0 ? '+' + diffOf(row) : diffOf(row) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <div class="flex-between">
          <el-button @click="dlgEntry = false">保存进度并退出</el-button>
          <el-button type="primary" @click="postEntry">提交结果并过账</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Dialog: Audit report -->
    <el-dialog v-model="dlgReport" title="库存盘点分析报告" width="700px" :close-on-click-modal="false" class="pro-dialog">
      <div v-if="currentPlan">
        <!-- 顶部 3 张彩色统计卡片：盘盈/盘亏/准确率 -->
        <div class="report-stats">
          <div class="report-stat up">
            <p class="report-stat-cap">盘盈项数</p>
            <p class="report-stat-val">+{{ surplusCount }}</p>
          </div>
          <div class="report-stat down">
            <p class="report-stat-cap">盘亏项数</p>
            <p class="report-stat-val">-{{ shortageCount }}</p>
          </div>
          <div class="report-stat primary">
            <p class="report-stat-cap">库存准确率</p>
            <p class="report-stat-val">{{ accuracy }}%</p>
          </div>
        </div>

        <div class="report-section-title">异常差异明细</div>
        <el-table :data="diffItems" stripe size="small" style="width: 100%" class="report-table">
          <el-table-column label="差异产品" prop="product" min-width="180" />
          <el-table-column label="物料来源" width="160" align="center">
            <template #default="{ row }">
              <el-link
                v-if="sourceSummary(row.stockItemId).type !== 'direct'"
                type="primary"
                :underline="false"
                style="font-weight: 700"
                @click="goSource(row.stockItemId)"
              >{{ sourceSummary(row.stockItemId).text }}</el-link>
              <span v-else class="src-direct">直采</span>
            </template>
          </el-table-column>
          <el-table-column label="账面 → 实盘" width="180" align="center">
            <template #default="{ row }">
              <div class="diff-flow">
                <span class="diff-flow-book">{{ row.book }}</span>
                <span class="diff-flow-arrow">→</span>
                <span class="diff-flow-actual">{{ row.actual }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="差异详情" width="130" align="center">
            <template #default="{ row }">
              <span class="diff-pill" :class="diffOf(row) > 0 ? 'up' : diffOf(row) < 0 ? 'down' : 'flat'">
                {{ diffOf(row) > 0 ? '+' + diffOf(row) : diffOf(row) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <div class="flex-between" style="justify-content: flex-end">
          <el-button @click="dlgReport = false">关闭报告</el-button>
          <el-button type="primary" :icon="Download" @click="exportReport">导出 PDF</el-button>
        </div>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { Box, Download, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { rowsApi, txApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'

// Backend entity refs
const auditPlans = ref([])
const warehouses = ref([])
const stockItems = ref([])        // 全量库存物料
const stockBatches = ref([])       // 全量库存批次（用于来源溯源）
const entryItems = ref([])        // 录入对话框实物明细（按当前计划仓库过滤）
const reportItems = ref([])       // 报告对话框差异明细（从 audit_results 反查落库）
const auditResults = ref([])      // 全量盘点结果明细（verifiedCount 真实统计）

// 物料来源索引：{ [stock_item_id]: { poNos: Set, recycleNos: Set, hasSource: bool } }
const sourceIndex = computed(() => {
  const map = {}
  for (const b of stockBatches.value) {
    const key = b.stock_item_id
    if (!map[key]) map[key] = { poNos: new Set(), recycleNos: new Set(), hasSource: false }
    if (b.purchase_order_id) { map[key].poNos.add(b.purchase_order_id); map[key].hasSource = true }
    if (b.recycle_order_id) { map[key].recycleNos.add(b.recycle_order_id); map[key].hasSource = true }
  }
  return map
})

// 盘点结果按 plan_id 分组（verifiedCount 真实统计）
const resultsByPlan = computed(() => {
  const m = {}
  for (const r of auditResults.value) {
    const k = r.plan_id
    if (!m[k]) m[k] = []
    m[k].push(r)
  }
  return m
})

// 物料来源摘要
function sourceSummary(stockItemId) {
  const src = sourceIndex.value[stockItemId]
  if (!src || !src.hasSource) return { text: '直采', type: 'direct', poNo: null, recycleNo: null }
  const rcArr = [...src.recycleNos]
  const poArr = [...src.poNos]
  // 优先显示回收来源（电池回收为主营）
  if (rcArr.length) return { text: `回收单 ${rcArr[0]}`, type: 'recycle', poNo: null, recycleNo: rcArr[0] }
  if (poArr.length) return { text: `采购单 ${poArr[0]}`, type: 'purchase', poNo: poArr[0], recycleNo: null }
  return { text: '直采', type: 'direct', poNo: null, recycleNo: null }
}

// 跳转物料来源详情
function goSource(stockItemId) {
  const s = sourceSummary(stockItemId)
  if (s.type === 'recycle' && s.recycleNo) {
    window.location.hash = '#/my-recycle-orders?highlight=' + encodeURIComponent(s.recycleNo)
  } else if (s.type === 'purchase' && s.poNo) {
    window.location.hash = '#/inventory-purchase?highlight=' + encodeURIComponent(s.poNo)
  }
}

async function loadData() {
  try {
    const [a, w, s, b, ar] = await Promise.all([
      rowsApi.list('audit_plans', { size: 200 }),
      rowsApi.list('warehouses', { size: 200 }),
      rowsApi.list('stock_items', { size: 500 }),
      rowsApi.list('stock_batches', { size: 500 }),
      rowsApi.list('audit_results', { size: 500 }),
    ])
    auditPlans.value = (a?.data?.list || []).map(p => ({
      ...p,
      planNo: p.plan_no || p.id,
      range: p.range || p.range_type || '全库盘点',
      note: p.note || '',
      time: p.created_at || p.time || '',
    }))
    // 下拉合并「正式仓库字典 + 实际库存中出现的仓库」，保证从库存查询跳转可预填
    const dictWhs = (w?.data?.list || []).map(x => x.name)
    const itemWhs = (s?.data?.list || []).map(x => x.warehouse).filter(Boolean)
    warehouses.value = [...new Set([...dictWhs, ...itemWhs])]
    stockItems.value = s?.data?.list || []
    stockBatches.value = b?.data?.list || []
    auditResults.value = ar?.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(async () => {
  await loadData()
  applyIncomingQuery()
})

// State
const planFilter = ref('all')
const auditSearch = ref('')
const warehouseFilter = ref('')
const auditDateRange = ref(null)
const dlgCreate = ref(false)
const dlgEntry = ref(false)
const dlgReport = ref(false)
const currentPlan = ref(null)

const form = reactive({
  warehouse: '',
  range: '',
  note: '',
})

// Computed from backend data
const activeCount = computed(() => auditPlans.value.filter(p => p.status === '进行中').length)
const doneCount = computed(() => auditPlans.value.filter(p => p.status === '已完成').length)
// K3 KPI：在库 SKU 总数 = stock_items 数组长度（不再用未赋值的 stockItems ref）
const stock = computed(() => ({ totalSku: stockItems.value.length }))

const filteredPlans = computed(() => {
  let data = auditPlans.value
  if (planFilter.value === 'active') data = data.filter(p => p.status === '进行中')
  if (planFilter.value === 'done') data = data.filter(p => p.status === '已完成')
  if (auditSearch.value) {
    const q = auditSearch.value.toLowerCase()
    data = data.filter(p => String(p.planNo).toLowerCase().includes(q))
  }
  if (warehouseFilter.value) {
    data = data.filter(p => p.warehouse === warehouseFilter.value)
  }
  if (auditDateRange.value && auditDateRange.value.length === 2) {
    const [start, end] = auditDateRange.value
    data = data.filter(p => {
      const d = (p.time || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

// 分页：对筛选后的全集切片，tab/搜索/仓库/日期筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedFilteredPlans = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredPlans.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([planFilter, auditSearch, warehouseFilter, auditDateRange, () => auditPlans.value.length], () => {
  currentPage.value = 1
})

// 实盘差异（基于用户输入的实物盘点数，响应式；用于录入弹窗和报告）
function diffOf(item) {
  return (item.actual || 0) - (item.book || 0)
}
// 报告对话框：基于从 audit_results 反查的 reportItems
const surplusCount = computed(() => reportItems.value.filter(r => diffOf(r) > 0).length)
const shortageCount = computed(() => reportItems.value.filter(r => diffOf(r) < 0).length)
const accuracy = computed(() => {
  const total = reportItems.value.length || 1
  const ok = reportItems.value.filter(r => diffOf(r) === 0).length
  return ((ok / total) * 100).toFixed(1)
})
const diffItems = computed(() => reportItems.value.filter(r => diffOf(r) !== 0))

// 项已核实（依据进度推导）
function verifiedCount(row) {
  // 已核实数 = audit_results 表中该 plan 的明细行数
  const verified = (resultsByPlan.value[row.id] || []).length
  // 应盘物料数 = 该仓库的 stock_items 数（仓库字段不一致时回退全量）
  let total = stockItems.value.filter(it => it.warehouse === row.warehouse).length
  if (!total) total = stockItems.value.length
  return verified + ' / ' + total
}

// Actions
function startTask(row) {
  currentPlan.value = row
  txApi.auditStart({ planId: row.id })
    .then(() => {
      row.status = '进行中'
      row.progress = 0
      ElMessage.success(`盘点任务已启动，请开始核实实物（${row.planNo}）`)
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '启动失败'))
}

// 录入实物：按当前计划仓库过滤 stock_items
function openEntry(row) {
  currentPlan.value = row
  // 按仓库过滤 stock_items，构造录入明细
  const wh = row.warehouse
  const filtered = stockItems.value.filter(it => !wh || it.warehouse === wh || it.location === wh)
  // 若该仓库无物料（旧数据可能 warehouse 字段名不一致），回退全量但加标注
  const src = filtered.length ? filtered : stockItems.value
  entryItems.value = src.map(item => ({
    stockItemId: item.id,
    product: item.name,
    batchNo: item.sku || '--',
    book: item.qty,
    actual: item.qty,
    warehouse: item.warehouse || item.location || wh || '--',
  }))
  dlgEntry.value = true
}

// 报告：从 audit_results 反查真实落库的差异明细
async function openReport(row) {
  currentPlan.value = row
  dlgReport.value = true
  try {
    const res = await rowsApi.list('audit_results', {
      filter: JSON.stringify({ plan_id: row.id }),
      size: 500,
    })
    const list = res?.data?.list || []
    // JOIN stock_items 出产品名 + SKU
    reportItems.value = list.map(r => {
      const item = stockItems.value.find(s => String(s.id) === String(r.stock_item_id)) || {}
      return {
        stockItemId: r.stock_item_id,
        product: item.name || '已删除物料',
        batchNo: item.sku || '--',
        book: r.book_qty,
        actual: r.real_qty,
        diff: r.diff,
      }
    })
    if (!reportItems.value.length) {
      ElMessage.info('该盘点计划暂无落库差异明细')
    }
  } catch (e) {
    ElMessage.error('读取盘点明细失败')
    reportItems.value = []
  }
}

function postEntry() {
  if (!currentPlan.value) return
  // D3：差异以实盘为准入账到库存（audit-post 事务内更新 stock_items.qty）
  txApi.auditPost({
    planId: currentPlan.value.id,
    results: entryItems.value.map(r => ({ stockItemId: r.stockItemId, bookQty: r.book, realQty: r.actual })),
  })
    .then(() => {
      currentPlan.value.status = '已完成'
      currentPlan.value.progress = 100
      ElMessage.success('盘点已完成，库存差异已自动过账')
      loadData()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
  dlgEntry.value = false
}

function exportReport() {
  if (!reportItems.value.length) {
    ElMessage.warning('暂无盘点明细可导出')
    return
  }
  const headers = ['产品/批次', '物料来源', '系统账面', '实物盘点数', '盘盈亏', '差异状态']
  const rows = reportItems.value.map((r) => {
    const d = diffOf(r)
    const src = sourceSummary(r.stockItemId)
    return [
      `${r.product}${r.batchNo !== '--' ? ' / ' + r.batchNo : ''}`,
      src.text,
      r.book ?? 0,
      r.actual ?? 0,
      d,
      d === 0 ? '无差异' : (d > 0 ? '盘盈' : '盘亏'),
    ]
  })
  exportCsv(`盘点分析报告_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`盘点分析报告已导出（共 ${rows.length} 项，盘盈 ${surplusCount.value} 项 / 盘亏 ${shortageCount.value} 项，准确率 ${accuracy.value}%）`)
  dlgReport.value = false
}

function exportPlans() {
  if (!filteredPlans.value.length) {
    ElMessage.warning('当前列表没有可导出的盘点计划')
    return
  }
  const headers = ['盘点单号', '目标仓库', '盘点范围', '进度', '项已核实', '盈亏摘要', '状态', '发起时间']
  const rows = filteredPlans.value.map((p) => [
    p.planNo,
    p.warehouse,
    p.range || '',
    `${p.progress}%`,
    verifiedCount(p),
    p.status === '已完成' ? `盘盈 ${surplusCount.value} · 盘亏 ${shortageCount.value}` : '未结',
    p.status,
    p.time || '--',
  ])
  exportCsv(`库存盘点计划_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条盘点计划`)
}

// ==================== 从库存查询跳转（行发起 / 按筛选发起）====================
function parseHashParams() {
  const idx = window.location.hash.indexOf('?')
  if (idx < 0) return {}
  const sp = new URLSearchParams(window.location.hash.slice(idx + 1))
  const out = {}
  for (const [k, v] of sp.entries()) out[k] = v
  return out
}

// 库存查询页「发起盘点」跳转后：自动打开新建弹窗并预填仓库/范围/备注
function applyIncomingQuery() {
  const q = parseHashParams()
  if (q.from !== 'stockquery') return
  const notes = []
  if (q.wh) {
    if (warehouses.value.includes(q.wh)) {
      form.warehouse = q.wh
    } else {
      notes.push('原仓库「' + q.wh + '」不在可选列表，请手动选择盘点仓库')
    }
  }
  if (q.focus) {
    form.range = '局部抽盘'
    notes.push('重点盘点物料: ' + q.focus)
  } else if (q.keyword) {
    form.range = '局部抽盘'
    notes.push('按库存查询条件「' + q.keyword + '」发起，命中 ' + (q.count || '--') + ' 项')
  }
  form.note = notes.join('；')
  dlgCreate.value = true
  ElMessage.success('已从库存查询带入盘点信息，请确认仓库与范围后发起计划')
}

function submitCreate() {
  if (!form.warehouse) {
    ElMessage.warning('请选择盘点仓库')
    return
  }
  const planNo = 'INV-' + new Date().getFullYear() + 'Q' + Math.ceil((new Date().getMonth() + 1) / 3) + '-' + String(auditPlans.value.length + 1).padStart(3, '0')
  rowsApi.create('audit_plans', {
    plan_no: planNo,
    warehouse: form.warehouse,
    range: form.range || '全库盘点',
    note: form.note || '',
    progress: 0,
    status: '进行中',
  })
    .then(() => {
      ElMessage.success('盘点计划已发起！')
      dlgCreate.value = false
      form.warehouse = ''
      form.range = ''
      form.note = ''
      loadData()
    })
    .catch(() => ElMessage.error('创建失败'))
}
</script>

<style scoped>
.header-content { display: flex; align-items: center; justify-content: space-between; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.title-section h3 { font-size: 18px; font-weight: 900; color: #111827; margin: 0 0 4px; }
.title-section p { font-size: 12px; color: #9ca3af; margin: 0; }

.table-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.table-header h3 { font-size: 16px; font-weight: 900; color: #111827; margin: 0; }
.filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-bar .search-input { width: 200px; }
.filter-bar .warehouse-select { width: 140px; }

.entry-row { border: 1px solid #f1f5f9; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.entry-grid { display: flex; align-items: center; gap: 14px; }
.entry-cell { flex: 1; text-align: center; }
.entry-cap { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
.entry-num { font-weight: 800; font-size: 15px; }

/* ==================== Check banner + table (库存实物核实录入 drawer) ==================== */
.check-banner {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #dbeafe;
  border-radius: 18px;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 12px;
  margin-bottom: 16px;
}
.check-banner-col { display: flex; flex-direction: column; gap: 4px; }
.check-banner-cap {
  font-size: 10px;
  font-weight: 900;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: .2em;
  margin: 0;
  text-align: right;
}
.check-banner-val {
  font-size: 20px;
  font-weight: 900;
  color: #1f2937;
  margin: 0;
  text-align: right;
  white-space: nowrap;
}
.check-banner-val-note {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
  margin: 0;
  text-align: right;
  line-height: 1.4;
  word-break: break-all;
  align-self: center;
}
.check-banner-col:first-child .check-banner-cap,
.check-banner-col:first-child .check-banner-val { text-align: left; }

.check-table { width: 100%; border: 1px solid #f1f5f9; border-radius: 14px; overflow: hidden; }
.check-table :deep(th.el-table__cell) {
  background: #f9fafb;
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: .15em;
}
.check-table :deep(td.el-table__cell) { padding: 14px 8px; border-bottom: 1px solid #f3f4f6; }

.check-asset { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.check-asset-name { font-size: 14px; font-weight: 800; color: #111827; margin: 0; }
.check-asset-batch { font-size: 11px; font-weight: 700; color: #94a3b8; margin: 0; letter-spacing: .05em; }

.diff-pill {
  display: inline-block;
  min-width: 32px;
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 900;
  text-align: center;
}
.diff-pill.up   { background: #e6f7ec; color: #15803d; }
.diff-pill.down { background: #fee2e2; color: #b91c1c; }
.diff-pill.flat { background: #f3f4f6; color: #9ca3af; }

/* 直采标签：物料来源未关联采购/回收单时的灰标 */
.src-direct {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  background: #f3f4f6;
  color: #9ca3af;
}

.report-summary {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  background: #f9fafb; border-radius: 16px; padding: 18px;
}
.report-summary .label { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; }
.report-summary .value { font-size: 24px; font-weight: 900; color: #111827; margin-top: 4px; }

/* ==================== 库存盘点分析报告 - 顶部 3 张彩色统计卡 ==================== */
.report-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  margin-bottom: 20px;
}
.report-stat {
  border-radius: 18px;
  padding: 18px 20px;
  border: 1px solid transparent;
  display: flex; flex-direction: column; gap: 4px;
}
.report-stat-cap {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .15em;
  margin: 0;
}
.report-stat-val {
  font-size: 30px;
  font-weight: 900;
  margin: 0;
  line-height: 1.1;
}
.report-stat.up      { background: #ecfdf5; border-color: #d1fae5; color: #059669; }
.report-stat.up   .report-stat-val { color: #15803d; }
.report-stat.down    { background: #fef2f2; border-color: #fee2e2; color: #b91c1c; }
.report-stat.down .report-stat-val { color: #b91c1c; }
.report-stat.primary { background: #eff6ff; border-color: #dbeafe; color: #1d4ed8; }
.report-stat.primary .report-stat-val { color: #2563eb; }

.report-section-title {
  font-size: 11px;
  font-weight: 800;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: .2em;
  margin: 8px 0 12px;
}
.report-table :deep(th.el-table__cell) {
  background: #f9fafb;
  font-size: 11px;
  font-weight: 800;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: .15em;
}
.report-table :deep(td.el-table__cell) { padding: 14px 10px; }

/* ==================== 账面→实盘过渡 ==================== */
.diff-flow {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 800; font-size: 13px;
}
.diff-flow-book  { color: #94a3b8; }
.diff-flow-arrow { color: #cbd5e1; }
.diff-flow-actual{ color: #111827; }

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
