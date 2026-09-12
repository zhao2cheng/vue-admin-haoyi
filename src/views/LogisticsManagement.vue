<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>物流运输管理</h3>
          <p>登记取货地址与货物件数，跟踪运输进度，到货后一键入库（自动累加库存并生成批次）</p>
        </div>
        <div class="header-actions">
          <el-button :icon="Download" @click="exportList">导出清单</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreate">登记物流单</el-button>
        </div>
      </div>
    </template>

    <!-- 统计条 -->
    <div class="stat-row">
      <div class="stat-cell">
        <div class="stat-num">{{ stats.transit }}</div>
        <div class="stat-lbl">运输中（单）</div>
      </div>
      <div class="stat-cell">
        <div class="stat-num">{{ stats.arrived }}</div>
        <div class="stat-lbl">已到达待入库（单）</div>
      </div>
      <div class="stat-cell">
        <div class="stat-num">{{ stats.transitQty }}</div>
        <div class="stat-lbl">在途件数（件）</div>
      </div>
      <div class="stat-cell">
        <div class="stat-num">{{ stats.inboundQty }}</div>
        <div class="stat-lbl">累计入库件数</div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="table-header">
      <h3>物流单列表</h3>
      <div class="flex-row">
        <el-input
          v-model="searchQuery"
          placeholder="搜索单号 / 货物 / 取货地址..."
          :prefix-icon="Search"
          style="width: 240px"
          clearable
        />
        <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 140px">
          <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
        </el-select>
      </div>
    </div>

    <el-table :data="pagedList" stripe style="width: 100%">
      <el-table-column label="物流单" min-width="200">
        <template #default="{ row }">
          <div style="font-weight: 700; font-size: 13px; color: #111827">{{ row.goods }}</div>
          <div style="font-size: 11px; color: #9ca3af; font-family: monospace; margin-top: 2px">{{ row.lg_no }}</div>
        </template>
      </el-table-column>
      <el-table-column label="件数" width="90" align="center">
        <template #default="{ row }">
          <span style="font-weight: 800; font-size: 14px; color: #374151">{{ row.qty }}</span>
          <span style="font-size: 11px; color: #9ca3af"> 件</span>
        </template>
      </el-table-column>
      <el-table-column label="取货地址" min-width="200">
        <template #default="{ row }">
          <div style="display: flex; align-items: center; gap: 4px">
            <el-icon :size="12" style="color: #d1d5db; flex-shrink: 0"><Location /></el-icon>
            <span style="font-size: 13px; color: #6b7280">{{ row.pickup_address }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="预计到达" width="150">
        <template #default="{ row }">
          <div style="font-weight: 700; font-size: 13px; color: #374151">{{ row.expect_date || '—' }}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 1px">约 {{ row.eta_days || '?' }} 天</div>
        </template>
      </el-table-column>
      <el-table-column label="入库仓库" width="140">
        <template #default="{ row }">
          <span style="font-size: 13px; color: #6b7280">{{ row.dest_warehouse || '待指定' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="承运方" width="140">
        <template #default="{ row }">
          <div style="font-weight: 600; font-size: 13px; color: #374151">{{ row.carrier || '—' }}</div>
          <div v-if="row.carrier_phone" style="font-size: 11px; color: #9ca3af; font-family: monospace">{{ row.carrier_phone }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :color="statusColor(row.status)" style="color: #fff; border-radius: 999px; font-weight: 700" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" align="center" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" style="font-weight: 700" @click="openDetail(row)">详情</el-button>
          <el-button v-if="row.status === '待取货'" text type="primary" size="small" style="font-weight: 700" @click="advanceStatus(row, '运输中')">
            确认取货
          </el-button>
          <el-button v-if="row.status === '运输中'" text type="primary" size="small" style="font-weight: 700" @click="advanceStatus(row, '已到达')">
            确认到达
          </el-button>
          <el-button v-if="row.status === '已到达'" text type="success" size="small" style="font-weight: 700" @click="openInbound(row)">
            入库
          </el-button>
          <el-button v-if="row.status === '待取货' || row.status === '运输中'" text type="warning" size="small" style="font-weight: 700" @click="advanceStatus(row, '已取消')">
            取消
          </el-button>
          <el-button v-if="row.status === '待取货'" text size="small" style="color: #9ca3af; font-weight: 700" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="row.status === '已取消'" text size="small" style="color: #9ca3af; font-weight: 700" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页：对筛选后的全集切片，搜索/状态筛选仍作用于全部数据 -->
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

    <!-- 新增 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑物流单' : '登记物流单'"
      width="620px"
      top="8vh"
      destroy-on-close
    >
      <div class="form-section">取货与货物信息</div>
      <el-form :model="form" label-width="96px">
        <el-form-item label="取货地址" required>
          <el-input v-model="form.pickupAddress" type="textarea" :rows="2" placeholder="例如：长沙市长沙县顺风物流园 B 区 12 号库" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="货物名称" required>
              <el-input v-model="form.goods" placeholder="例如：75kWh 动力电池组" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="件数" required>
              <el-input-number v-model="form.qty" :min="1" :step="1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="预计天数" required>
              <el-input-number v-model="form.etaDays" :min="1" :max="60" :step="1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库仓库">
              <el-select v-model="form.destWarehouse" style="width: 100%" clearable placeholder="入库时也可再指定">
                <el-option v-for="w in warehouseOptions" :key="w" :label="w" :value="w" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="承运方">
              <el-input v-model="form.carrier" placeholder="物流公司 / 司机" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="form.carrierPhone" placeholder="手机号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="货物特殊要求、约定取货时间等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 入库确认弹窗 -->
    <el-dialog v-model="inboundVisible" title="物流单入库" width="480px" destroy-on-close>
      <div class="inbound-brief">
        <div class="ib-goods">{{ inboundRow?.goods }} × {{ inboundRow?.qty }} 件</div>
        <div class="ib-no">{{ inboundRow?.lg_no }}</div>
      </div>
      <el-form label-width="96px">
        <el-form-item label="入库仓库" required>
          <el-select v-model="inboundWarehouse" style="width: 100%" placeholder="选择入库仓库">
            <el-option v-for="w in warehouseOptions" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="inbound-tip">
        ℹ️ 入库后将自动累加库存（同名同仓合并，无则新建库存项）并生成入库批次，物流单状态置为「已入库」。
      </div>
      <template #footer>
        <el-button @click="inboundVisible = false">取消</el-button>
        <el-button type="success" @click="submitInbound">确认入库</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="detailVisible"
      :title="detailRow?.lg_no ? `物流详情 · ${detailRow.lg_no}` : '物流详情'"
      size="520px"
    >
      <div v-if="detailRow" class="detail-content">
        <div class="detail-status-bar">
          <el-tag :color="statusColor(detailRow.status)" style="color:#fff;border-radius:999px;font-weight:700;padding:0 12px" size="default">
            {{ detailRow.status }}
          </el-tag>
          <span class="detail-source">来源：{{ detailRow.source === 'miniapp' ? '小程序发起' : (detailRow.source === 'manual' ? '管理员登记' : (detailRow.source || '管理员登记')) }}</span>
        </div>

        <div class="detail-section-title">运输信息</div>
        <div class="detail-grid">
          <div class="d-cell"><label>货物名称</label><span>{{ detailRow.goods || '—' }}</span></div>
          <div class="d-cell"><label>件数</label><span>{{ detailRow.qty || 0 }} 件</span></div>
          <div class="d-cell"><label>预计到达</label><span>{{ detailRow.expect_date || '—' }}（{{ detailRow.eta_days || 0 }} 天）</span></div>
          <div class="d-cell"><label>入库仓库</label><span>{{ detailRow.dest_warehouse || '入库时再指定' }}</span></div>
        </div>

        <div class="detail-section-title">取货 / 承运</div>
        <div class="detail-list">
          <div class="l-row"><label>取货地址</label><span class="addr">{{ detailRow.pickup_address || '—' }}</span></div>
          <div class="l-row"><label>承运方</label><span>{{ detailRow.carrier || '—' }}</span></div>
          <div class="l-row"><label>联系电话</label><span class="mono">{{ detailRow.carrier_phone || '—' }}</span></div>
          <div class="l-row"><label>发起人</label><span>{{ detailRow.applicant || '—' }}</span></div>
        </div>

        <div v-if="detailRow.remark" class="detail-remark">
          <div class="detail-section-title">备注</div>
          <div class="remark-body">{{ detailRow.remark }}</div>
        </div>

        <div v-if="detailPhotos.length" class="detail-photos">
          <div class="detail-section-title">现场照片（{{ detailPhotos.length }}）</div>
          <div class="photo-wall">
            <el-image
              v-for="(url, i) in detailPhotos"
              :key="i"
              :src="url"
              :preview-src-list="detailPhotos"
              :initial-index="i"
              fit="cover"
              class="photo-item"
              preview-teleported
              hide-on-click-modal
            />
          </div>
        </div>

        <div class="detail-section-title">进度时间线</div>
        <el-timeline>
          <el-timeline-item :timestamp="detailRow.created_at || '—'" type="primary">
            <div class="t-title">登记订单</div>
            <div class="t-sub">发起人：{{ detailRow.applicant || '—' }}</div>
          </el-timeline-item>
          <el-timeline-item :timestamp="detailRow.pickup_time || '尚未取货'" :type="detailRow.pickup_time ? 'warning' : 'info'">
            <div class="t-title">货物取走</div>
            <div class="t-sub">{{ detailRow.pickup_time ? '已从取货地址发出' : '等待承运方上门取货' }}</div>
          </el-timeline-item>
          <el-timeline-item :timestamp="detailRow.arrive_time || '运输中'" :type="detailRow.arrive_time ? 'warning' : 'info'">
            <div class="t-title">到达目的地</div>
            <div class="t-sub">{{ detailRow.arrive_time ? '货物已送达' : '正在运输途中' }}</div>
          </el-timeline-item>
          <el-timeline-item :timestamp="detailRow.inbound_time || '待入库'" :type="detailRow.inbound_time ? 'success' : 'info'">
            <div class="t-title">入库完成</div>
            <div class="t-sub">
              <template v-if="detailRow.inbound_time">
                已入库至「{{ detailRow.dest_warehouse || '—' }}」，库存已累加并生成批次
              </template>
              <template v-else-if="detailRow.status === '已取消'">
                订单已取消，不会入库
              </template>
              <template v-else>
                到达后可在操作列点击「入库」完成
              </template>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Location, Search, Plus, Download } from '@element-plus/icons-vue'
import { rowsApi, txApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'

// ── 列表数据 ──
const logisticsList = ref([])
const warehouseOptions = ref([])

const statusOptions = ['待取货', '运输中', '已到达', '已入库', '已取消']
const STATUS_COLOR = { 待取货: '#f59e0b', 运输中: '#3b82f6', 已到达: '#8b5cf6', 已入库: '#059669', 已取消: '#9ca3af' }
function statusColor(s) { return STATUS_COLOR[s] || '#6b7280' }

async function loadList() {
  try {
    const res = await rowsApi.list('logistics_orders', { size: 200, sort: 'id', order: 'desc' })
    logisticsList.value = res?.data?.list || []
  } catch (e) {
    ElMessage.error('物流单加载失败')
  }
}

async function loadWarehouses() {
  try {
    const res = await rowsApi.list('warehouses', { size: 200 })
    warehouseOptions.value = (res?.data?.list || []).map((w) => w.name)
  } catch (e) {
    /* 仓库列表失败不阻塞页面 */
  }
}

onMounted(() => {
  loadList()
  loadWarehouses()
})

// ── 统计 ──
const stats = computed(() => {
  const list = logisticsList.value
  return {
    transit: list.filter((x) => x.status === '运输中').length,
    arrived: list.filter((x) => x.status === '已到达').length,
    transitQty: list.filter((x) => x.status === '运输中' || x.status === '已到达').reduce((s, x) => s + (Number(x.qty) || 0), 0),
    inboundQty: list.filter((x) => x.status === '已入库').reduce((s, x) => s + (Number(x.qty) || 0), 0),
  }
})

// ── 搜索 & 筛选 ──
const searchQuery = ref('')
const filterStatus = ref('')

const filteredList = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return logisticsList.value.filter((x) => {
    const matchSearch = !q
      || String(x.lg_no || '').toLowerCase().includes(q)
      || String(x.goods || '').toLowerCase().includes(q)
      || String(x.pickup_address || '').toLowerCase().includes(q)
    const matchStatus = !filterStatus.value || x.status === filterStatus.value
    return matchSearch && matchStatus
  })
})

// 分页：对筛选后的全集切片，搜索/状态筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([searchQuery, filterStatus], () => {
  currentPage.value = 1
})

