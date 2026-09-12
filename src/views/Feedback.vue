<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>意见反馈</h3>
          <p>收集用户在使用回收服务过程中的建议与投诉</p>
        </div>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索用户、内容..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select">
            <el-option label="待处理" value="待处理" />
            <el-option label="已读" value="已读" />
            <el-option label="已回复" value="已回复" />
            <el-option label="已关闭" value="已关闭" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            clearable
          />
          <el-button :icon="Download" @click="exportFeedbacks">导出反馈</el-button>
          <div class="pending-wrap">
            <span class="pending-label">待处理反馈</span>
            <el-badge :value="pendingCount" :max="99" class="pending-badge" />
          </div>
        </div>
      </div>
    </template>

    <!-- ============ Feedback Feed (card list) ============ -->
    <div class="feedback-list">
      <div
        v-for="(item, idx) in pagedFeedbacks"
        :key="item.id || idx"
        class="feedback-item"
      >
        <div class="fb-head">
          <el-avatar :size="40" :src="avatarFor(item)">
            {{ initialsOf(item.user) }}
          </el-avatar>
          <div class="fb-meta">
            <p class="fb-name">{{ item.user }}</p>
            <p class="fb-time">{{ item.time }}</p>
          </div>
        </div>

        <div class="fb-body">
          <p class="fb-content">{{ item.content }}</p>

          <div class="fb-tags">
            <el-tag
              v-for="t in tagsOf(item)"
              :key="t"
              size="small"
              effect="plain"
              class="mr-2"
            >{{ t }}</el-tag>
          </div>

          <div class="fb-actions">
            <el-button
              link
              type="primary"
              :icon="ChatDotRound"
              @click="openReply(item)"
            >快速回复</el-button>
            <el-button
              link
              type="primary"
              @click="markAsRead(item)"
            >标记为已读</el-button>
          </div>
        </div>
      </div>

      <el-empty
        v-if="!filteredFeedbacks.length"
        description="暂无反馈数据"
      />
    </div>

    <!-- 分页：对筛选后的全集切片，搜索/状态/日期筛选仍作用于全部数据 -->
    <div v-if="filteredFeedbacks.length" class="pagination-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="filteredFeedbacks.length"
        :page-sizes="[10, 20, 50, 100, 200]"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
      />
    </div>

    <!-- ============ Reply Dialog ============ -->
    <el-dialog
      v-model="dlgReply"
      title="快速回复"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="replyForm" label-width="80px">
        <el-form-item label="回复模板">
          <el-select
            v-model="replyForm.template"
            style="width:100%"
            placeholder="选择快捷回复模板"
            @change="applyTemplate"
          >
            <el-option label="感谢反馈，我们会在后续版本中考虑" value="t1" />
            <el-option label="问题已记录，技术团队正在跟进" value="t2" />
            <el-option label="该功能已在规划中，预计下个版本上线" value="t3" />
            <el-option label="自定义回复..." value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="回复内容">
          <el-input
            v-model="replyForm.content"
            type="textarea"
            :rows="4"
            placeholder="输入回复内容..."
          />
        </el-form-item>
        <el-form-item label="标记状态">
          <el-radio-group v-model="replyForm.markStatus">
            <el-radio-button value="已回复">已回复</el-radio-button>
            <el-radio-button value="已关闭">已关闭</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgReply = false">取消</el-button>
        <el-button type="primary" @click="submitReply">发送回复</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { rowsApi } from '@/api/rows'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotRound, Download, Search } from '@element-plus/icons-vue'
import { exportCsv, nowStamp } from '@/utils/export'

const feedbacks = ref([])

