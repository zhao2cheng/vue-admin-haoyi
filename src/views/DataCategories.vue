<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>产品品类与质检模板</h3>
          <p>定义产品分类层级，并为不同品类绑定标准化的质量检测参数模板</p>
        </div>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索品类名称..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-button :icon="Download" @click="exportCats">导出品类</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreate">新增品类</el-button>
        </div>
      </div>
    </template>

    <el-table :data="filteredCats" style="width: 100%" class="pro-table">
      <el-table-column label="品类名称" min-width="180">
        <template #default="{ row }">
          <div class="category-info">
            <div class="icon-box" :style="{ background: row.color + '10', color: row.color }">
              <el-icon><component :is="getIcon(row.icon)" /></el-icon>
            </div>
            <span class="name text-base font-bold text-gray-900 ml-3">{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="关联质检字段" min-width="300">
        <template #default="{ row }">
          <div class="template-tags">
            <el-tag
              v-for="(f, i) in row.template"
              :key="i"
              size="small"
              effect="plain"
              class="field-tag"
            >
              {{ f.label }}<span v-if="f.unit" class="text-xs text-gray-400 italic"> ({{ f.unit }})</span>
            </el-tag>
            <span v-if="!row.template.length" class="text-xs text-gray-400 italic">尚未配置模板</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="最后更新" width="180">
        <template #default="{ row }">
          <span class="text-xs text-gray-400 font-mono">{{ row.updateTime }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" align="right">
        <template #default="{ row }">
          <el-button link type="primary" class="font-bold" @click="openEdit(row)">编辑</el-button>
          <el-button link type="warning" class="font-bold" @click="openQcConfig(row)">质检模板配置</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <!-- 新增 / 编辑品类 -->
  <el-dialog
    v-model="dialogVisible"
    :title="form.id ? '编辑品类' : '新增产品品类'"
    width="440px"
    class="pro-dialog"
  >
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存品类</el-button>
      </div>
    </template>
    <el-form :model="form" label-width="80px" class="pt-4">
      <el-form-item label="品类名称">
        <el-input v-model="form.name" placeholder="例如：动力电池、逆变器..." />
      </el-form-item>
      <el-form-item label="视觉色系">
        <el-color-picker v-model="form.color" />
        <span class="ml-4 text-xs text-gray-400">用于库存及报表的快速识别</span>
      </el-form-item>
    </el-form>
  </el-dialog>

  <!-- 配置质检参数模板 -->
  <el-dialog
    v-model="qcVisible"
    title="配置质检参数模板"
    width="600px"
    class="pro-dialog"
  >
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="qcVisible = false">取消</el-button>
        <el-button type="primary" @click="saveQcConfig">保存模板配置</el-button>
      </div>
    </template>
    <div v-if="qcTarget">
      <div class="alert-box mb-6">
        <el-icon class="mr-2"><Warning /></el-icon>
        <span>正在为 [{{ qcTarget.name }}] 定义质检标准。库存录入时将按此模板生成表单。</span>
      </div>
      <div class="field-list">
        <div v-for="(field, fi) in qcFields" :key="fi" class="field-item">
          <div class="field-main mb-3">
            <el-row :gutter="12" align="middle">
              <el-col :span="8">
                <el-input v-model="field.label" placeholder="字段名称 (如: 电压)" size="small" />
              </el-col>
              <el-col :span="6">
                <el-input v-model="field.unit" placeholder="单位 (如: V)" size="small" />
              </el-col>
              <el-col :span="7">
                <el-select v-model="field.type" placeholder="类型" size="small">
                  <el-option label="数值范围" value="number" />
                  <el-option label="合格判定 (OK/NG)" value="boolean" />
                  <el-option label="状态选择" value="select" />
                </el-select>
              </el-col>
              <el-col :span="3" class="text-right">
                <el-button :icon="Delete" circle type="danger" plain size="small" @click="removeField(fi)" />
              </el-col>
            </el-row>
          </div>

          <div class="standard-config bg-white/60 p-3 rounded-lg border border-dashed border-gray-200 mt-2">
            <div class="flex justify-between items-center mb-3">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">设定判定标准 (支持多级评定)</span>
              <el-button
                v-if="field.type === 'number'"
                type="primary"
                link
                size="small"
                @click="addGrade(field)"
              >+ 添加评级区间</el-button>
            </div>

            <template v-if="field.type === 'number'">
              <div v-for="(g, gi) in (field.grades || [])" :key="gi" class="grading-rows flex flex-col gap-2">
                <div class="flex items-center gap-2">
                  <el-input-number v-model="g.min" placeholder="低" size="small" class="!w-24" />
                  <span class="text-gray-300">≤ X &lt;</span>
                  <el-input-number v-model="g.max" placeholder="高" size="small" class="!w-24" />
                  <el-input v-model="g.label" placeholder="等级 (如: 优)" size="small" class="!w-20" />
                  <el-select v-model="g.level" size="small" class="!w-20">
                    <el-option label="优" value="success" />
                    <el-option label="良" value="primary" />
                    <el-option label="中" value="warning" />
                    <el-option label="差" value="danger" />
                  </el-select>
                  <el-button :icon="Delete" circle link type="danger" size="small" @click="removeGrade(field, gi)" />
                </div>
              </div>
              <div v-if="!(field.grades && field.grades.length)" class="flex items-center gap-2">
                <el-input-number v-model="field.min" placeholder="合格下限" size="small" class="!w-24" />
                <span class="text-gray-300">≤ 合格范围 ≤</span>
                <el-input-number v-model="field.max" placeholder="合格上限" size="small" class="!w-24" />
              </div>
            </template>

            <template v-else-if="field.type === 'boolean'">
              <span class="text-xs text-gray-500">期望状态:</span>
              <el-radio-group v-model="field.expected" size="small">
                <el-radio-button :label="true">合格 (OK)</el-radio-button>
                <el-radio-button :label="false">待定/NG</el-radio-button>
              </el-radio-group>
            </template>

            <template v-else-if="field.type === 'select'">
              <el-input v-model="field.options" placeholder="选项(用逗号隔开, 如: A级,B级,C级)" size="small" class="flex-1" />
            </template>
          </div>
        </div>

        <el-button type="primary" plain :icon="Plus" class="w-full mt-4 rounded-xl" @click="addField">添加检测参数项</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus, Delete, Warning, Refresh, Connection, Setting, Box, Download } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { exportCsv, nowStamp as fileStamp } from '@/utils/export'

const iconMap = {
  battery: { bg: '#ecfdf5', color: '#10b981', comp: Refresh },
  charger: { bg: '#eff6ff', color: '#3b82f6', comp: Connection },
  accessory: { bg: '#fff7ed', color: '#f59e0b', comp: Connection },
  other: { bg: '#f3f4f6', color: '#6b7280', comp: Setting },
  default: { bg: '#f3f4f6', color: '#6b7280', comp: Box },
}
function getIcon(icon) {
  return iconMap[icon]?.comp || Box
}

// ── Data (preserved fetching logic) ──
const categories = ref([])
const allProducts = ref([])
const nextId = ref(1)

async function loadData() {
  try {
    const [cres, pres] = await Promise.all([
      rowsApi.list('categories', { size: 200 }),
      rowsApi.list('products', { size: 200 }),
    ])
    const list = cres?.data?.list || []
    allProducts.value = pres?.data?.list || []
    nextId.value = list.length ? Math.max(...list.map(c => c.id)) + 1 : 1
    categories.value = list.map(c => ({
      ...c,
      qcFields: c.qc_fields ?? c.qcFields ?? '',
      color: iconMap[c.icon]?.color || '#3b82f6',
      updated: c.updated || c.updateTime || '',
    }))
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(loadData)

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}
function parseTemplate(raw) {
  if (!raw) return []
  return raw.split('|').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)(?:\((.+)\))?$/)
    return {
      label: (m ? m[1] : s).trim(),
      unit: m && m[2] ? m[2].trim() : '',
      type: 'number',
      min: 0,
      max: 100,
      expected: true,
      options: '',
      grades: [],
    }
  })
}

