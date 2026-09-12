<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>仓库资产配置</h3>
          <p>管理多级仓储体系，实时监控仓库空间利用率及库存分布</p>
        </div>
        <div class="header-actions">
          <el-button :icon="Download" @click="exportWarehouses">导出仓库</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreate">新增仓库</el-button>
        </div>
      </div>
    </template>

    <!-- Table -->
    <div class="table-wrap">
      <div class="table-header">
        <h3>仓库列表</h3>
        <div class="flex-row">
          <el-input
            v-model="searchQuery"
            placeholder="搜索仓库名称 / 地址..."
            :prefix-icon="Search"
            style="width: 240px"
            clearable
          />
          <el-select v-model="filterType" placeholder="全部类型" clearable style="width: 140px">
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </div>
      </div>

      <el-table :data="filteredWarehouses" stripe style="width: 100%">
        <el-table-column label="仓库信息" min-width="220">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 10px">
              <div
                :style="{ width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: typeBg(row.type), flexShrink: '0' }"
              >
                <el-icon :size="17" :style="{ color: typeColor(row.type) }"><Box /></el-icon>
              </div>
              <div style="min-width: 0">
                <div style="font-weight: 700; font-size: 13px; color: #111827">{{ row.name }}</div>
                <div style="font-size: 11px; color: #9ca3af; font-family: monospace; margin-top: 2px">{{ row.code }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="仓库类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :color="typeTagColor(row.type)"
              style="color: #fff; border-radius: 999px; font-weight: 700"
              size="small"
            >{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="负责人" width="120">
          <template #default="{ row }">
            <div style="font-weight: 600; font-size: 13px; color: #374151">{{ row.manager }}</div>
            <div v-if="row.phone" style="font-size: 11px; color: #9ca3af; font-family: monospace; margin-top: 1px">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="详细地址" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 4px">
              <el-icon :size="12" style="color: #d1d5db; flex-shrink: 0"><Location /></el-icon>
              <span style="font-size: 13px; color: #6b7280">{{ row.address }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="空间利用率" width="170">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-progress
                :percentage="row.utilization"
                :stroke-width="8"
                :color="row.utilization > 80 ? '#ef4444' : '#409eff'"
                :show-text="false"
                style="flex: 1"
              />
              <span style="font-weight: 800; font-size: 12px; color: #374151; min-width: 38px; text-align: right">{{ row.utilization }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130" align="center">
          <template #default="{ row }">
            <div class="flex-row" style="justify-content: center">
              <el-switch
                :model-value="row.status === '运营中'"
                @change="val => toggleActive(row, val)"
                inline-prompt
                active-text="运营中"
                inactive-text="停用"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center">
          <template #default="{ row }">
            <el-button text type="primary" size="small" style="font-weight: 700" @click="openEdit(row)">编辑档案</el-button>
            <el-button text type="primary" size="small" style="font-weight: 700" @click="openStock(row)">库存明细</el-button>
            <el-button text size="small" style="color: #9ca3af; font-weight: 700" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑仓库档案' : '定义新仓库'"
      width="560px"
      top="8vh"
      destroy-on-close
    >
      <div class="form-section">仓库基础信息</div>
      <el-form :model="form" label-width="92px">
        <el-form-item label="仓库名称">
          <el-input v-model="form.name" placeholder="例如：1号动力电池主仓" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="仓库类型">
              <el-select v-model="form.type" style="width: 100%">
                <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="仓库编码">
              <el-input v-model="form.code" placeholder="如: WH-SH-01" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.manager" placeholder="姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="form.phone" placeholder="手机号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="详细地址">
          <el-input v-model="form.address" type="textarea" :rows="2" placeholder="请输入仓库详细地址" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="仓储总面积">
              <el-input-number v-model="form.totalArea" :min="0" :step="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="防火等级">
              <el-select v-model="form.fireLevel" style="width: 100%">
                <el-option v-for="f in fireOptions" :key="f" :label="f" :value="f" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="运营状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ editingId ? '保存配置' : '保存配置' }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Location, Search, Plus, Download } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'

const router = useRouter()

// ── Warehouse data ──
const warehouseList = ref([])

async function loadWarehouses() {
  try {
    const res = await rowsApi.list('warehouses', { size: 200 })
    const raw = res?.data?.list || []
    warehouseList.value = raw.map((w) => ({
      ...w,
      utilization: 40 + ((w.id * 17) % 50),
      active: w.status === '运营中',
    }))
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(loadWarehouses)

// ── Options ──
const typeOptions = ['主仓', '备件仓', '成品仓', '回收仓']
const statusOptions = [
  { label: '运营中', value: '运营中' },
  { label: '维护中', value: '维护中' },
  { label: '已停用', value: '已停用' },
]
const fireOptions = ['甲级', '乙级', '常规']

// ── Type helpers ──
const typeColorMap = { 主仓: '#059669', 备件仓: '#409eff', 成品仓: '#f59e0b', 回收仓: '#6b7280' }
const typeBgMap = { 主仓: '#ecfdf5', 备件仓: '#ecf5ff', 成品仓: '#fef3c7', 回收仓: '#f3f4f6' }

function typeBg(type) { return typeBgMap[type] || '#f3f4f6' }
function typeColor(type) { return typeColorMap[type] || '#6b7280' }
function typeTagColor(type) { return typeColorMap[type] || '#6b7280' }

function toggleActive(row, val) {
  row.status = val ? '运营中' : '已停用'
  row.active = val
  rowsApi.update('warehouses', row.id, { status: row.status }).catch(() => {})
}

// ── Search & filter ──
const searchQuery = ref('')
const filterType = ref('')

const filteredWarehouses = computed(() => {
  return warehouseList.value.filter((w) => {
    const q = searchQuery.value.toLowerCase()
    const matchSearch = !q || w.name.includes(q) || w.address.includes(q) || w.code.toLowerCase().includes(q)
    const matchType = !filterType.value || w.type === filterType.value
    return matchSearch && matchType
  })
})

// ── 导出 ──
function exportWarehouses() {
  if (!filteredWarehouses.value.length) {
    ElMessage.warning('当前筛选条件下没有可导出的仓库')
    return
  }
  const headers = ['仓库名称', '仓库编码', '仓库类型', '负责人', '联系电话', '详细地址', '空间利用率', '运营状态', '总面积', '防火等级']
  const rows = filteredWarehouses.value.map((w) => [
    w.name,
    w.code,
    w.type,
    w.manager || '',
    w.phone || '',
    w.address || '',
    `${w.utilization}%`,
    w.status || '运营中',
    w.totalArea ?? '',
    w.fireLevel || '',
  ])
  exportCsv(`仓库资产_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 个仓库`)
}

// ── Dialog state ──
const dialogVisible = ref(false)
const editingId = ref(null)

const defaultForm = () => ({
  name: '',
  type: '主仓',
  code: '',
  manager: '',
  phone: '',
  address: '',
  totalArea: 500,
  fireLevel: '乙级',
  status: '运营中',
})

const form = reactive(defaultForm())

function openCreate() {
  editingId.value = null
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.name = row.name
  form.type = row.type
  form.code = row.code
  form.manager = row.manager || ''
  form.phone = row.phone || ''
  form.address = row.address || ''
  form.totalArea = row.totalArea || 500
  form.fireLevel = row.fireLevel || '乙级'
  form.status = row.status || '运营中'
  dialogVisible.value = true
}

function submitForm() {
  if (!form.name.trim() || !form.code.trim()) {
    ElMessage.warning('请填写仓库名称和编码')
    return
  }
  const payload = {
    name: form.name,
    type: form.type,
    code: form.code,
    manager: form.manager,
    phone: form.phone,
    address: form.address,
    total_area: form.totalArea,
    fire_level: form.fireLevel,
    status: form.status,
  }
  const req = editingId.value
    ? rowsApi.update('warehouses', editingId.value, payload)
    : rowsApi.create('warehouses', payload)
  req
    .then(() => {
      ElMessage.success(editingId.value ? '仓库信息已更新' : '新仓库已添加')
      dialogVisible.value = false
      loadWarehouses()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '保存失败'))
}

function openStock(row) {
  ElMessage.info(`正在跳转至 [${row.name}] 的实时库存明细...`)
  router.push('/inventory/stock')
}

function handleDelete(row) {
  ElMessageBox.confirm(
    `确定要删除仓库"${row.name}"吗？关联库存数据将受到影响。`,
    '确认删除',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(() => {
      rowsApi.remove('warehouses', row.id)
        .then(() => {
          const idx = warehouseList.value.findIndex((w) => w.id === row.id)
          if (idx > -1) warehouseList.value.splice(idx, 1)
          ElMessage.success('仓库已删除')
        })
        .catch(() => ElMessage.error('删除失败'))
    })
    .catch(() => {})
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
</style>