async function loadFeedbacks() {
  try {
    const res = await rowsApi.list('feedbacks', { size: 200 })
    feedbacks.value = (res?.data?.list || []).map(f => ({
      id: f.id, user: f.user || f.name || '', type: f.type || '',
      content: f.content || '', status: f.status || '待处理',
      time: f.time || f.created_at || '',
    }))
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(loadFeedbacks)

const dlgReply = ref(false)
const currentFeedback = ref(null)

const replyForm = reactive({
  template: '',
  content: '',
  markStatus: '已回复',
})

const templateMap = {
  t1: '感谢您的反馈，我们会在后续版本中认真考虑您的建议。',
  t2: '您反馈的问题我们已经记录，技术团队正在跟进处理中。',
  t3: '该功能已在我们的规划中，预计下个版本上线。感谢您的关注！',
}

const pendingCount = computed(
  () => feedbacks.value.filter(f => f.status === '待处理').length
)

// ── 反馈筛选：关键字 / 状态 / 时间范围 ──
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref(null)

const filteredFeedbacks = computed(() => {
  let data = feedbacks.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter((f) =>
      (f.user || '').toLowerCase().includes(q) ||
      (f.content || '').toLowerCase().includes(q)
    )
  }
  if (statusFilter.value) {
    data = data.filter((f) => f.status === statusFilter.value)
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter((f) => {
      const d = (f.time || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

// 分页：对筛选后的全集切片，搜索/状态/日期筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedFeedbacks = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredFeedbacks.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([searchQuery, statusFilter, dateRange, () => feedbacks.value.length], () => {
  currentPage.value = 1
})

function exportFeedbacks() {
  const list = filteredFeedbacks.value
  if (!list.length) {
    ElMessage.warning('暂无反馈数据可导出')
    return
  }
  const headers = ['用户', '时间', '内容', '标签', '状态']
  const rows = list.map((f) => [
    f.user,
    f.time,
    f.content,
    tagsOf(f).join('、'),
    f.status,
  ])
  exportCsv(`意见反馈_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条反馈`)
}

function tagsOf(item) {
  if (Array.isArray(item.tags)) return item.tags
  return item.type ? [item.type] : []
}

function avatarFor(item) {
  if (item.avatar) return item.avatar
  const seed = encodeURIComponent(item.user || 'user')
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
}

function initialsOf(name) {
  if (!name) return '?'
  return name.replace(/[*]/g, '').slice(0, 1)
}

function openReply(item) {
  currentFeedback.value = item
  replyForm.template = ''
  replyForm.content = ''
  replyForm.markStatus = '已回复'
  dlgReply.value = true
}

function applyTemplate(val) {
  if (val && templateMap[val]) replyForm.content = templateMap[val]
}

function markAsRead(item) {
  rowsApi.update('feedbacks', item.id, { status: '已读' })
    .then(() => {
      item.status = '已读'
      ElMessage.success(`已标记"${item.user}"的反馈为已读`)
    })
    .catch(() => ElMessage.error('操作失败'))
}

function submitReply() {
  if (!replyForm.content) return ElMessage.warning('请输入回复内容')
  if (!currentFeedback.value) return
  rowsApi.update('feedbacks', currentFeedback.value.id, {
    status: replyForm.markStatus,
    reply: replyForm.content,
  })
    .then(() => {
      currentFeedback.value.status = replyForm.markStatus
      ElMessage.success('回复已发送！')
      dlgReply.value = false
    })
    .catch(() => ElMessage.error('回复失败'))
}
</script>

<style scoped>
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.title-section h3 {
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #111827;
  margin-bottom: 2px;
}

.title-section p {
  font-size: 12px;
  color: #9ca3af;
}

.pending-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-actions .search-input {
  width: 200px;
}

.header-actions .status-select {
  width: 120px;
}

.pending-label {
  font-size: 12px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pending-badge :deep(.el-badge__content) {
  background: #409eff;
  border: none;
}

/* ============ Feed List ============ */
.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.feedback-item {
  display: flex;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid #f3f4f6;
  border-radius: 20px;
  background: #fff;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.feedback-item:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
  border-color: #e5e7eb;
}

.fb-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.fb-meta .fb-name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.fb-meta .fb-time {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.fb-body {
  flex: 1;
  min-width: 0;
}

.fb-content {
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
  margin-bottom: 10px;
}

.fb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.fb-actions {
  display: flex;
  gap: 8px;
}

/* 分页容器：列表底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