const cats = computed(() => categories.value.map(c => ({
  id: c.id,
  name: c.name,
  icon: c.icon || 'default',
  color: c.color || '#3b82f6',
  updateTime: c.updated || '',
  template: parseTemplate(c.qcFields),
})))

const searchQuery = ref('')
const filteredCats = computed(() =>
  !searchQuery.value
    ? cats.value
    : cats.value.filter((c) => c.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
)

// ── 导出 ──
function exportCats() {
  const list = filteredCats.value
  if (!list.length) {
    ElMessage.warning('暂无品类数据可导出')
    return
  }
  const headers = ['品类名称', '视觉色系', '关联质检字段', '最后更新']
  const rows = list.map((c) => [
    c.name,
    c.color,
    c.template.map((f) => f.label + (f.unit ? `(${f.unit})` : '')).join(' | '),
    c.updateTime,
  ])
  exportCsv(`产品品类_${fileStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 个品类`)
}

// ── Create / Edit ──
const dialogVisible = ref(false)
const form = reactive({ id: null, name: '', color: '#3b82f6' })

function openCreate() {
  form.id = null
  form.name = ''
  form.color = '#3b82f6'
  dialogVisible.value = true
}
function openEdit(row) {
  form.id = row.id
  form.name = row.name
  form.color = row.color
  dialogVisible.value = true
}
function submitForm() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写品类名称')
    return
  }
  const payload = { name: form.name, updated: nowStamp() }
  const req = form.id
    ? rowsApi.update('categories', form.id, payload)
    : rowsApi.create('categories', { ...payload, qc_fields: '' })
  req
    .then(() => {
      ElMessage.success(form.id ? '产品品类已更新' : '新品类已添加')
      dialogVisible.value = false
      loadData()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '保存失败'))
}

