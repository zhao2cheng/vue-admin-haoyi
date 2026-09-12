<template>
  <div class="customers-page">
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="header-content">
          <div class="title-section">
            <h3>C 端客户管理</h3>
            <p>小程序下单客户按手机号自动归集，支持运营维护联系人与状态</p>
          </div>
          <el-button type="primary" plain :icon="Plus" @click="openCreate">手动新增客户</el-button>
        </div>
      </template>

      <div class="filter-section">
        <el-input
          v-model="searchPhone"
          placeholder="按手机号精确查询..."
          class="search-input"
          :prefix-icon="Search"
          clearable
        />
        <el-select v-model="filterStatus" placeholder="客户状态" clearable class="status-select">
          <el-option label="活跃" value="活跃" />
          <el-option label="沉默" value="沉默" />
          <el-option label="黑名单" value="黑名单" />
        </el-select>
      </div>

      <el-table :data="pagedCustomers" class="pro-table" style="width: 100%">
        <el-table-column label="客户" min-width="220">
          <template #default="{ row }">
            <div class="customer-info">
              <div :class="['avatar-box', statusCls(row.status)]">{{ row.name.substring(0, 2) }}</div>
              <div class="info-body">
                <p class="name">{{ row.name }}</p>
                <p class="phone font-mono">{{ row.phone }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="回收概况" min-width="180">
          <template #default="{ row }">
            <p class="text-sm font-bold text-gray-900">{{ row.order_count }} 单</p>
            <p class="text-xs text-gray-500 mt-1">累计 ¥{{ row.total_value }}</p>
          </template>
        </el-table-column>
        <el-table-column label="首次单号" width="170">
          <template #default="{ row }">
            <span class="font-mono text-xs text-gray-500">{{ row.first_order_no || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近下单" width="160">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ row.last_order_time || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="地址" min-width="160" prop="address" show-overflow-tooltip />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small" effect="plain">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <el-button link type="primary" class="text-sm font-bold" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" class="text-sm font-bold" @click="removeCustomer(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!filteredCustomers.length" description="暂无客户，小程序提交回收单后自动归集" />

      <!-- 分页：对筛选后的全集切片，搜索/状态筛选仍作用于全部数据 -->
      <div v-if="filteredCustomers.length" class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredCustomers.length"
          :page-sizes="[10, 20, 50, 100, 200]"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
        />
      </div>
    </el-card>

    <!-- ── Create / Edit Dialog ── -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑客户信息' : '手动新增客户'"
      width="560px"
      class="pro-dialog"
    >
      <el-form :model="form" label-width="100px" class="pt-6 pr-6">
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="客户手机号（唯一）" maxlength="11" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.name" placeholder="联系人 / 客户姓名（默认微信用户）" />
        </el-form-item>
        <el-form-item label="客户状态">
          <el-select v-model="form.status" class="w-full">
            <el-option label="活跃" value="活跃" />
            <el-option label="沉默" value="沉默" />
            <el-option label="黑名单" value="黑名单" />
          </el-select>
        </el-form-item>
        <el-form-item label="收货地址">
          <el-input v-model="form.address" type="textarea" :rows="2" placeholder="客户常用地址（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-btns">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" class="px-8" @click="saveCustomer">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'

const rawCustomers = ref([])
async function loadCustomers() {
  try {
    const res = await rowsApi.list('customers', { size: 500, sort: 'id', order: 'desc' })
    rawCustomers.value = res?.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(loadCustomers)

function statusCls(s) {
  return s === '黑名单' ? 'black' : s === '沉默' ? 'silent' : 'active'
}
function statusTag(s) {
  if (s === '黑名单') return 'danger'
  if (s === '沉默') return 'info'
  return 'success'
}

const searchPhone = ref('')
const filterStatus = ref('')
const filteredCustomers = computed(() =>
  rawCustomers.value.filter((c) => {
    const k = !searchPhone.value || c.phone === searchPhone.value
    const s = !filterStatus.value || c.status === filterStatus.value
    return k && s
  })
)

// 分页：对筛选后的全集切片，搜索/状态筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedCustomers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredCustomers.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([searchPhone, filterStatus], () => {
  currentPage.value = 1
})

// ── Dialog ──
const dialogVisible = ref(false)
const form = ref({ id: null, phone: '', name: '', status: '活跃', address: '' })

function resetForm() {
  form.value = { id: null, phone: '', name: '', status: '活跃', address: '' }
}
function openCreate() {
  resetForm()
  dialogVisible.value = true
}
function openEdit(row) {
  form.value = {
    id: row.id,
    phone: row.phone,
    name: row.name,
    status: row.status,
    address: row.address || '',
  }
  dialogVisible.value = true
}
function saveCustomer() {
  if (!form.value.phone) {
    ElMessage.warning('手机号不能为空')
    return
  }
  if (form.value.name && form.value.name.length > 20) {
    ElMessage.warning('姓名过长')
    return
  }
  const payload = {
    phone: form.value.phone,
    name: form.value.name || '微信用户',
    status: form.value.status,
    address: form.value.address,
  }
  const req = form.value.id
    ? rowsApi.update('customers', form.value.id, payload)
    : rowsApi.create('customers', payload)
  req
    .then(() => {
      ElMessage.success(form.value.id ? '客户信息已更新' : '客户已创建')
      dialogVisible.value = false
      loadCustomers()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '保存失败'))
}

function removeCustomer(row) {
  ElMessageBox.confirm(`确认删除客户「${row.name} (${row.phone})」？回收订单记录不受影响。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => rowsApi.remove('customers', row.id))
    .then(() => {
      ElMessage.success('客户已删除')
      loadCustomers()
    })
    .catch(() => {})
}
</script>

<style scoped>
.customers-page { padding: 0; }

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
.search-input { width: 260px; }

.pro-table { --el-table-border-color: transparent; }
.customer-info {
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
.avatar-box.active { background: #059669; }
.avatar-box.silent { background: #909399; }
.avatar-box.black { background: #ef4444; }
.info-body .name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}
.info-body .phone {
  font-size: 12px;
  color: #9ca3af;
  margin: 2px 0 0;
}
.dialog-btns {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
