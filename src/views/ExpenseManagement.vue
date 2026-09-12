<template>
  <div class="expense-page">
    <!-- 顶部统计卡 -->
    <el-card shadow="never" class="top-card">
      <div class="top-inner">
        <div class="stat-main">
          <p class="stat-label">本月申请报销</p>
          <p class="stat-value">¥{{ fmtMoney(stats.monthTotal) }}</p>
          <p class="stat-sub">
            <span class="dot pending-dot"></span>{{ stats.pendingCount }} 笔待审批
          </p>
        </div>
        <div class="top-divider"></div>
        <div class="mini-list">
          <div class="mini">
            <p class="mini-label">本月已通过</p>
            <p class="mini-value c-emerald">¥{{ fmtMoney(stats.monthApproved) }}</p>
          </div>
          <div class="mini">
            <p class="mini-label">待审批笔数</p>
            <p class="mini-value orange">{{ stats.pendingCount }}</p>
          </div>
          <div class="mini">
            <p class="mini-label">累计报销单</p>
            <p class="mini-value">{{ claims.length }}</p>
          </div>
        </div>
        <el-button :icon="Refresh" circle class="refresh-btn" @click="refreshAll" />
      </div>
    </el-card>

    <!-- 报销单列表 -->
    <el-card shadow="never" class="section-card">
      <div class="pane-head">
        <div class="pane-title">
          <h3>费用报销单</h3>
          <el-tag type="success" size="small" effect="plain" class="title-tag">小程序提交 · 后台审批</el-tag>
        </div>
        <div class="filter-bar">
          <!-- 状态筛选 -->
          <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select" @change="loadClaims">
            <el-option label="待审批" value="待审批" />
            <el-option label="已通过" value="已通过" />
            <el-option label="已驳回" value="已驳回" />
            <el-option label="已撤销" value="已撤销" />
          </el-select>
          <el-input
            v-model="searchText"
            placeholder="搜索单号 / 申请人 / 类型 / 事由..."
            :prefix-icon="Search"
            clearable
            class="search-input"
            @input="loadClaims"
          />
          <el-button :icon="Download" size="small" @click="exportClaims">导出</el-button>
        </div>
      </div>

      <el-table :data="pagedList" v-loading="loading" stripe @row-click="openDetail">
        <el-table-column label="报销单号" width="150">
          <template #default="{ row }">
            <span class="mono c-blue claim-no">{{ row.claim_no }}</span>
          </template>
        </el-table-column>
        <el-table-column label="申请人" min-width="120">
          <template #default="{ row }">
            <div class="applicant-cell">
              <span class="applicant-name">{{ row.applicant || '—' }}</span>
              <el-tag v-if="row.role === 'salesman'" size="small" type="warning" effect="plain" class="role-tag">业务员</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="费用类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" class="type-tag">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报销金额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount-text">¥{{ fmtMoney(parseMoney(row.amount)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="费用日期" width="110" align="center" prop="date" />
        <el-table-column label="发票" width="80" align="center">
          <template #default="{ row }">
            {{ row.invoice_count || 0 }} 张
          </template>
        </el-table-column>
        <el-table-column label="附件" width="110" align="center">
          <template #default="{ row }">
            <span v-if="attCount(row) > 0" class="att-count">📎 {{ attCount(row) }}</span>
            <span v-else class="no-att">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="light" class="status-tag">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="165">
          <template #default="{ row }"><span class="mono time-text">{{ row.created_at }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click.stop="openDetail(row)">详情</el-button>
            <template v-if="row.status === '待审批'">
              <el-button link type="success" size="small" @click.stop="openApprove(row)">通过</el-button>
              <el-button link type="danger" size="small" @click.stop="openReject(row)">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-box">
        <el-empty description="暂无符合条件的报销单" :image-size="80" />
      </div>

      <!-- 分页：对筛选后的全集切片，状态/搜索筛选仍作用于全部数据 -->
      <div v-if="list.length" class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="list.length"
          :page-sizes="[10, 20, 50, 100, 200]"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
        />
      </div>
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="报销单详情" size="460px" class="detail-drawer">
      <div v-if="detail" class="detail-body">
        <!-- 状态横幅 -->
        <div class="detail-banner" :class="'banner-' + statusKey(detail.status)">
          <div class="banner-icon">{{ statusIcon(detail.status) }}</div>
          <div class="banner-text">
            <div class="banner-title">{{ detail.status }}</div>
            <div class="banner-sub">
              {{ detail.status === '已驳回' ? (detail.review_remark || '无备注') : (detail.status === '待审批' ? '等待管理员审批' : (detail.review_remark || '同意报销')) }}
            </div>
          </div>
        </div>

        <div class="detail-amount-row">
          <span class="detail-amount-label">报销金额</span>
          <span class="detail-amount">¥{{ fmtMoney(parseMoney(detail.amount)) }}</span>
        </div>

        <el-descriptions :column="2" border class="detail-desc">
          <el-descriptions-item label="单号" :span="2">
            <span class="mono">{{ detail.claim_no }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.applicant || '—' }}</el-descriptions-item>
          <el-descriptions-item label="身份">
            <el-tag v-if="detail.role === 'salesman'" size="small" type="warning" effect="plain">业务员</el-tag>
            <el-tag v-else size="small" type="info" effect="plain">员工</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="费用类型">
            <el-tag size="small" effect="plain" class="type-tag">{{ detail.type }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发票张数">{{ detail.invoice_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="费用日期">{{ detail.date }}</el-descriptions-item>
          <el-descriptions-item label="提交时间" :span="2">
            <span class="mono">{{ detail.created_at }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="报销事由" :span="2">
            <span class="reason-text">{{ detail.reason || '—' }}</span>
          </el-descriptions-item>
          <template v-if="detail.status !== '待审批' && detail.status !== '已撤销'">
            <el-descriptions-item label="审批时间" :span="2">
              <span class="mono">{{ detail.review_time || '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="审批意见" :span="2">
              <span class="reason-text">{{ detail.review_remark || '—' }}</span>
            </el-descriptions-item>
          </template>
        </el-descriptions>

        <!-- 附件 -->
        <div v-if="detailAtts.length" class="detail-section">
          <div class="section-title">附件凭证（{{ detailAtts.length }}）</div>
          <div class="att-thumbs" v-if="detailImgs.length">
            <el-image
              v-for="(a, i) in detailImgs" :key="i"
              :src="a.path || ''"
              :preview-src-list="detailImgs.map(x => x.path).filter(Boolean)"
              :initial-index="i"
              fit="cover"
              class="att-thumb"
            >
              <template #error>
                <div class="att-thumb-fallback">{{ a.name }}</div>
              </template>
            </el-image>
          </div>
          <div v-if="detailFiles.length" class="file-list">
            <div v-for="(a, i) in detailFiles" :key="i" class="file-row">
              <span class="file-icon">📄</span>
              <span class="file-name">{{ a.name }}</span>
              <span class="file-size">{{ fmtSize(a.size) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="detail-section">
          <div class="section-title">附件凭证</div>
          <div class="no-att-text">无附件</div>
        </div>

        <!-- 操作按钮 -->
        <div v-if="detail.status === '待审批'" class="detail-actions">
          <el-button class="reject-btn" size="large" @click="openReject(detail)">驳 回</el-button>
          <el-button class="approve-btn" size="large" @click="openApprove(detail)">通 过</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 审批弹窗：通过 -->
    <el-dialog v-model="approveVisible" title="通过报销" width="460px">
      <p class="dialog-tip">报销单 <b>{{ approveRow?.claim_no }}</b> · ¥{{ fmtMoney(parseMoney(approveRow?.amount)) }}</p>
      <el-input v-model="approveRemark" type="textarea" :rows="3" placeholder="审批备注（可留空，默认「同意报销」）" maxlength="100" show-word-limit />
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button class="approve-btn" :loading="submitting" @click="submitApprove">确认通过</el-button>
      </template>
    </el-dialog>

    <!-- 审批弹窗：驳回 -->
    <el-dialog v-model="rejectVisible" title="驳回报销" width="460px">
      <p class="dialog-tip">报销单 <b>{{ rejectRow?.claim_no }}</b> · ¥{{ fmtMoney(parseMoney(rejectRow?.amount)) }}</p>
      <el-input v-model="rejectRemark" type="textarea" :rows="3" placeholder="请填写驳回原因（必填）" maxlength="200" show-word-limit />
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button class="reject-btn" :loading="submitting" @click="submitReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, Download } from '@element-plus/icons-vue'
import { rowsApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'

const parseMoney = (s) => { const n = parseFloat(String(s ?? '0').replace(/,/g, '')); return isNaN(n) ? 0 : n }
const fmtMoney = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtSize = (b) => { const n = Number(b) || 0; return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + 'MB' : n >= 1024 ? (n / 1024).toFixed(0) + 'KB' : n + 'B' }

const loading = ref(false)
const claims = ref([])
const statusFilter = ref('')
const searchText = ref('')

// ── 统计 ──
const stats = computed(() => {
  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthList = claims.value.filter((c) => (c.date || '').slice(0, 7) === monthPrefix)
  const sum = (arr) => arr.reduce((s, c) => s + parseMoney(c.amount), 0)
  return {
    monthTotal: sum(monthList.filter((c) => c.status !== '已驳回' && c.status !== '已撤销')),
    monthApproved: sum(monthList.filter((c) => c.status === '已通过')),
    pendingCount: claims.value.filter((c) => c.status === '待审批').length,
  }
})

// ── 列表（含筛选）──
const list = computed(() => {
  let data = claims.value
  if (statusFilter.value) data = data.filter((c) => c.status === statusFilter.value)
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    data = data.filter((c) =>
      (c.claim_no || '').toLowerCase().includes(q) ||
      (c.applicant || '').toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q) ||
      (c.reason || '').toLowerCase().includes(q)
    )
  }
  return data
})

// 分页：对筛选后的全集切片，状态/搜索筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return list.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([statusFilter, searchText, () => claims.value.length], () => {
  currentPage.value = 1
})

async function loadClaims() {
  loading.value = true
  try {
    const res = await rowsApi.list('expense_claims', { size: 200, sort: 'id', order: 'desc' })
    claims.value = res?.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败：' + (e?.response?.data?.message || e.message))
  } finally {
    loading.value = false
  }
}
onMounted(loadClaims)
function refreshAll() { loadClaims().then(() => ElMessage.success('数据已同步')) }

// ── 状态展示 ──
const statusType = (s) => ({ '待审批': 'warning', '已通过': 'success', '已驳回': 'danger', '已撤销': 'info' }[s] || 'info')
const statusKey = (s) => ({ '待审批': 'pending', '已通过': 'approved', '已驳回': 'rejected', '已撤销': 'withdrawn' }[s] || 'info')
const statusIcon = (s) => ({ '待审批': '⏳', '已通过': '✅', '已驳回': '❌', '已撤销': '↩️' }[s] || '📋')
const attCount = (row) => { try { return (JSON.parse(row.attachments || '[]') || []).length } catch { return 0 } }

// ── 详情 ──
const detailVisible = ref(false)
const detail = ref(null)
const detailAtts = computed(() => { try { return JSON.parse(detail.value?.attachments || '[]') || [] } catch { return [] } })
const detailImgs = computed(() => detailAtts.value.filter((a) => a.kind === 'image'))
const detailFiles = computed(() => detailAtts.value.filter((a) => a.kind === 'file'))

function openDetail(row) {
  detail.value = row
  detailVisible.value = true
}

// ── 审批 ──
const approveVisible = ref(false)
const rejectVisible = ref(false)
const approveRow = ref(null)
const rejectRow = ref(null)
const approveRemark = ref('')
const rejectRemark = ref('')
const submitting = ref(false)

function openApprove(row) { approveRow.value = row; approveRemark.value = ''; approveVisible.value = true }
function openReject(row) { rejectRow.value = row; rejectRemark.value = ''; rejectVisible.value = true }

async function submitApprove() {
  submitting.value = true
  try {
    await rowsApi.update('expense_claims', approveRow.value.id, {
      status: '已通过',
      review_remark: approveRemark.value.trim() || '同意报销',
      review_time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    })
    // 通知申请人（后台消息中心）
    try {
      await rowsApi.create('notifications', {
        type: 'system', title: '✅ 报销已通过',
        content: `报销单 ${approveRow.value.claim_no}（${approveRow.value.type} ¥${approveRow.value.amount}）已通过审批。`,
        ref_id: approveRow.value.claim_no, source: 'system', read: 0,
      })
    } catch (e) { /* 通知失败不影响审批 */ }
    ElMessage.success('已通过')
    approveVisible.value = false
    loadClaims()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function submitReject() {
  if (!rejectRemark.value.trim()) return ElMessage.warning('请填写驳回原因')
  submitting.value = true
  try {
    await rowsApi.update('expense_claims', rejectRow.value.id, {
      status: '已驳回',
      review_remark: rejectRemark.value.trim(),
      review_time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    })
    try {
      await rowsApi.create('notifications', {
        type: 'system', title: '❌ 报销已驳回',
        content: `报销单 ${rejectRow.value.claim_no}（${rejectRow.value.type} ¥${rejectRow.value.amount}）未通过审批：${rejectRemark.value.trim()}。`,
        ref_id: rejectRow.value.claim_no, source: 'system', read: 0,
      })
    } catch (e) { /* 通知失败不影响审批 */ }
    ElMessage.success('已驳回')
    rejectVisible.value = false
    loadClaims()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// ── 导出 ──
function exportClaims() {
  if (!list.value.length) return ElMessage.warning('当前没有可导出的报销单')
  exportCsv(`费用报销单_${nowStamp()}.csv`,
    ['报销单号', '申请人', '身份', '费用类型', '金额(元)', '费用日期', '发票张数', '状态', '报销事由', '提交时间'],
    list.value.map((c) => [
      c.claim_no || '', c.applicant || '', c.role === 'salesman' ? '业务员' : '员工',
      c.type || '', parseMoney(c.amount).toFixed(2), c.date || '', c.invoice_count || 0,
      c.status || '', c.reason || '', c.created_at || '',
    ])
  )
  ElMessage.success(`已导出 ${list.value.length} 条报销单`)
}
</script>

<style scoped>
.expense-page { display: flex; flex-direction: column; gap: 16px; }

/* 顶部统计卡 */
.top-card { border-radius: 28px; border: 1px solid #f0f2f5; }
.top-inner { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; }
.stat-main .stat-label { font-size: 11px; font-weight: 800; color: #9ca3af; letter-spacing: .15em; text-transform: uppercase; margin: 0 0 8px; }
.stat-main .stat-value { font-size: 34px; font-weight: 900; color: #111827; margin: 0; line-height: 1; }
.stat-main .stat-sub { font-size: 11px; font-weight: 700; color: #6b7280; margin: 8px 0 0; display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pending-dot { background: #f97316; }
.top-divider { width: 1px; height: 48px; background: #f3f4f6; }
.mini-list { display: flex; gap: 36px; }
.mini-label { font-size: 11px; font-weight: 700; color: #9ca3af; margin: 0 0 6px; }
.mini-value { font-size: 20px; font-weight: 900; color: #374151; margin: 0; }
.mini-value.orange { color: #f97316; }
.refresh-btn { border-radius: 9999px; }

/* 列表卡 */
.section-card { border-radius: 28px; border: 1px solid #f0f2f5; }
.pane-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 12px; }
.pane-title { display: flex; align-items: center; gap: 10px; }
.pane-title h3 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.title-tag { border-radius: 8px; font-weight: 700; }
.filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-bar .search-input { width: 240px; }
.status-select { width: 130px; }

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }
.c-blue { color: #2563eb; }
.c-emerald { color: #059669; font-weight: 700; }
.claim-no { font-size: 12px; }
.applicant-cell { display: flex; align-items: center; gap: 6px; }
.applicant-name { font-weight: 700; color: #1f2937; }
.role-tag { border-radius: 6px; }
.type-tag { border-radius: 6px; font-weight: 700; background: #d1fae5; color: #059669; border-color: #a7f3d0; }
.amount-text { font-size: 15px; font-weight: 900; color: #111827; }
.att-count { font-size: 12px; font-weight: 700; color: #6b7280; }
.no-att { color: #d1d5db; }
.status-tag { border-radius: 8px; font-weight: 700; }
.time-text { font-size: 12px; color: #6b7280; }

.empty-box { padding: 24px 0; }
.detail-drawer :deep(.el-drawer__body) { padding: 20px 24px; }

/* 详情 */
.detail-body { display: flex; flex-direction: column; gap: 16px; }
.detail-banner {
  display: flex; align-items: center; gap: 14px;
  border-radius: 16px; padding: 16px 18px;
}
.banner-pending { background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1px solid #fde68a; }
.banner-approved { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1px solid #a7f3d0; }
.banner-rejected { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #fecaca; }
.banner-withdrawn { background: linear-gradient(135deg, #f8fafc, #f1f5f9); border: 1px solid #e2e8f0; }
.banner-icon { font-size: 28px; }
.banner-title { font-size: 18px; font-weight: 900; color: #1f2937; }
.banner-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }

.detail-amount-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 8px 4px;
}
.detail-amount-label { font-size: 12px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: .1em; }
.detail-amount { font-size: 32px; font-weight: 900; color: #059669; }

.detail-desc :deep(.el-descriptions__label) { font-weight: 700; color: #6b7280; width: 90px; }
.reason-text { color: #374151; line-height: 1.6; }

.detail-section { border-top: 1px dashed #e5e7eb; padding-top: 14px; }
.section-title { font-size: 13px; font-weight: 800; color: #1f2937; margin-bottom: 10px; }
.att-thumbs { display: flex; flex-wrap: wrap; gap: 10px; }
.att-thumb { width: 84px; height: 84px; border-radius: 10px; }
.att-thumb-fallback {
  width: 100%; height: 100%;
  display: grid; place-items: center;
  background: #f3f4f6; font-size: 10px; color: #9ca3af; text-align: center;
  padding: 4px; box-sizing: border-box; word-break: break-all;
}
.file-list { display: flex; flex-direction: column; gap: 8px; }
.file-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; background: #f8fafc; border-radius: 10px;
}
.file-icon { font-size: 16px; }
.file-name { flex: 1; font-size: 12px; font-weight: 600; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { font-size: 11px; color: #9ca3af; }
.no-att-text { font-size: 12px; color: #9ca3af; }

.detail-actions { display: flex; gap: 12px; margin-top: 4px; }
.detail-actions .el-button { flex: 1; border-radius: 9999px; font-weight: 800; }

.approve-btn {
  --el-button-bg-color: #059669;
  --el-button-border-color: #059669;
  --el-button-hover-bg-color: #047857;
  --el-button-hover-border-color: #047857;
  --el-button-active-bg-color: #065f46;
  --el-button-active-border-color: #065f46;
  font-weight: 800;
  border-radius: 9999px;
}
.reject-btn {
  --el-button-bg-color: #f56c6c;
  --el-button-border-color: #f56c6c;
  --el-button-hover-bg-color: #e04747;
  --el-button-hover-border-color: #e04747;
  --el-button-active-bg-color: #d03030;
  --el-button-active-border-color: #d03030;
  font-weight: 800;
  border-radius: 9999px;
}
.dialog-tip { font-size: 13px; color: #6b7280; margin: 0 0 14px; }
.dialog-tip b { color: #1f2937; }

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
