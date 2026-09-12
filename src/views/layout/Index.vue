<template>
  <div class="admin-layout">
    <!-- Sidebar -->
    <el-aside :width="collapsed ? '64px' : '240px'" class="aside">
      <!-- Logo -->
      <div class="logo-area">
        <div class="logo-icon">
          <span class="text-base font-black">⚡</span>
        </div>
        <span v-show="!collapsed">智充回收管理</span>
      </div>

      <!-- Menu -->
      <el-scrollbar class="flex-1">
        <el-menu
          :default-active="activeMenu"
          :collapse="collapsed"
          router
          class="el-menu-vertical"
        >
          <template v-for="group in visibleGroups" :key="group.title">
            <div v-show="!collapsed" class="menu-group-title">
              <span class="mgt-icon">
                <el-icon :size="13"><component :is="group.icon" /></el-icon>
              </span>
              <span class="mgt-text">{{ group.title }}</span>
              <span class="mgt-bar"></span>
            </div>
            <template v-for="item in group.items" :key="item.index">
              <el-sub-menu v-if="item.children" :index="item.index">
                <template #title>
                  <el-icon><component :is="item.icon" /></el-icon>
                  <span>{{ item.label }}</span>
                </template>
                <el-menu-item v-for="child in item.children" :key="child.index" :index="child.index">
                  {{ child.label }}
                </el-menu-item>
              </el-sub-menu>
              <el-menu-item v-else :index="item.index">
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </el-menu-item>
            </template>
          </template>
        </el-menu>
      </el-scrollbar>

      <!-- Footer -->
      <div v-show="!collapsed" class="aside-footer">
        <div class="role-switch">
          <span class="role-switch-label">角色预览</span>
          <el-select v-model="previewRole" size="small" placeholder="当前身份" class="role-select">
            <el-option v-for="r in rolePreviewOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </div>
        <div class="logout-btn" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon>
          <span>退出系统</span>
        </div>
      </div>
    </el-aside>

    <!-- Main Area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Topbar -->
      <el-header class="header">
        <div class="header-left">
          <div class="collapse-trigger" @click="collapsed = !collapsed">
            <el-icon :size="20"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
          </div>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="$route.meta.title">{{ $route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-popover
            v-model:visible="notifOpen"
            placement="bottom-end"
            :width="340"
            trigger="click"
            popper-class="notification-popper"
          >
            <template #reference>
              <el-badge :value="unreadCount" :max="99" :hidden="unreadCount === 0">
                <div class="header-action-icon">
                  <el-icon :size="18"><Bell /></el-icon>
                </div>
              </el-badge>
            </template>
            <div class="notification-center">
              <div class="n-header">
                <span class="n-title">系统提醒 ({{ unreadCount }})</span>
                <span class="n-clear" @click="clearAll">全部清空</span>
              </div>
              <div class="n-list">
                <div v-if="!notifs.length" class="n-empty">暂无消息</div>
                <div
                  v-for="n in notifs"
                  :key="n.id"
                  class="n-item"
                  :class="{ unread: !n.read }"
                  @click="markRead(n)"
                >
                  <div class="n-icon">
                    <el-icon :size="16"><Bell /></el-icon>
                  </div>
                  <div class="n-body">
                    <div class="n-t">{{ n.title }}</div>
                    <div class="n-d">{{ n.content }}</div>
                    <div class="n-time">{{ n.created_at }}</div>
                  </div>
                </div>
              </div>
              <div class="n-footer" @click="goMessages">查看全部消息 →</div>
            </div>
          </el-popover>
          <el-dropdown trigger="click">
            <span class="user-profile">
              <el-avatar :size="32" icon="UserFilled" />
              <div class="user-meta">
                <span class="u-name">{{ auth.user?.name || '管理员' }}</span>
                <span class="u-role">{{ auth.user?.role || '超级管理员' }}</span>
              </div>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>个人设置</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">退出系统</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- Content -->
      <div class="main-content">
        <ErrorBoundary>
          <router-view />
        </ErrorBoundary>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { useAuthStore } from '@/store/auth'
import { rowsApi, txApi } from '@/api/rows'
import {
  Money, RefreshRight, DataAnalysis, Box, TrendCharts,
  UserFilled, FolderOpened, Setting, Bell, ArrowDown, Fold, Expand,
  SwitchButton, Monitor, Coin, Clock, ChatDotSquare, DocumentCopy,
  Ship, List, Van
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapsed = ref(false)
const activeMenu = computed(() => route.path)

// ── 顶部铃铛：消息通知（10s 轮询）──
const notifOpen = ref(false)
const notifs = ref([])
let notifTimer = null
const unreadCount = computed(() => notifs.value.filter((n) => !n.read).length)

async function loadNotifs() {
  try {
    const r = await rowsApi.list('notifications', { size: 20, sort: 'id', order: 'desc' })
    notifs.value = r.data?.list || []
  } catch (e) {
    /* 静默：未登录/接口异常不影响布局 */
  }
}

async function markRead(n) {
  if (!n.read) {
    n.read = 1
    try {
      await rowsApi.update('notifications', n.id, { read: 1 })
    } catch (e) {
      /* ignore */
    }
  }
  if (n.type === 'recycle' && n.ref_id) {
    notifOpen.value = false
    router.push('/recycle/orders')
  }
}

async function clearAll() {
  try {
    await txApi.notificationBatch({ op: 'clear-all' })
  } catch (e) {
    /* ignore */
  }
  notifs.value = []
}

function goMessages() {
  notifOpen.value = false
  router.push('/messages')
}

onMounted(() => {
  loadNotifs()
  notifTimer = setInterval(loadNotifs, 10000)
})
onBeforeUnmount(() => clearInterval(notifTimer))

// 菜单权限：按登录用户 permissions（来自 roles 表）过滤；perm 为权限域
const menuGroups = [
  {
    title: '销售业务',
    icon: Money,
    accent: '#3b82f6',
    perm: 'sales',
    items: [
      { index: '/sales/workbench', label: '销售工作台', icon: Money },
      { index: '/sales/performance', label: '我的业绩概览', icon: TrendCharts },
      { index: '/sales/recycle-orders', label: '业务回收单', icon: RefreshRight },
      { index: '/inventory/sales', label: '销售出库单', icon: Box },
      { index: '/inventory/quotations', label: '报价单管理', icon: DocumentCopy },
    ]
  },
  {
    title: '运营中心',
    icon: Monitor,
    accent: '#06b6d4',
    perm: 'recycle',
    items: [
      { index: '/dashboard', label: '仪表盘', icon: Monitor },
      { index: '/recycle/orders', label: '电池回收订单', icon: RefreshRight },
      { index: '/feedback', label: '意见反馈', icon: ChatDotSquare },
      { index: '/messages', label: '消息中心', icon: Bell },
    ]
  },
  {
    title: '进销存管理',
    icon: Box,
    accent: '#a855f7',
    perm: 'inventory',
    items: [
      { index: '/inventory/stock', label: '库存查询', icon: Box },
      { index: '/inventory/audit', label: '库存盘点', icon: DocumentCopy },
      { index: '/inventory/purchase', label: '采购入库', icon: Ship },
      { index: '/logistics/orders', label: '物流管理', icon: Van },
    ]
  },
  {
    title: '绩效与结算',
    icon: TrendCharts,
    accent: '#f59e0b',
    perm: 'finance',
    items: [
      { index: '/finance/settlement', label: '业绩结算', icon: TrendCharts },
      { index: '/staff', label: '员工管理', icon: UserFilled },
    ]
  },
  {
    title: '财务管理',
    icon: Coin,
    accent: '#059669',
    perm: 'finance',
    items: [
      { index: '/finance/supplier-payments', label: '供应商付款', icon: Coin },
      { index: '/finance/expense', label: '费用报销管理', icon: DocumentCopy },
    ]
  },
  {
    title: '基础数据',
    icon: FolderOpened,
    accent: '#64748b',
    perm: 'data',
    items: [
      { index: '/data/products', label: '产品资料', icon: List },
      { index: '/data/categories', label: '产品分类管理', icon: FolderOpened },
      { index: '/data/suppliers', label: '供应商管理', icon: UserFilled },
      { index: '/data/warehouses', label: '仓库管理', icon: Box },
      { index: '/data/customers', label: '客户管理', icon: UserFilled },
      { index: '/settings', label: '系统设置', icon: Setting },
    ]
  },
]

// 角色预览（切换查看不同角色的菜单权限，仅演示、不改真实登录态）
const previewRole = ref('')
const ROLE_PERMS_MAP = {
  超级管理员: ['*'],
  管理员: ['*'],
  销售经理: ['sales', 'recycle', 'finance'],
  销售代表: ['sales', 'recycle', 'finance'],
  财务专员: ['finance'],
  财务审计: ['finance'],
  仓库管理员: ['inventory', 'recycle'],
  仓库WMS: ['inventory', 'recycle'],
}
const rolePreviewOptions = Object.keys(ROLE_PERMS_MAP)
const perms = computed(() =>
  previewRole.value ? (ROLE_PERMS_MAP[previewRole.value] || []) : (auth.user?.permissions || [])
)
const visibleGroups = computed(() =>
  menuGroups.filter((g) => {
    if (!g.perm) return true
    const p = perms.value
    return p.includes('*') || p.includes(g.perm)
  })
)

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.admin-layout { height: 100vh; background-color: #f4f7f9; display: flex; }

.aside {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(229,231,235,.6);
  background: #fff;
  transition: all .3s;
  z-index: 100;
}

.logo-area {
  display: flex;
  height: 4rem;
  flex-shrink: 0;
  align-items: center;
  gap: .75rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid rgba(229,231,235,.6);
}
.logo-area span {
  font-size: .875rem;
  font-weight: 700;
  letter-spacing: -.025em;
  color: #1f2937;
  white-space: nowrap;
}

.logo-icon {
  display: flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: .5rem;
  background: #059669;
  color: #fff;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1), 0 0 0 0 #a7f3d0;
}

.el-menu-vertical { border: none; }

.menu-group-title {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin: 1.1rem .85rem .35rem;
  padding: .35rem .65rem .35rem .55rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #94a3b8;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(148,163,184,.10) 0%, rgba(148,163,184,0) 100%);
  position: relative;
  transition: all .2s ease;
}
.menu-group-title .mgt-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: rgba(148,163,184,.18);
  color: #64748b;
  flex-shrink: 0;
}
.menu-group-title .mgt-bar {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(148,163,184,.4), rgba(148,163,184,0));
  margin-left: .25rem;
  border-radius: 1px;
}
.menu-group-title:hover { color: #475569; background: rgba(148,163,184,.16); }

:deep(.el-menu-item) {
  margin: .25rem .75rem;
  height: 2.75rem;
  border-radius: .75rem;
  font-weight: 500;
  line-height: 44px;
  color: #6b7280;
  transition: all .15s;
}
:deep(.el-menu-item:hover) {
  background-color: #f9fafb !important;
  color: #059669 !important;
}
:deep(.el-menu-item.is-active) {
  background-color: #ecfdf5 !important;
  color: #059669 !important;
  font-weight: 600;
}

:deep(.el-sub-menu__title) {
  margin: .25rem .75rem;
  height: 2.75rem;
  border-radius: .75rem;
  font-weight: 500;
  color: #6b7280;
  transition: all .15s;
}
:deep(.el-sub-menu__title:hover) {
  background-color: #f9fafb !important;
  color: #059669;
}
:deep(.el-sub-menu .el-menu-item) {
  padding-left: 3.5rem !important;
  font-size: 13px;
}

.aside-footer {
  border-top: 1px solid #f9fafb;
  padding: 1rem;
}

.logout-btn {
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: .75rem;
  border-radius: .75rem;
  padding: .75rem 1rem;
  font-size: .875rem;
  font-weight: 500;
  color: #9ca3af;
  transition: all .15s;
}
.logout-btn:hover {
  background: #fef2f2;
  color: #ef4444;
}

/* ── Topbar ── */
.header {
  display: flex;
  height: 4rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f3f4f6;
  background: #fff;
  padding: 0 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.collapse-trigger {
  cursor: pointer;
  font-size: 1.25rem;
  color: #9ca3af;
  transition: color .15s;
}
.collapse-trigger:hover { color: #374151; }

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-action-icon {
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: .75rem;
  color: #9ca3af;
  transition: all .15s;
}
.header-action-icon:hover { background: #f9fafb; }

.user-profile {
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: .75rem;
  border-left: 1px solid #f3f4f6;
  padding-left: 1rem;
}

.user-meta { display: flex; flex-direction: column; }

.u-name {
  font-size: .75rem;
  font-weight: 700;
  line-height: 1.25;
  color: #1f2937;
}
.u-role {
  font-size: 10px;
  font-weight: 500;
  color: #9ca3af;
}

.main-content {
  overflow-x: auto;
  overflow-y: auto;
  background: #f4f7f9;
  padding: 1.5rem;
  flex: 1;
  min-width: 0;
}
</style>
