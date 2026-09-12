<template>
  <div class="suppliers-page">
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="header-content">
          <div class="title-section">
            <h3>供应商档案管理</h3>
            <p>维护合作伙伴名录，包括联系人、财务账期及供应资质评估</p>
          </div>
          <div class="header-actions">
            <el-button :icon="Download" @click="exportSuppliers">导出名录</el-button>
            <el-button type="primary" :icon="Plus" @click="openCreate">新增供应商</el-button>
          </div>
        </div>
      </template>

      <div class="filter-section">
        <el-input
          v-model="searchQuery"
          placeholder="搜索公司名称/联系人..."
          class="search-input"
          :prefix-icon="Search"
          clearable
        />
        <el-select v-model="filterLevel" placeholder="合作等级" clearable class="status-select">
          <el-option label="战略合作 (A)" value="A" />
          <el-option label="核心供应 (B)" value="B" />
          <el-option label="一般供应 (C)" value="C" />
        </el-select>
      </div>

      <el-table :data="filteredSuppliers" class="pro-table" style="width: 100%">
        <el-table-column label="供应商信息" min-width="260">
          <template #default="{ row }">
            <div class="supplier-info">
              <div :class="['avatar-box', row.level]">{{ row.name.substring(0, 2) }}</div>
              <div class="info-body">
                <p class="name">{{ row.name }}</p>
                <div class="tags">
                  <el-tag size="small" :type="levelType(row.level)" effect="plain">{{ row.level }}级战略伙伴</el-tag>
                  <el-tag v-if="row.isCertified" size="small" type="success" effect="dark" class="ml-2">已验资</el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="商务联系" width="200">
          <template #default="{ row }">
            <p class="text-sm font-bold text-gray-900">{{ row.contact }}</p>
            <p class="text-xs text-gray-500 font-mono mt-1">{{ row.phone }}</p>
          </template>
        </el-table-column>
        <el-table-column prop="paymentTerms" label="结算条款" width="160" />
        <el-table-column label="供应品类" min-width="180">
          <template #default="{ row }">
            <div class="category-tags">
              <span v-for="cat in row.categories" :key="cat" class="cat-tag">{{ cat }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="right">
          <template #default="{ row }">
            <el-button link type="primary" class="text-sm font-bold" @click="openEdit(row)">编辑档案</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ── Create / Edit Dialog ── -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '供应商综合档案管理' : '新增合作伙伴'"
      width="800px"
      class="pro-dialog"
    >
      <el-tabs v-model="activePane" class="supplier-tabs">
        <!-- 基础信息 -->
        <el-tab-pane label="基础信息" name="base">
          <el-form :model="form" label-width="100px" class="pt-6 pr-6">
            <el-row :gutter="30">
              <el-col :span="16">
                <el-form-item label="企业全称">
                  <el-input v-model="form.name" placeholder="请输入工商注册全称" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="合作等级">
                  <el-select v-model="form.level" class="w-full">
                    <el-option label="战略合作 (A)" value="A" />
                    <el-option label="核心供应 (B)" value="B" />
                    <el-option label="一般供应 (C)" value="C" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="30">
              <el-col :span="12">
                <el-form-item label="商务联系人">
                  <el-input v-model="form.contact" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="联系电话">
                  <el-input v-model="form.phone" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="30">
              <el-col :span="12">
                <el-form-item label="结算方式">
                  <el-select v-model="form.paymentTerms" class="w-full">
                    <el-option label="月结30天" value="月结30天" />
                    <el-option label="预付30%" value="预付30%" />
                    <el-option label="货到付款" value="货到付款" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="信用代码">
                  <el-input v-model="form.taxId" placeholder="91310115..." />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="办公地址">
              <el-input v-model="form.address" type="textarea" :rows="2" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 资质证明 -->
        <el-tab-pane label="资质证明 (证照管理)" name="cert">
          <div class="cert-tab-pane py-6">
            <div class="flex justify-between items-center mb-6">
              <div class="flex items-center gap-2">
                <el-tag v-if="form.isCertified" size="small" type="success">已完成验资</el-tag>
                <span class="text-xs text-gray-400">请上传并维护供应商的合法经营及质量认证文件</span>
              </div>
              <el-button type="primary" plain size="small" :icon="Plus">添加新附件</el-button>
            </div>
            <el-table :data="form.certs" class="mini-table">
              <el-table-column label="文件名称" min-width="200">
                <template #default="{ row }">
                  <div class="flex items-center gap-2">
                    <el-icon class="text-blue-500"><Document /></el-icon>
                    <span class="text-sm font-bold">{{ row.title }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="有效期至" width="140" prop="expiry" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="certStatus(row).type" size="small" effect="plain">{{ certStatus(row).label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" align="right">
                <template #default>
                  <el-button link type="primary">查看</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="mt-6 p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
              <el-icon class="text-orange-500 mt-0.5"><WarningFilled /></el-icon>
              <p class="text-xs text-orange-700 leading-relaxed">
                <b>合规警示：</b> 核心供应商必须上传有效的营业执照与生产许可。证件过期前系统将暂停该供应商的入库单审批。
              </p>
            </div>
          </div>
        </el-tab-pane>

        <!-- 财务收款信息 -->
        <el-tab-pane label="财务收款信息" name="finance">
          <div class="finance-tab-pane py-8 px-4">
            <h5 class="text-sm font-black text-gray-900 mb-6 flex items-center gap-2">
              <el-icon class="text-blue-500"><Money /></el-icon>
              指定结算收款账户
            </h5>
            <el-form :model="form" label-width="100px" label-position="left">
              <div class="bg-gray-50 p-6 rounded-3xl border border-gray-100 mb-8">
                <el-row :gutter="20">
                  <el-col :span="12">
                    <el-form-item label="银行账号">
                      <el-input v-model="form.bankAccount" placeholder="请输入银行卡号" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="开户行">
                      <el-input v-model="form.bankName" placeholder="如：工行上海分行" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>
              <div class="grid grid-cols-2 gap-8">
                <div class="qr-uploader-box border-2 border-dashed border-gray-200 rounded-[32px] p-6 text-center hover:border-blue-400 transition-all group">
                  <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">支付宝收款码 (Alipay)</p>
                  <div class="w-32 h-32 bg-white rounded-2xl border border-gray-100 mx-auto flex items-center justify-center relative overflow-hidden shadow-sm">
                    <img v-if="form.alipayQR" :src="form.alipayQR" class="w-full h-full object-cover" />
                    <el-icon v-else size="32" class="text-gray-200"><Picture /></el-icon>
                  </div>
                  <el-button type="primary" link class="mt-4 font-black text-xs" @click="pickQr('alipay')">点击上传收款码</el-button>
                </div>
                <div class="qr-uploader-box border-2 border-dashed border-gray-200 rounded-[32px] p-6 text-center hover:border-[#67c23a] transition-all group">
                  <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">微信收款码 (WeChat)</p>
                  <div class="w-32 h-32 bg-white rounded-2xl border border-gray-100 mx-auto flex items-center justify-center relative overflow-hidden shadow-sm">
                    <img v-if="form.wechatQR" :src="form.wechatQR" class="w-full h-full object-cover" />
                    <el-icon v-else size="32" class="text-gray-200"><Picture /></el-icon>
                  </div>
                  <el-button type="success" link class="mt-4 font-black text-xs" @click="pickQr('wechat')">点击上传收款码</el-button>
                </div>
              </div>
              <input ref="qrInput" type="file" accept="image/*" class="hidden-input" @change="onQrChange" />
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div class="dialog-btns">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" class="px-8" @click="saveSupplier">保存档案</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Document, WarningFilled, Money, Picture, Download } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'
import { uploadImage } from '@/utils/upload'

// ── 收款码上传（先经 /api/open/upload 转存为图片 URL 再入库）──
const qrInput = ref(null)
const qrTarget = ref('')
function pickQr(target) {
  qrTarget.value = target
  qrInput.value?.click()
}
async function onQrChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const url = await uploadImage(file)
    if (qrTarget.value === 'alipay') form.alipayQR = url
    else form.wechatQR = url
    ElMessage.success('收款码已上传')
  } catch {
    ElMessage.error('收款码上传失败，请重试')
  }
  e.target.value = ''
}

// 保留现有数据拉取逻辑
const rawSuppliers = ref([])
async function loadSuppliers() {
  try {
    const res = await rowsApi.list('suppliers', { size: 200 })
    rawSuppliers.value = res?.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(loadSuppliers)

function localLevelToProto(level) {
  if (!level) return 'C'
  const c = level.charAt(0)
  return ['A', 'B', 'C'].includes(c) ? c : 'C'
}
function levelType(level) {
  return { A: 'danger', B: 'warning', C: 'info' }[level] || 'info'
}
function certStatus(row) {
  if (row.status === 'expired') return { label: '已失效', type: 'danger' }
  if (row.status === 'warning') return { label: '待更新', type: 'warning' }
  return { label: '有效', type: 'success' }
}

const suppliers = computed(() =>
  rawSuppliers.value.map((s) => ({
    ...s,
    level: localLevelToProto(s.level),
    paymentTerms: s.terms || '月结30天',
    categories: s.category ? [s.category] : [],
    isCertified: s.status === '已验资',
    alipayQR: s.alipay_qr || '',
    wechatQR: s.wechat_qr || '',
  }))
)

const searchQuery = ref('')
const filterLevel = ref('')
const filteredSuppliers = computed(() =>
  suppliers.value.filter((s) => {
    const k = !searchQuery.value || s.name.includes(searchQuery.value) || (s.contact && s.contact.includes(searchQuery.value))
    const l = !filterLevel.value || s.level === filterLevel.value
    return k && l
  })
)

// ── 导出 ──
function exportSuppliers() {
  if (!filteredSuppliers.value.length) {
    ElMessage.warning('当前筛选条件下没有可导出的供应商')
    return
  }
  const headers = ['供应商名称', '合作等级', '商务联系人', '联系电话', '结算条款', '供应品类', '验资状态', '办公地址']
  const rows = filteredSuppliers.value.map((s) => [
    s.name,
    `${s.level}级`,
    s.contact || '',
    s.phone || '',
    s.paymentTerms,
    (s.categories || []).join('、'),
    s.isCertified ? '已验资' : '待验资',
    s.address || '',
  ])
  exportCsv(`供应商名录_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 家供应商`)
}

// ── Dialog ──
const dialogVisible = ref(false)
const activePane = ref('base')
const form = reactive({
  id: null,
  name: '',
  contact: '',
  phone: '',
  level: 'B',
  paymentTerms: '月结30天',
  address: '',
  taxId: '',
  isCertified: false,
  certs: [],
  bankAccount: '',
  bankName: '',
  alipayQR: '',
  wechatQR: '',
})

function resetForm() {
  Object.assign(form, {
    id: null,
    name: '',
    contact: '',
    phone: '',
    level: 'B',
    paymentTerms: '月结30天',
    address: '',
    taxId: '',
    isCertified: false,
    certs: [],
    bankAccount: '',
    bankName: '',
    alipayQR: '',
    wechatQR: '',
  })
}
function openCreate() {
  resetForm()
  activePane.value = 'base'
  dialogVisible.value = true
}
function openEdit(row) {
  form.id = row.id
  form.name = row.name
  form.contact = row.contact || ''
  form.phone = row.phone || ''
  form.level = row.level
  form.paymentTerms = row.paymentTerms
  form.address = row.address || ''
  form.taxId = row.taxId || ''
  form.isCertified = row.isCertified
  form.certs = row.certs ? JSON.parse(JSON.stringify(row.certs)) : []
  form.bankAccount = row.bankAccount || ''
  form.bankName = row.bankName || ''
  form.alipayQR = row.alipayQR || ''
  form.wechatQR = row.wechatQR || ''
  activePane.value = 'base'
  dialogVisible.value = true
}
function saveSupplier() {
  const payload = {
    name: form.name,
    contact: form.contact,
    phone: form.phone,
    level: form.level + '级核心供应',
    terms: form.paymentTerms,
    category: form.certs.length ? form.certs[0] : '',
    status: form.isCertified ? '已验资' : '待验资',
    address: form.address,
    tax_id: form.taxId,
    bank_account: form.bankAccount,
    bank_name: form.bankName,
    alipay_qr: form.alipayQR,
    wechat_qr: form.wechatQR,
  }
  const req = form.id
    ? rowsApi.update('suppliers', form.id, payload)
    : rowsApi.create('suppliers', payload)
  req
    .then(() => {
      ElMessage.success(form.id ? '供应商综合档案已同步' : '供应商已创建')
      dialogVisible.value = false
      loadSuppliers()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '保存失败'))
}
</script>

<style scoped>
.hidden-input { display: none; }
.suppliers-page {
  padding: 0;
}

.table-card {
  border-radius: 24px;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.table-card :deep(.el-card__header) {
  padding: 22px 28px;
  border-bottom: none;
}
.table-card :deep(.el-card__body) {
  padding: 4px 28px 28px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
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

.filter-section {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}
.search-input {
  width: 300px;
}

.pro-table {
  --el-table-border-color: transparent;
}
.supplier-info {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 900;
  font-size: 14px;
  flex-shrink: 0;
}
.avatar-box.A {
  background: #f56c6c;
}
.avatar-box.B {
  background: #e6a23c;
}
.avatar-box.C {
  background: #909399;
}
.info-body .name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}
.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cat-tag {
  font-size: 11px;
  color: #4b5563;
  background: #f3f4f6;
  padding: 2px 10px;
  border-radius: 8px;
}

.supplier-tabs :deep(.el-tabs__item) {
  font-weight: 700;
}
.mini-table {
  --el-table-border-color: transparent;
}
.dialog-btns {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
