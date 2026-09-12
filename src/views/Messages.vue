<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>消息中心</h3>
          <p>接收小程序回收报价及系统业务提醒</p>
        </div>
        <div class="filter-bar">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            clearable
          />
          <el-select v-model="sourceFilter" placeholder="全部来源" clearable>
            <el-option label="小程序" value="miniapp" />
            <el-option label="系统" value="system" />
          </el-select>
        </div>
        <div class="header-actions">
          <el-button :icon="Download" @click="exportMessages">导出消息</el-button>
          <el-button @click="markAllRead">全部已读</el-button>
          <el-button type="danger" plain @click="clearAll">全部清空</el-button>
        </div>
      </div>
    </template>

    <!-- ============ Stat Cards ============ -->
    <div class="stat-cards cols-3">
      <div class="stat-card">
        <p class="label">全部消息</p>
        <p class="value">{{ totalCount }}</p>
      </div>
      <div class="stat-card warning">
        <p class="label">未读消息</p>
        <p class="value">{{ unreadCount }}</p>
      </div>
      <div class="stat-card success">
        <p class="label">来自小程序</p>
        <p class="value">{{ miniappCount }}</p>
      </div>
    </div>

    <!-- ============ List ============ -->
    <el-tabs v-model="activeTab" class="msg-tabs">
      <el-tab-pane label="全部" name="all" />
      <el-tab-pane label="未读" name="unread" />
    </el-tabs>

    <el-table
      v-if="filtered.length"
      :data="pagedFiltered"
      style="width: 100%"
      @row-click="onRowClick"
    >
      <el-table-column prop="title" label="标题" min-width="180">
        <template #default="{ row }">
          <span class="msg-title" :class="{ unread: !row.read }">{{ row.title }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="content" label="内容" min-width="280" show-overflow-tooltip />
      <el-table-column label="来源" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.source === 'miniapp' ? 'warning' : 'info'">
            {{ row.source === 'miniapp' ? '小程序' : '系统' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="时间" width="180" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <span class="msg-status" :class="{ read: row.read }">
            {{ row.read ? '已读' : '未读' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center">
        <template #default="{ row }">
          <el-button
            v-if="!row.read"
            link
            type="primary"
            @click.stop="markRead(row)"
          >标记已读</el-button>
          <el-button
            v-if="row.type === 'recycle' && row.ref_id"
            link
            type="primary"
            @click.stop="goRef(row)"
          >查看回收单</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="暂无消息" />

    <!-- 分页：对筛选后的全集切片，未读/Tab/来源/日期筛选仍作用于全部数据 -->
    <div v-if="filtered.length" class="pagination-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="filtered.length"
        :page-sizes="[10, 20, 50, 100, 200]"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
      />
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { rowsApi, txApi } from '@/api/rows'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { exportCsv, nowStamp } from '@/utils/export'

const router = useRouter()
const list = ref([])
const activeTab = ref('all')
const dateRange = ref(null)
const sourceFilter = ref('')

const filtered = computed(() => {
  let data = activeTab.value === 'unread' ? list.value.filter((n) => !n.read) : list.value
  if (sourceFilter.value) {
    data = data.filter((n) => n.source === sourceFilter.value)
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter((n) => n.created_at >= start && n.created_at <= `${end} 23:59:59`)
  }
  return data
})
// 分页：对筛选后的全集 filtered 做切片展示，筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedFiltered = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})
// 任一筛选/Tab/数据变化时回到第 1 页，避免停在越界页码
watch([activeTab, sourceFilter, dateRange, () => list.value.length], () => {
  currentPage.value = 1
})
const totalCount = computed(() => list.value.length)
const unreadCount = computed(() => list.value.filter((n) => !n.read).length)
const miniappCount = computed(() => list.value.filter((n) => n.source === 'miniapp').length)

function exportMessages() {
  if (!filtered.value.length) {
    ElMessage.warning('当前没有可导出的消息')
    return
  }
  const headers = ['标题', '内容', '来源', '时间', '状态']
  const rows = filtered.value.map((n) => [
    n.title,
    n.content,
    n.source === 'miniapp' ? '小程序' : '系统',
    n.created_at,
    n.read ? '已读' : '未读',
  ])
  exportCsv(`消息中心_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条消息`)
}

async function load() {
  try {
    const res = await rowsApi.list('notifications', { size: 200, sort: 'id', order: 'desc' })
    list.value = res.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(load)

async function markRead(n) {
  if (!n.read) {
    try {
      await rowsApi.update('notifications', n.id, { read: 1 })
      n.read = 1
    } catch (e) {
      ElMessage.error('操作失败')
      return
    }
  }
}

async function markAllRead() {
  try {
    const res = await txApi.notificationBatch({ op: 'read-all' })
    list.value.forEach((n) => (n.read = 1))
    ElMessage.success(`已标记 ${res.data?.count ?? '全部'} 条为已读`)
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

async function clearAll() {
  try {
    await txApi.notificationBatch({ op: 'clear-all' })
    list.value = []
    ElMessage.success('已全部清空')
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

function onRowClick(row) {
  if (row.type === 'recycle' && row.ref_id) {
    markRead(row)
    router.push('/recycle/orders')
  }
}

function goRef(row) {
  markRead(row)
  router.push('/recycle/orders')
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

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.filter-bar .el-select {
  width: 130px;
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

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.msg-tabs {
  margin-bottom: 8px;
}

.msg-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.msg-title.unread {
  color: #f97316;
}

.msg-status {
  font-size: 12px;
  font-weight: 700;
  color: #ef4444;
}

.msg-status.read {
  color: #9ca3af;
}

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