// ── QC Template Config ──
const qcVisible = ref(false)
const qcTarget = ref(null)
const qcFields = ref([])

function openQcConfig(row) {
  qcTarget.value = row
  qcFields.value = JSON.parse(JSON.stringify(row.template || []))
  qcVisible.value = true
}
function addField() {
  qcFields.value.push({ label: '', unit: '', type: 'number', min: 0, max: 100, expected: true, options: '', grades: [] })
}
function removeField(i) {
  qcFields.value.splice(i, 1)
}
function addGrade(field) {
  if (!field.grades) field.grades = []
  field.grades.push({ min: 0, max: 0, label: '', level: 'primary' })
}
function removeGrade(field, gi) {
  field.grades.splice(gi, 1)
}
function saveQcConfig() {
  if (qcTarget.value) {
    const qcStr = qcFields.value
      .map(f => f.label + (f.unit ? `(${f.unit})` : ''))
      .join(' | ')
    rowsApi.update('categories', qcTarget.value.id, { qc_fields: qcStr, updated: nowStamp() })
      .then(() => {
        qcTarget.value.template = JSON.parse(JSON.stringify(qcFields.value))
        const src = categories.value.find(x => x.id === qcTarget.value.id)
        if (src) src.qcFields = qcStr
        ElMessage.success(`[${qcTarget.value.name}] 质检模板配置已同步`)
        qcVisible.value = false
      })
      .catch(() => ElMessage.error('保存失败'))
  } else {
    qcVisible.value = false
  }
}
</script>

<style scoped>
.table-card { background: #fff; border-radius: 12px; }
.header-content { display: flex; align-items: center; justify-content: space-between; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.header-actions .search-input { width: 220px; }
.title-section h3 { margin: 0; font-size: 18px; font-weight: 700; }
.title-section p { margin: 4px 0 0; font-size: 13px; color: #9ca3af; }
.category-info { display: flex; align-items: center; }
.icon-box { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.template-tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.field-tag { font-weight: 500; }
.pro-table :deep(.el-table__row) { font-size: 13px; }

.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; }
.alert-box { display: flex; align-items: flex-start; gap: 6px; background: #fdf6ec; border: 1px solid #faecd8; color: #e6a23c; border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.6; }
.field-list { display: flex; flex-direction: column; gap: 14px; }
.field-item { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 10px; padding: 12px; }
.text-right { text-align: right; }
</style>
