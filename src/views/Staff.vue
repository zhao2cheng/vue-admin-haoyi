<template>
  <el-card shadow="never" class="staff-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <p class="eyebrow">企业组织与权限架构</p>
          <h3>员工与权限管理</h3>
          <p>管理部门组织树、分配职能权限及员工账号生命周期</p>
        </div>
      </div>
    </template>

    <el-row :gutter="20">
      <!-- 左栏：企业组织树 + 部门配置 -->
      <el-col :span="9">
        <div class="dept-card">
          <div class="dept-head">
            <h4 class="dept-title">企业组织树 (Dept Tree)</h4>
            <el-button size="small" type="primary" plain @click="dlgDept = true">
              <el-icon><FolderAdd /></el-icon>
              <span>创建新部门</span>
            </el-button>
          </div>

          <el-tree
            ref="treeRef"
            :data="orgTree"
            node-key="id"
            :props="{ children: 'children', label: 'label' }"
            :expand-on-click-node="false"
            default-expand-all
            class="dept-tree"
            @node-click="onDeptClick"
          >
            <template #default="{ data }">
              <div class="tree-node">
                <el-icon class="tree-ico"><FolderOpened /></el-icon>
                <span class="tree-label">{{ data.label }}</span>
                <span class="tree-count">{{ data.memberCount }} 人</span>
              </div>
            </template>
          </el-tree>

          <!-- 选中部门的配置面板 -->
          <div v-if="selectedDept" class="dept-panel">
            <div class="dp-id">部门唯一标识: DEPT-{{ selectedDept.code }}</div>

            <div class="dp-block">
              <div class="dp-cap">部门默认权限模板 (Default Policy)</div>
              <div class="dp-domain" v-for="dom in domains" :key="dom.name">
                <div class="dp-domain-h">{{ dom.name }}</div>
                <div class="dp-domain-items">
                  <span v-for="it in dom.items" :key="it" class="dp-chip">{{ it }}</span>
                </div>
              </div>
            </div>

            <div class="dp-block">
              <div class="dp-cap">部门成员清单 (Staff List)</div>
              <div class="dp-members">
                <span v-if="deptMembers.length === 0" class="dp-empty">暂无成员</span>
                <span v-for="m in deptMembers" :key="m.id" class="dp-member">
                  <el-avatar :size="22" class="dp-ava">{{ m.name.charAt(0) }}</el-avatar>
                  {{ m.name }}
                </span>
              </div>
            </div>

            <div class="dp-actions">
              <el-button size="small" type="danger" plain @click="removeDept">撤销该部门</el-button>
              <el-button size="small" type="primary" @click="saveDept">保存部门架构配置</el-button>
            </div>
          </div>
          <div v-else class="dept-hint">请从左侧选择一个部门进行架构配置</div>
        </div>
      </el-col>

      <!-- 右栏：员工与账号 -->
      <el-col :span="15">
        <div class="staff-head">
          <h4 class="staff-title">员工与账号</h4>
          <div class="staff-actions">
            <el-input
              v-model="searchQuery"
              placeholder="搜索姓名、账号..."
              :prefix-icon="Search"
              clearable
              class="search-input"
            />
            <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select">
              <el-option label="正常" value="正常" />
              <el-option label="停用" value="停用" />
            </el-select>
            <el-button :icon="Download" @click="exportStaff">导出员工</el-button>
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>
              <span>新建账号</span>
            </el-button>
          </div>
        </div>

        <el-table :data="filteredStaff" stripe class="staff-table">
          <el-table-column label="员工" min-width="200">
            <template #default="{ row }">
              <div class="staff-cell">
                <el-avatar :size="36" class="staff-ava">{{ row.name.charAt(0) }}</el-avatar>
                <div class="staff-meta">
                  <div class="staff-name">{{ row.name }}</div>
                  <div class="staff-acc">{{ row.username }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="所属组织 (部门)" width="130">
            <template #default="{ row }">
              <el-tag size="small" type="info" effect="plain">{{ row.dept }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="职能角色" width="120">
            <template #default="{ row }">
              <el-tag size="small" type="success" effect="plain">{{ row.role }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="账号状态" width="120">
            <template #default="{ row }">
              <div class="status-cell">
                <span class="status-dot" :class="row.status === '正常' ? 'on' : 'off'"></span>
                <span class="status-text">{{ row.status }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="openEdit(row)">资料编辑</el-button>
              <el-button text size="small" @click="openPerm(row)">权限同步</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-col>
    </el-row>

    <!-- 弹窗：员工档案设置 (录入/编辑共用) -->
    <el-dialog v-model="dlgProfile" :title="profileIsEdit ? '编辑员工档案' : '新建账号'" width="620px" :close-on-click-modal="false">
      <el-form :model="profileForm" label-width="90px" class="profile-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="真实姓名">
              <el-input v-model="profileForm.name" placeholder="请输入真实姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="登录账号">
              <el-input v-model="profileForm.username" placeholder="如 @WANGWU">
                <template #prepend>@</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属组织">
              <el-select v-model="profileForm.dept" class="w-full" placeholder="选择部门">
                <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="职能角色">
              <el-select v-model="profileForm.roleId" class="w-full" placeholder="选择角色">
                <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="初始密码">
              <el-input v-model="profileForm.password" type="password" show-password placeholder="留空默认 123456" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dlgProfile = false">取消</el-button>
        <el-button type="primary" :loading="profileSaving" @click="submitProfile">{{ profileIsEdit ? '保存修改' : '创建账号' }}</el-button>
      </template>
    </el-dialog>

    <!-- 弹窗：创建新组织部门 -->
    <el-dialog v-model="dlgDept" title="创建新组织部门" width="440px" :close-on-click-modal="false">
      <el-alert
        type="warning" :closable="false" show-icon class="mb-6"
        title="系统警告：撤销部门将导致关联账号权限丢失"
      />
      <el-form :model="deptForm" label-width="80px">
        <el-form-item label="部门名称">
          <el-input v-model="deptForm.name" placeholder="如：售后技术组" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="deptForm.parent" class="w-full" placeholder="留空为一级部门" clearable>
            <el-option v-for="d in flatDepts" :key="d.id" :label="d.label" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="职能描述">
          <el-input v-model="deptForm.desc" type="textarea" :rows="2" placeholder="简述部门业务边界..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgDept = false">取消</el-button>
        <el-button type="primary" @click="submitDept">确认创建并同步</el-button>
      </template>
    </el-dialog>

    <!-- 弹窗：权限同步 -->
    <el-dialog v-model="dlgPerm" title="权限同步" width="500px" :close-on-click-modal="false">
      <div class="perm-tip">
        <el-icon class="perm-ico"><WarningFilled /></el-icon>
        <span>同步操作将覆盖目标系统上的现有权限配置，请谨慎操作。</span>
      </div>
      <el-form :model="permForm" label-width="80px">
        <el-form-item label="目标系统">
          <el-checkbox-group v-model="permForm.targets">
            <el-checkbox label="后台管理" />
            <el-checkbox label="小程序" />
            <el-checkbox label="技师端" />
            <el-checkbox label="供应商门户" />
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="权限模板">
          <el-select v-model="permForm.template" class="w-full" placeholder="请选择权限模板">
            <el-option label="销售经理标准权限" value="sales_manager" />
            <el-option label="管理员全权限" value="admin_full" />
            <el-option label="运营人员标准权限" value="ops_standard" />
            <el-option label="只读查看权限" value="readonly" />
          </el-select>
        </el-form-item>
        <el-form-item label="同步备注">
          <el-input v-model="permForm.remark" type="textarea" :rows="2" placeholder="记录此次同步操作的原因..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgPerm = false">取消</el-button>
        <el-button type="primary" @click="submitPerm">开始同步</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { rowsApi, txApi } from '@/api/rows'
import {
  Plus, FolderAdd, FolderOpened, WarningFilled, EditPen, Delete, Download, Search
} from '@element-plus/icons-vue'
import { exportCsv, nowStamp } from '@/utils/export'

const departments = ref([])
const staffData = ref([])

// 从关系型后端加载部门与员工（真正持久化）
async function loadAll() {
  try {
    const [dRes, sRes, rRes] = await Promise.all([
      rowsApi.list('departments', { size: 200 }),
      rowsApi.list('staff', { size: 200 }),
      rowsApi.list('roles', { size: 200 }),
    ])
    roleOptions.value = (rRes?.data?.list || []).map((r) => ({ id: r.id, name: r.name }))
    const depts = dRes?.data?.list || []
    departments.value = depts
    const staffList = sRes?.data?.list || []
    staffData.value = staffList.map((s) => ({
      id: s.id,
      name: s.name,
      username: s.username,
      deptId: s.dept_id,
      dept: depts.find((d) => d.id === s.dept_id)?.name || '—',
      role: s.role,
      status: s.status || '正常',
    }))
  } catch (e) {
    ElMessage.error('数据加载失败，请检查后端服务是否正常')
  }
}
onMounted(loadAll)

const deptOptions = computed(() => departments.value.map((d) => d.name))
const roleOptions = ref([]) // [{ id, name }]，从 roles 表动态加载

// ── 员工列表筛选：关键字 / 账号状态 ──
const searchQuery = ref('')
const statusFilter = ref('')

const filteredStaff = computed(() => {
  let data = staffData.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter((s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.username || '').toLowerCase().includes(q)
    )
  }
  if (statusFilter.value) {
    data = data.filter((s) => (s.status || '正常') === statusFilter.value)
  }
  return data
})

// ── 导出 ──
function exportStaff() {
  const list = filteredStaff.value
  if (!list.length) {
    ElMessage.warning('暂无员工数据可导出')
    return
  }
  const headers = ['姓名', '登录账号', '所属部门', '职能角色', '账号状态']
  const rows = list.map((s) => [
    s.name,
    s.username || '',
    s.dept || '—',
    s.role || '—',
    s.status || '正常',
  ])
  exportCsv(`员工账号_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 名员工`)
}

// ── 组织树（由后端部门生成）──
const orgTree = computed(() => {
  const memberCount = (id) => staffData.value.filter((s) => s.deptId === id).length
  return departments.value.map((d) => ({
    id: d.id,
    label: d.name,
    code: d.id,
    memberCount: memberCount(d.id),
  }))
})
const flatDepts = computed(() => {
  const out = []
  const walk = (list) => list.forEach((n) => { out.push(n); if (n.children) walk(n.children) })
  walk(orgTree.value)
  return out
})

const selectedDept = ref(null)
function onDeptClick(data) {
  selectedDept.value = data
}
const deptMembers = computed(() => {
  if (!selectedDept.value) return []
  return staffData.value.filter((s) => s.deptId === selectedDept.value.id)
})

const domains = [
  { name: '销售域', items: ['新建订单', '管理客户', '导出数据', '业绩核算'] },
  { name: '资产域', items: ['资产入库', '批次追踪', '仓位调拨', '损益上报'] },
]

function removeDept() {
  if (!selectedDept.value) return
  ElMessageBox.confirm('撤销部门将导致关联账号权限丢失，确认继续？', '系统警告', { type: 'warning' })
    .then(async () => {
      try {
        await rowsApi.remove('departments', selectedDept.value.id)
        ElMessage.success('部门已撤销')
        selectedDept.value = null
        loadAll()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '撤销失败（可能仍有成员）')
      }
    })
    .catch(() => {})
}
async function saveDept() {
  if (!selectedDept.value) return
  try {
    await rowsApi.update('departments', selectedDept.value.id, {
      description: selectedDept.value.description || '',
    })
    ElMessage.success('组织机构已成功更新')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

// ── 员工档案设置弹窗（录入/编辑共用）──
const dlgProfile = ref(false)
const profileIsEdit = ref(false)
const profileSaving = ref(false) // 防双击重复提交（双击会导致第二次请求报“账号已存在”）
const profileForm = reactive({ id: null, name: '', username: '', dept: '', role: '', roleId: null, password: '' })
function openCreate() {
  profileIsEdit.value = false
  Object.assign(profileForm, { id: null, name: '', username: '', dept: '', role: '', roleId: null, password: '' })
  dlgProfile.value = true
}
function openEdit(row) {
  profileIsEdit.value = true
  Object.assign(profileForm, {
    id: row.id, name: row.name, username: row.username.replace('@', ''),
    dept: row.dept, role: row.role, roleId: row.role_id || null, password: '',
  })
  dlgProfile.value = true
}
function submitProfile() {
  if (profileSaving.value) return // 请求进行中，忽略重复点击
  if (!profileForm.name) return ElMessage.warning('请填写完整档案信息')
  if (!profileForm.username) return ElMessage.warning('请填写登录账号')
  profileSaving.value = true
  const done = () => { profileSaving.value = false }
  const deptId = departments.value.find((d) => d.name === profileForm.dept)?.id
  const roleName = roleOptions.value.find((r) => r.id === profileForm.roleId)?.name || profileForm.role

  if (profileIsEdit.value && profileForm.id) {
    // 编辑：更新员工档案 + 同步登录账号（姓名/角色）
    Promise.all([
      rowsApi.update('staff', profileForm.id, {
        name: profileForm.name,
        username: '@' + profileForm.username.replace('@', ''),
        dept_id: deptId || null,
        role: roleName,
        role_id: profileForm.roleId || null,
        status: '正常',
      }),
      rowsApi
        .list('users', { size: 1, filter: JSON.stringify({ username: profileForm.username.replace('@', '').toLowerCase() }) })
        .then((res) => {
          const uid = res?.data?.list?.[0]?.id
          if (uid) return rowsApi.update('users', uid, { real_name: profileForm.name, role_id: profileForm.roleId || null })
        }),
    ])
      .then(() => {
        ElMessage.success('员工档案与登录账号已同步')
        dlgProfile.value = false
        loadAll()
      })
      .catch((e) => {
        ElMessage.error(e?.response?.data?.message || '保存失败')
        loadAll() // 失败也刷新：若首次请求实际已成功，列表里能看到账号
      })
      .finally(done)
    return
  }

  // 新增：员工档案 + 登录账号同一事务创建
  txApi
    .staffCreate({
      name: profileForm.name,
      username: profileForm.username,
      deptId: deptId || null,
      roleId: profileForm.roleId || null,
      password: profileForm.password || undefined,
    })
    .then((res) => {
      ElMessage.success(`员工与登录账号已创建（初始密码 ${res?.data?.initialPassword || '123456'}）`)
      dlgProfile.value = false
      loadAll()
    })
    .catch((e) => {
      ElMessage.error(e?.response?.data?.message || '创建失败')
      loadAll() // 失败也刷新：双击场景下首次请求已建号，刷新后立即可见
    })
    .finally(done)
}

// ── 创建新部门弹窗 ──
const dlgDept = ref(false)
const deptForm = reactive({ name: '', parent: '', desc: '' })
function submitDept() {
  if (!deptForm.name) return ElMessage.warning('请填写部门名称')
  rowsApi
    .create('departments', { name: deptForm.name, description: deptForm.desc || '' })
    .then(() => {
      ElMessage.success('部门已创建并同步')
      dlgDept.value = false
      deptForm.name = ''; deptForm.parent = ''; deptForm.desc = ''
      loadAll()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '创建失败'))
}

// ── 权限同步弹窗 ──
const dlgPerm = ref(false)
const permForm = reactive({ targets: ['后台管理', '小程序'], template: '', remark: '' })
function openPerm() {
  permForm.targets = ['后台管理', '小程序']
  permForm.template = ''
  permForm.remark = ''
  dlgPerm.value = true
}
function submitPerm() {
  if (!permForm.template) return ElMessage.warning('请选择权限模板')
  txApi.permissionSync({ template: permForm.template, remark: permForm.remark || '' })
    .then((r) => {
      ElMessage.success(`权限同步完成，已对齐 ${r?.data?.updated ?? 0} 个角色`)
      dlgPerm.value = false
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '权限同步失败'))
}
</script>

<style scoped>
.staff-card {
  border-radius: 24px;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.header-content { display: flex; align-items: center; justify-content: space-between; }
.eyebrow {
  font-size: 10px; font-weight: 900; color: #9ca3af;
  text-transform: uppercase; letter-spacing: 0.2em; margin: 0 0 6px;
}
.title-section h3 { margin: 0; font-size: 20px; font-weight: 900; color: #111827; }
.title-section p { margin: 4px 0 0; font-size: 12px; color: #9ca3af; }

/* 左栏：组织树 */
.dept-card {
  background: #f8fafc; border: 1px solid #eef2f7; border-radius: 20px;
  padding: 18px; height: 100%; min-height: 480px;
}
.dept-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.dept-title { margin: 0; font-size: 14px; font-weight: 900; color: #111827; letter-spacing: .02em; }
.dept-tree { background: transparent; }
.dept-tree :deep(.el-tree-node__content) { border-radius: 10px; height: 36px; }
.tree-node { display: flex; align-items: center; gap: 8px; width: 100%; }
.tree-ico { color: #60a5fa; font-size: 15px; }
.tree-label { font-size: 13px; font-weight: 700; color: #374151; }
.tree-count { margin-left: auto; font-size: 11px; color: #9ca3af; font-weight: 600; }

.dept-panel {
  margin-top: 16px; padding: 16px; background: #fff;
  border: 1px solid #e5e7eb; border-radius: 16px;
}
.dp-id {
  font-size: 12px; font-weight: 800; color: #1d4ed8;
  background: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px;
  padding: 8px 12px; margin-bottom: 14px; font-family: ui-monospace, monospace;
}
.dp-block { margin-bottom: 16px; }
.dp-cap {
  font-size: 10px; font-weight: 900; color: #9ca3af;
  text-transform: uppercase; letter-spacing: .12em; margin-bottom: 10px;
}
.dp-domain { margin-bottom: 10px; }
.dp-domain-h { font-size: 12px; font-weight: 800; color: #374151; margin-bottom: 6px; }
.dp-domain-items { display: flex; flex-wrap: wrap; gap: 6px; }
.dp-chip {
  font-size: 11px; font-weight: 700; color: #475569;
  background: #f1f5f9; border-radius: 9999px; padding: 3px 10px;
}
.dp-members { display: flex; flex-wrap: wrap; gap: 8px; }
.dp-empty { font-size: 12px; color: #9ca3af; }
.dp-member {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 700; color: #374151;
  background: #f8fafc; border: 1px solid #eef2f7; border-radius: 9999px; padding: 2px 10px 2px 2px;
}
.dp-ava { background: linear-gradient(135deg, #111827, #374151); color: #fff; font-weight: 700; }
.dp-actions { display: flex; gap: 10px; margin-top: 4px; }
.dept-hint { margin-top: 16px; font-size: 12px; color: #9ca3af; text-align: center; }

/* 右栏：员工表 */
.staff-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.staff-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.staff-actions .search-input { width: 200px; }
.staff-actions .status-select { width: 110px; }
.staff-title { margin: 0; font-size: 16px; font-weight: 900; color: #111827; }
.staff-table { border-radius: 16px; overflow: hidden; }
.staff-cell { display: flex; align-items: center; gap: 12px; }
.staff-ava { background: linear-gradient(135deg, #111827, #374151); color: #fff; font-weight: 700; font-size: 14px; }
.staff-name { font-size: 13px; font-weight: 800; color: #111827; line-height: 1.3; }
.staff-acc { font-size: 11px; color: #9ca3af; margin-top: 2px; font-family: ui-monospace, monospace; }
.status-cell { display: flex; align-items: center; gap: 6px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; }
.status-dot.on { background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.15); }
.status-dot.off { background: #d1d5db; }
.status-text { font-size: 12px; font-weight: 700; color: #374151; }

/* 弹窗通用 */
.profile-form { margin-top: 6px; }
.w-full { width: 100%; }
.mb-6 { margin-bottom: 24px; }
.perm-tip {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px;
  border-radius: 14px; background: #fffbeb; border: 1px solid #fde68a;
  font-size: 12px; color: #92400e; margin-bottom: 20px; line-height: 1.6;
}
.perm-ico { color: #f59e0b; flex-shrink: 0; margin-top: 1px; }

.staff-card :deep(.el-table__header th) {
  background: transparent !important;
  font-size: 10px !important; font-weight: 900 !important;
  text-transform: uppercase; letter-spacing: .1em; color: #9ca3af !important;
}
.staff-card :deep(.el-table__body td) { padding-top: 12px; padding-bottom: 12px; }

@media (max-width: 1100px) {
  .dept-card { min-height: auto; }
}
</style>