// ── 时间工具 ──
function fmtDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + Number(days) || 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── 状态推进：待取货→运输中→已到达 / 取消 ──
async function advanceStatus(row, next) {
  const patch = { status: next }
  if (next === '运输中') patch.pickup_time = fmtDateTime()
  if (next === '已到达') patch.arrive_time = fmtDateTime()
  try {
    await rowsApi.update('logistics_orders', row.id, patch)
    Object.assign(row, patch)
    ElMessage.success(`「${row.lg_no}」已${next === '已取消' ? '取消' : '置为' + next}`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

// ── 新增 / 编辑 ──
const dialogVisible = ref(false)
const editingId = ref(null)

const defaultForm = () => ({
  pickupAddress: '',
  goods: '',
  qty: 1,
  etaDays: 3,
  destWarehouse: '',
  carrier: '',
  carrierPhone: '',
  remark: '',
})
const form = reactive(defaultForm())

function genLgNo() {
  const n = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  const d = `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}`
  const todayCount = logisticsList.value.filter((x) => String(x.lg_no || '').includes(d)).length
  return `LG-${d}-${pad(todayCount + 1)}`
}

function openCreate() {
  editingId.value = null
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.pickupAddress = row.pickup_address || ''
  form.goods = row.goods || ''
  form.qty = Number(row.qty) || 1
  form.etaDays = Number(row.eta_days) || 1
  form.destWarehouse = row.dest_warehouse || ''
  form.carrier = row.carrier || ''
  form.carrierPhone = row.carrier_phone || ''
  form.remark = row.remark || ''
  dialogVisible.value = true
}

function submitForm() {
  if (!form.pickupAddress.trim() || !form.goods.trim()) {
    ElMessage.warning('请填写取货地址和货物名称')
    return
  }
  if (!(Number(form.qty) > 0)) {
    ElMessage.warning('件数必须大于 0')
    return
  }
  const payload = {
    pickup_address: form.pickupAddress,
    goods: form.goods,
    qty: Number(form.qty),
    eta_days: Number(form.etaDays) || 1,
    expect_date: addDays(form.etaDays),
    dest_warehouse: form.destWarehouse || '',
    carrier: form.carrier,
    carrier_phone: form.carrierPhone,
    remark: form.remark,
  }
  const req = editingId.value
    ? rowsApi.update('logistics_orders', editingId.value, payload)
    : rowsApi.create('logistics_orders', { lg_no: genLgNo(), status: '待取货', source: 'manual', ...payload })
  req
    .then(() => {
      ElMessage.success(editingId.value ? '物流单已更新' : '物流单已登记')
      dialogVisible.value = false
      loadList()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '保存失败'))
}

// ── 入库 ──
const inboundVisible = ref(false)
const inboundRow = ref(null)
const inboundWarehouse = ref('')

// ── 详情抽屉 ──
const detailVisible = ref(false)
const detailRow = ref(null)
// 现场照片：photos 列为 JSON 数组字符串（小程序上传后回填）
const detailPhotos = computed(() => {
  const raw = detailRow.value?.photos
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(u => typeof u === 'string' && u) : []
  } catch {
    return []
  }
})
function openDetail(row) {
  detailRow.value = row
  detailVisible.value = true
}

function openInbound(row) {
  inboundRow.value = row
  inboundWarehouse.value = row.dest_warehouse || warehouseOptions.value[0] || ''
  inboundVisible.value = true
}

function submitInbound() {
  if (!inboundWarehouse.value) {
    ElMessage.warning('请选择入库仓库')
    return
  }
  txApi.logisticsInbound({ id: inboundRow.value.id, warehouse: inboundWarehouse.value })
    .then(() => {
      ElMessage.success(`「${inboundRow.value.lg_no}」已入库至 ${inboundWarehouse.value}，库存已累加`)
      inboundVisible.value = false
      loadList()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '入库失败'))
}

function handleDelete(row) {
  ElMessageBox.confirm(
    `确定要删除物流单「${row.lg_no}」吗？`,
    '确认删除',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(() => {
      rowsApi.remove('logistics_orders', row.id)
        .then(() => {
          ElMessage.success('物流单已删除')
          loadList()
        })
        .catch(() => ElMessage.error('删除失败'))
    })
    .catch(() => {})
}

// ── 导出 ──
function exportList() {
  if (!filteredList.value.length) {
    ElMessage.warning('当前筛选条件下没有可导出的物流单')
    return
  }
  const headers = ['物流单号', '发起人', '货物', '件数', '取货地址', '预计天数', '预计到达', '入库仓库', '承运方', '联系电话', '状态', '备注', '创建时间']
  const rows = filteredList.value.map((x) => [
    x.lg_no, x.applicant || '', x.goods || '', x.qty || 0, x.pickup_address || '',
    x.eta_days || '', x.expect_date || '', x.dest_warehouse || '', x.carrier || '',
    x.carrier_phone || '', x.status || '', x.remark || '', x.created_at || '',
  ])
  exportCsv(`物流运输单_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条物流单`)
}
</script>

<style scoped>
.header-content { display: flex; align-items: center; justify-content: space-between; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.title-section h3 { font-size: 18px; font-weight: 900; color: #111827; margin: 0 0 4px; }
.title-section p { font-size: 12px; color: #9ca3af; margin: 0; }
.form-section {
  font-size: 12px; font-weight: 900; color: #9ca3af; text-transform: uppercase;
  letter-spacing: 0.1em; margin-bottom: 16px;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.stat-cell {
  background: #f8fafc;
  border: 1px solid #eef2f6;
  border-radius: 12px;
  padding: 14px 16px;
}
.stat-num { font-size: 24px; font-weight: 900; color: #059669; line-height: 1.2; }
.stat-lbl { font-size: 12px; color: #9ca3af; margin-top: 4px; }

.inbound-brief { text-align: center; margin-bottom: 18px; }
.ib-goods { font-size: 16px; font-weight: 900; color: #111827; }
.ib-no { font-size: 12px; color: #9ca3af; font-family: monospace; margin-top: 4px; }
.inbound-tip {
  font-size: 12px; color: #9ca3af; line-height: 1.6;
  background: #f8fafc; border-radius: 8px; padding: 10px 12px;
}

.detail-content { padding: 0 4px; }
.detail-status-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; background: #f8fafc; border-radius: 10px; margin-bottom: 18px;
}
.detail-source { font-size: 12px; color: #6b7280; }
.detail-section-title {
  font-size: 12px; font-weight: 900; color: #9ca3af; text-transform: uppercase;
  letter-spacing: 0.1em; margin: 16px 0 10px;
}
.detail-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
}
.d-cell {
  background: #f8fafc; border-radius: 8px; padding: 10px 12px;
}
.d-cell label {
  display: block; font-size: 11px; color: #9ca3af; margin-bottom: 4px;
}
.d-cell span {
  display: block; font-size: 14px; color: #111827; font-weight: 600;
}
.detail-list { display: flex; flex-direction: column; gap: 8px; }
.l-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 8px 12px; background: #f8fafc; border-radius: 8px;
}
.l-row label { color: #9ca3af; font-size: 12px; flex-shrink: 0; }
.l-row span { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
.l-row .addr { font-weight: 500; }
.l-row .mono { font-family: monospace; }
.detail-remark { margin-top: 6px; }
.remark-body {
  background: #fffbeb; border-left: 3px solid #f59e0b;
  padding: 10px 12px; border-radius: 6px; color: #92400e; font-size: 13px; line-height: 1.5;
}
.detail-photos { margin-top: 6px; }
.photo-wall { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.photo-item {
  width: 108px; height: 108px; border-radius: 8px;
  background: #f3f4f6; cursor: zoom-in; overflow: hidden;
}
.t-title { font-size: 14px; font-weight: 700; color: #111827; }
.t-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
