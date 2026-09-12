<template>
  <div class="products-page">
    <!-- ── Stat Cards ── -->
    <div class="product-stats mb-6">
      <div class="stat-item glass-white">
        <span class="label">全线产品型号</span>
        <p class="val">{{ products.length }} <span class="unit">款</span></p>
      </div>
      <div class="stat-item glass-white">
        <span class="label">新品上架 (本月)</span>
        <p class="val">{{ newThisMonth }} <span class="unit">款</span></p>
      </div>
      <div class="stat-item glass-white">
        <span class="label">供应链活跃品牌</span>
        <p class="val">{{ brandCount }} <span class="unit">个</span></p>
      </div>
      <div class="stat-item glass-white">
        <span class="label">淘汰/退市产品</span>
        <p class="val">{{ discontinuedCount }} <span class="unit">款</span></p>
      </div>
    </div>

    <el-card shadow="never" class="main-card">
      <template #header>
        <div class="header-flex">
          <div class="title-section">
            <h3>核心产品主数据</h3>
            <p>管理充电桩、电池组及回收套件的标准化参数、规格及供应链属性</p>
          </div>
          <div class="action-section">
            <el-input
              v-model="searchQuery"
              placeholder="搜索型号、条码或名称..."
              class="search-bar"
              :prefix-icon="Search"
              clearable
            />
            <el-button :icon="Download" @click="exportProducts">导出</el-button>
            <el-button type="primary" :icon="Plus" @click="openCreate">建立新产品</el-button>
          </div>
        </div>
      </template>

      <div class="filter-bar mb-4">
        <el-select v-model="filterCategory" placeholder="全部分类" size="small" class="!w-36" clearable>
          <el-option label="交流充电桩" value="交流充电桩" />
          <el-option label="直流超充桩" value="直流超充桩" />
          <el-option label="梯次电池组" value="回收电池模组" />
          <el-option label="回收产品配件" value="回收产品配件" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" size="small" class="!w-24 ml-2" clearable>
          <el-option label="在售" value="active" />
          <el-option label="试产" value="trial" />
          <el-option label="停产" value="discontinued" />
        </el-select>
      </div>

      <el-table :data="filteredProducts" class="pro-table" v-loading="loading">
        <el-table-column label="产品主图" width="80">
          <template #default="{ row }">
            <el-image :src="row.image" class="product-thumb" :preview-src-list="[row.image]" fit="cover" />
          </template>
        </el-table-column>
        <el-table-column label="名称/型号" min-width="240">
          <template #default="{ row }">
            <div class="name-cell">
              <p class="name text-base font-bold text-gray-900">{{ row.name }}</p>
              <div class="model-tags">
                <span class="model">{{ row.model }}</span>
                <span class="category ml-2">{{ row.categoryName }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="核心参数" min-width="200">
          <template #default="{ row }">
            <div class="specs-mini">
              <div class="s-item" v-for="(value, key) in row.keySpecs" :key="key">
                <span class="k">{{ key }}:</span>
                <span class="v">{{ value }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="库存控制" width="180">
          <template #default="{ row }">
            <div class="stock-ctrl">
              <div class="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>安全水位</span>
                <span class="font-bold">{{ row.safetyStock }}</span>
              </div>
              <el-progress
                :percentage="Math.min(100, Math.round((row.currentStock / Math.max(row.safetyStock, 1)) * 100))"
                :status="row.currentStock < row.safetyStock ? 'exception' : 'success'"
                :stroke-width="6"
                :show-text="false"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="运营状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" effect="plain" class="status-badge">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="right">
          <template #default="{ row }">
            <el-button link type="primary" class="text-sm font-bold" @click="openEdit(row)">编辑规格</el-button>
            <el-button link type="danger" class="text-sm font-bold" @click="handleDelist(row)">下架</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ── Create / Edit Dialog ── -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑产品主数据' : '新增标准化产品'"
      width="900px"
      class="pro-dialog"
    >
      <el-tabs v-model="activePane" class="product-tabs">
        <!-- 基础信息 -->
        <el-tab-pane label="基础信息" name="base">
          <el-form :model="form" label-width="100px" class="pt-4 pr-10">
            <el-row :gutter="30">
              <el-col :span="12">
                <el-form-item label="产品名称">
                  <el-input v-model="form.name" placeholder="如：120kW 双枪直流快速充电桩" />
                </el-form-item>
                <el-form-item label="官方型号">
                  <el-input v-model="form.model" placeholder="TP-EV-120D-V2" />
                </el-form-item>
                <el-form-item label="产品类目">
                  <el-select v-model="form.categoryId" class="w-full">
                    <el-option label="直流充电桩 (DC)" :value="1" />
                    <el-option label="交流充电桩 (AC)" :value="2" />
                    <el-option label="回收电池模组" :value="3" />
                    <el-option label="回收产品配件" :value="4" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="主图配置">
                  <div class="image-uploader" @click="pickImage">
                    <img v-if="form.image" :src="form.image" class="image-uploader-preview" />
                    <template v-else>
                      <el-icon class="mt-4"><Plus /></el-icon>
                      <p class="text-[10px] text-gray-400 mt-1">上传主图 (Max 2MB)</p>
                    </template>
                  </div>
                  <input ref="imageInput" type="file" accept="image/*" class="hidden-input" @change="onImageChange" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="产品描述">
              <el-input v-model="form.desc" type="textarea" :rows="3" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 技术指标 -->
        <el-tab-pane label="技术指标" name="tech">
          <div class="tech-spec-grid py-4 pr-10">
            <div class="grid grid-cols-2 gap-x-10 gap-y-6">
              <div class="spec-input">
                <label>额定功率 (kW)</label>
                <el-input-number v-model="form.tech.power" class="!w-full" />
              </div>
              <div class="spec-input">
                <label>输入电压 (V)</label>
                <el-input v-model="form.tech.voltage" />
              </div>
              <div class="spec-input">
                <label>防护等级 (IP)</label>
                <el-input v-model="form.tech.ip" placeholder="IP54 / IP65" />
              </div>
              <div class="spec-input">
                <label>外形尺寸 (mm)</label>
                <el-input v-model="form.tech.size" placeholder="长*宽*高" />
              </div>
              <div class="spec-input">
                <label>重量 (kg)</label>
                <el-input-number v-model="form.tech.weight" class="!w-full" />
              </div>
              <div class="spec-input">
                <label>认证标准</label>
                <div class="flex items-center h-8">
                  <el-checkbox-group v-model="form.tech.certs" class="flex gap-4">
                    <el-checkbox label="CQC" />
                    <el-checkbox label="CE" />
                    <el-checkbox label="UL" />
                  </el-checkbox-group>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 扩展参数 -->
        <el-tab-pane label="扩展参数" name="extra">
          <div class="extra-spec-pane py-4 pr-10">
            <div class="pane-intro mb-6">
              <h5>个性化参数配置</h5>
              <p>针对不同品类的特殊属性，支持在此添加自定义键值对，将同步展示在产品详情及出库单中。</p>
            </div>
            <div class="custom-specs-list">
              <div v-for="(spec, idx) in form.customSpecs" :key="idx" class="custom-spec-row mb-4">
                <el-input v-model="spec.key" placeholder="属性名 (如: 线缆长度)" class="!w-48" />
                <el-icon class="text-gray-300"><Minus /></el-icon>
                <el-input v-model="spec.value" placeholder="属性值 (如: 5米)" class="flex-1" />
                <el-button link type="danger" :icon="Delete" @click="removeSpec(idx)" />
              </div>
              <el-empty
                v-if="form.customSpecs.length === 0"
                :image-size="60"
                description="暂无自定义扩展规格"
              >
                <el-button type="primary" plain size="small" :icon="Plus" @click="addSpec">立即添加第一个属性</el-button>
              </el-empty>
              <div v-else class="mt-6 flex justify-center">
                <el-button type="primary" plain :icon="Plus" @click="addSpec">继续添加规格属性</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 供应链与价格 -->
        <el-tab-pane label="供应链与价格" name="supply">
          <el-form :model="form" label-width="100px" class="pt-4 pr-10">
            <el-row :gutter="30">
              <el-col :span="12">
                <el-form-item label="建议成本">
                  <el-input v-model="form.cost">
                    <template #append>元</template>
                  </el-input>
                </el-form-item>
                <el-form-item label="安全库存">
                  <el-input-number v-model="form.safetyStock" class="!w-full" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="首选供应商">
                  <el-select v-model="form.supplier" class="w-full">
                    <el-option label="特锐德" value="teld" />
                    <el-option label="星云股份" value="nebula" />
                  </el-select>
                </el-form-item>
                <el-form-item label="保质周期">
                  <el-input v-model="form.warranty" placeholder="如：36个月" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveProduct">保存主数据</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Minus, Search, Download } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'
import { uploadImage } from '@/utils/upload'

const IMAGE_BASE = 'https://picsum.photos/seed'
const loading = ref(false)

// 保留现有数据拉取逻辑
const rawProducts = ref([])
const categories = ref([])
async function loadData() {
  loading.value = true
  try {
    const [pres, cres] = await Promise.all([
      rowsApi.list('products', { size: 200 }),
      rowsApi.list('categories', { size: 200 }),
    ])
    const rawList = pres?.data?.list || []
    rawProducts.value = rawList.map((p) => ({
      ...p,
      costPrice: p.cost_price ?? p.costPrice,
      salePrice: p.sale_price ?? p.salePrice,
    }))
    const catList = cres?.data?.list || []
    categories.value = catList
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}
onMounted(loadData)

// ── 状态映射 ──
const STATUS_LABEL = { active: '在售活跃', trial: '试产测试', discontinued: '停产退市' }
const STATUS_TYPE = { active: 'success', trial: 'warning', discontinued: 'info' }
const LOCAL_TO_PROTO = { '在售': 'active', '试产': 'trial' }
function localToProtoStatus(s) {
  return LOCAL_TO_PROTO[s] || 'discontinued'
}
function statusLabel(s) {
  return STATUS_LABEL[s] || s
}
function statusType(s) {
  return STATUS_TYPE[s] || 'info'
}

// ── 映射为原型期望结构 ──
const products = computed(() =>
  rawProducts.value.map((p) => ({
    ...p,
    categoryName: p.category || '',
    keySpecs: p.specs && Object.keys(p.specs).length ? p.specs : (p.keySpecs || {}),
    currentStock: p.currentStock ?? 0,
    safetyStock: p.safetyStock ?? 50,
    status: localToProtoStatus(p.status),
    customSpecs: Array.isArray(p.extParams)
      ? p.extParams.map((e) => ({ key: e.key || '', value: e.value || '' }))
      : [],
    image: p.image || `${IMAGE_BASE}/prod${p.id}/88/88`,
  }))
)

const newThisMonth = computed(() => products.value.filter((p) => p.status === 'active').length)
const brandCount = computed(() => new Set(products.value.map((p) => p.categoryName).filter(Boolean)).size)
const discontinuedCount = computed(() => products.value.filter((p) => p.status === 'discontinued').length)

// ── 筛选 ──
const searchQuery = ref('')
const filterCategory = ref('')
const filterStatus = ref('')
const filteredProducts = computed(() =>
  products.value.filter((p) => {
    const k = !searchQuery.value || p.name.includes(searchQuery.value) || p.model.includes(searchQuery.value)
    const c = !filterCategory.value || p.categoryName === filterCategory.value
    const s = !filterStatus.value || p.status === filterStatus.value
    return k && c && s
  })
)

// ── 导出 ──
function exportProducts() {
  if (!filteredProducts.value.length) {
    ElMessage.warning('当前筛选条件下没有可导出的产品')
    return
  }
  const headers = ['产品名称', '型号', '分类', '核心参数', '安全库存', '当前库存', '运营状态']
  const rows = filteredProducts.value.map((p) => [
    p.name,
    p.model,
    p.categoryName,
    Object.entries(p.keySpecs || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('; '),
    p.safetyStock,
    p.currentStock,
    statusLabel(p.status),
  ])
  exportCsv(`产品主数据_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条产品数据`)
}

// ── Dialog ──
const dialogVisible = ref(false)
const activePane = ref('base')
const editingId = ref(null)
const form = reactive({
  id: null,
  name: '',
  model: '',
  categoryId: 1,
  desc: '',
  image: '',
  tech: { power: 120, voltage: '200-1000V', ip: 'IP54', size: '1200*800*2000', weight: 450, certs: ['CQC'] },
  customSpecs: [],
  cost: '12000',
  safetyStock: 20,
  supplier: '',
  warranty: '36个月',
})

function resetForm() {
  Object.assign(form, {
    id: null,
    name: '',
    model: '',
    categoryId: 1,
    desc: '',
    image: '',
    tech: { power: 120, voltage: '200-1000V', ip: 'IP54', size: '1200*800*2000', weight: 450, certs: ['CQC'] },
    customSpecs: [],
    cost: '12000',
    safetyStock: 20,
    supplier: '',
    warranty: '36个月',
  })
}
function addSpec() {
  form.customSpecs.push({ key: '', value: '' })
}
function removeSpec(idx) {
  form.customSpecs.splice(idx, 1)
}

// ── 主图上传（先经 /api/open/upload 转存为图片 URL 再入库）──
const imageInput = ref(null)
function pickImage() {
  imageInput.value?.click()
}
async function onImageChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    form.image = await uploadImage(file)
    ElMessage.success('主图已上传')
  } catch {
    ElMessage.error('主图上传失败，请重试')
  }
  e.target.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  activePane.value = 'base'
  dialogVisible.value = true
}
function openEdit(row) {
  editingId.value = row.id
  form.id = row.id
  form.name = row.name
  form.model = row.model
  form.categoryId = [1, 2, 3, 4][['直流充电桩', '交流充电桩', '回收电池模组', '回收产品配件'].indexOf(row.categoryName)] || 1
  form.desc = row.description || ''
  form.image = row.image || ''
  form.customSpecs = row.customSpecs.length ? JSON.parse(JSON.stringify(row.customSpecs)) : []
  form.cost = row.costPrice != null ? String(row.costPrice) : '12000'
  form.safetyStock = row.safetyStock
  form.supplier = row.supplier || ''
  form.warranty = row.warranty != null ? String(row.warranty) + '个月' : '36个月'
  activePane.value = 'base'
  dialogVisible.value = true
}
function saveProduct() {
  const payload = {
    name: form.name,
    model: form.model,
    category: categories.value.find((c) => c.id === form.categoryId)?.name || '',
    unit: '组',
    cost_price: form.cost,
    sale_price: form.cost,
    status: '在售',
    description: form.desc,
    image: form.image,
    safety_stock: form.safetyStock,
    supplier: form.supplier,
    warranty: form.warranty,
  }
  const req = editingId.value
    ? rowsApi.update('products', editingId.value, payload)
    : rowsApi.create('products', payload)
  req
    .then(() => {
      ElMessage.success(editingId.value ? '产品主数据已更新并同步至各仓库节点' : '新产品已创建')
      dialogVisible.value = false
      loadData()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '保存失败'))
}

function handleDelist(row) {
  ElMessageBox.confirm(
    `确定要将产品 【${row.name}】 设为停产状态吗？此操作会影响后续采购计划。`,
    '操作确认',
    { confirmButtonText: '确认下架', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    rowsApi.update('products', row.id, { status: '退市' })
      .then(() => {
        const target = rawProducts.value.find((p) => p.id === row.id)
        if (target) target.status = '退市'
        ElMessage.info('产品已设为退市状态')
      })
      .catch(() => ElMessage.error('操作失败'))
  }).catch(() => {})
}
</script>

<style scoped>
.products-page {
  padding: 0;
}

/* ── Stat Cards ── */
.product-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}
.glass-white {
  background: #fff;
  border: 1px solid #eef2f4;
  border-radius: 24px;
  padding: 22px 26px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.glass-white .label {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
}
.glass-white .val {
  font-size: 28px;
  font-weight: 900;
  color: #111827;
  margin: 8px 0 0;
  line-height: 1;
}
.glass-white .unit {
  font-size: 13px;
  font-weight: 700;
  color: #9ca3af;
}

/* ── Main Card ── */
.main-card {
  border-radius: 24px;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.main-card :deep(.el-card__header) {
  padding: 22px 28px;
  border-bottom: none;
}
.main-card :deep(.el-card__body) {
  padding: 4px 28px 28px;
}
.header-flex {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.title-section h3 {
  font-size: 20px;
  font-weight: 900;
  color: #111827;
  margin: 0;
}
.title-section p {
  font-size: 12px;
  color: #9ca3af;
  margin: 4px 0 0;
}
.action-section {
  display: flex;
  gap: 12px;
  align-items: center;
}
.search-bar {
  width: 260px;
}

/* ── Table ── */
.pro-table {
  --el-table-border-color: transparent;
}
.product-thumb {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
}
.model-tags .model {
  font-size: 12px;
  color: #6b7280;
  font-weight: 700;
}
.model-tags .category {
  font-size: 12px;
  color: #9ca3af;
}
.specs-mini .s-item {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.7;
}
.specs-mini .k {
  font-weight: 700;
  color: #9ca3af;
}
.specs-mini .v {
  font-weight: 700;
}
.status-badge {
  font-weight: 900;
}

/* ── Dialog ── */
.pro-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}
.product-tabs :deep(.el-tabs__item) {
  font-weight: 700;
}
.hidden-input { display: none; }
.image-uploader {
  width: 96px;
  height: 96px;
  border: 1px dashed #d9d9d9;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  cursor: pointer;
  overflow: hidden;
  transition: border-color .15s;
}
.image-uploader:hover { border-color: #409eff; }
.image-uploader-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tech-spec-grid label,
.spec-input label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  margin-bottom: 6px;
}
.custom-spec-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pane-intro h5 {
  font-size: 14px;
  font-weight: 900;
  color: #111827;
  margin: 0 0 4px;
}
.pane-intro p {
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
