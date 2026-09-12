<template>
  <div class="sales-orders-page">
    <!-- ── Stat Cards ── -->
    <div class="stat-cards-grid">
      <div class="stat-card" v-for="card in statCards" :key="card.label">
        <p class="stat-card-label">{{ card.label }}</p>
        <p class="stat-card-value" :class="card.colorClass">{{ card.value }}</p>
      </div>
    </div>

    <!-- ── Main Table Card ── -->
    <el-card shadow="never" class="main-card">
      <template #header>
        <div class="card-header">
          <h3 class="card-title">销售订单流水</h3>
          <div class="filter-bar">
            <el-input
              v-model="searchQuery"
              placeholder="搜索单号、客户、产品..."
              :prefix-icon="Search"
              clearable
              class="search-input"
            />
            <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select">
              <el-option label="等待回款" value="pending_payment" />
              <el-option label="待分拣出库" value="pending_outbound" />
              <el-option label="物流运送中" value="shipping" />
              <el-option label="订单已完成" value="completed" />
              <el-option label="已退货入库" value="returned" />
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
          </div>
          <div class="header-actions">
            <el-button round class="btn-export" @click="handleExport">导出数据</el-button>
            <el-button type="primary" round class="btn-create" @click="openCreateDialog">
              <el-icon class="mr-1"><Plus /></el-icon>录入新销售单
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="pagedList" style="width: 100%" size="default" class="orders-table">
        <el-table-column label="订单/客户" min-width="220">
          <template #default="{ row }">
            <div class="cell-order-customer">
              <span class="order-id">#{{ row.id }}</span>
              <p class="order-customer">{{ row.customer }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="产品明细摘要" min-width="280">
          <template #default="{ row }">
            <div class="cell-product-summary">
              <span class="product-summary-text">{{ row.productSummary }}</span>
              <span class="product-sku-count">SKU x{{ row.itemCount }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="订单金额" width="180" align="right">
          <template #default="{ row }">
            <div class="cell-amount">
              <span class="amount-value">¥{{ row.total }}</span>
              <span class="amount-gp">GP: {{ row.gp }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140" align="center">
          <template #default="{ row }">
            <el-tag
              :type="getStatusType(row.status)"
              effect="dark"
              round
              class="status-tag"
            >
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" class="btn-manage" @click="openDrawer(row)">管理</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="filteredOrders.length"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </el-card>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- Drawer: 订单流转中心 -->
    <!-- ═══════════════════════════════════════════════ -->
    <el-drawer
      v-model="drawerVisible"
      title="订单流转中心"
      size="760px"
      class="order-drawer"
    >
      <template v-if="currentOrder">
        <!-- Status Banner -->
        <div class="drawer-status-banner">
          <div class="banner-info">
            <p class="banner-label">Order Progress</p>
            <p class="banner-status">{{ getStatusLabel(currentOrder.status) }}</p>
            <p class="banner-meta">SO-{{ currentOrder.id }} &bull; {{ currentOrder.time }}</p>
          </div>
          <div class="banner-actions">
            <el-button
              v-if="currentOrder.status === 'pending_payment'"
              type="success"
              size="large"
              class="btn-action"
              @click="advanceStatus('pending_outbound')"
            >
              确认款项到账
            </el-button>
            <el-button
              v-if="currentOrder.status === 'pending_outbound'"
              type="primary"
              size="large"
              class="btn-action"
              @click="openShipDialog"
            >
              分拣完成申请发货
            </el-button>
            <el-button
              v-if="currentOrder.status === 'shipping'"
              type="success"
              size="large"
              class="btn-action"
              @click="advanceStatus('completed')"
            >
              确认最终签收
            </el-button>
            <el-button
              v-if="currentOrder.status === 'completed'"
              type="danger"
              size="large"
              class="btn-action"
              @click="handleReturn"
            >
              发起退货入库流程
            </el-button>
          </div>
        </div>

        <!-- Info Grid -->
        <div class="drawer-info-grid">
          <div class="info-item">
            <p class="info-label">客户主体 (Debtor)</p>
            <p class="info-value">{{ currentOrder.customer }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">物流信息</p>
            <p class="info-value">
              {{ currentOrder.logisticsCo || '待起运' }}
              {{ currentOrder.trackingNo || '' }}
            </p>
          </div>
          <div class="info-item col-span-2">
            <p class="info-label">收货地址</p>
            <p class="info-value-secondary">上海市浦东新区外高桥保税区 A1 库</p>
          </div>
        </div>

        <!-- Financial Collection Panel -->
        <div class="drawer-section">
          <h4 class="section-title">财务收款明细 (Financial Collection)</h4>
          <div class="finance-grid">
            <div class="finance-item">
              <p class="finance-label">应收金额 (Receivable)</p>
              <p class="finance-value large">¥{{ currentOrder.total }}</p>
            </div>
            <div class="finance-item">
              <p class="finance-label">实收金额 (Received)</p>
              <p class="finance-value large">¥{{ currentOrder.receivedAmount || '0.00' }}</p>
            </div>
            <div class="finance-item">
              <p class="finance-label">剩余欠款 (Balance)</p>
              <p class="finance-value large">¥{{ currentOrder.balance || '0.00' }}</p>
            </div>
            <div class="finance-item">
              <p class="finance-label">付款人 (Payer)</p>
              <p class="finance-value">{{ currentOrder.customer }}</p>
            </div>
            <div class="finance-item finance-status">
              <div class="finance-status-row">
                <span
                  class="status-dot"
                  :class="currentOrder.balance === '0.00' ? 'dot-green' : 'dot-orange'"
                />
                <span class="status-text">
                  {{ currentOrder.balance === '0.00' ? '款项已结清' : '尚有款项未结清' }}
                </span>
              </div>
              <el-button
                v-if="currentOrder.balance !== '0.00'"
                type="primary"
                size="small"
                class="btn-small-action"
                @click="openPaymentDialog"
              >
                录入回款金额
              </el-button>
            </div>
          </div>
        </div>

        <!-- Order Items Table -->
        <div class="drawer-section">
          <h4 class="section-title">订单明细 (Order Items)</h4>
          <el-table
            :data="currentOrder.items || [{ productName: currentOrder.productSummary, price: '-', amount: currentOrder.itemCount, total: currentOrder.total }]"
            size="default"
            class="items-table"
          >
            <el-table-column prop="productName" label="产品名称" />
            <el-table-column label="溯源回收单" width="160">
              <template #default="{ row: item }">
                <span v-if="item.recycleOrderId">#{{ item.recycleOrderId }}</span>
                <span v-else>无绑定</span>
              </template>
            </el-table-column>
            <el-table-column prop="price" label="销售单价" width="140" align="right" />
            <el-table-column prop="amount" label="数量" width="100" align="center" />
          </el-table>
        </div>
      </template>
    </el-drawer>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- Dialog: 录入新销售单 -->
    <!-- ═══════════════════════════════════════════════ -->
    <el-dialog
      v-model="createDialogVisible"
      title="录入新销售单"
      width="820px"
      align-center
      class="create-dialog"
    >
      <div class="create-dialog-body">
        <el-form :model="createForm" label-position="top">
          <div class="form-row-4">
            <el-form-item label="客户" class="zero-mb">
              <el-select
                v-model="createForm.customer"
                filterable
                class="w-full"
                size="default"
                placeholder="选择或录入"
              >
                <template #footer>
                  <div class="select-footer">
                    <el-button type="primary" size="small" link class="flex-1 font-bold" @click="goToStaff">建企业客户</el-button>
                    <el-button type="success" size="small" link class="flex-1 font-bold" @click="openRetailDialog">录入新散户</el-button>
                  </div>
                </template>
                <el-option label="顺风物流园 (张总)" value="顺风物流园 (张总)" />
                <el-option label="某汽修连锁" value="某汽修连锁" />
              </el-select>
            </el-form-item>
            <el-form-item label="结算" class="zero-mb">
              <el-select v-model="createForm.paymentType" class="w-full" size="default">
                <el-option label="全额预付" value="全额预付" />
                <el-option label="账期 30天" value="账期 30天" />
              </el-select>
            </el-form-item>
            <el-form-item label="收货地址" class="zero-mb">
              <el-input v-model="createForm.address" placeholder="地址" size="default" />
            </el-form-item>
            <el-form-item label="付款人 (Payer Name)" class="zero-mb col-span-3">
              <el-input v-model="createForm.payer" placeholder="默认为客户名称" size="default" />
            </el-form-item>
          </div>

          <div class="divider-line" />

          <div class="items-header">
            <span class="items-header-label">销售清单</span>
            <el-button type="primary" link class="font-bold" @click="addItemRow">
              <el-icon class="mr-1"><Plus /></el-icon>加一行
            </el-button>
          </div>

          <div class="items-list">
            <div
              v-for="(item, idx) in createForm.items"
              :key="idx"
              class="item-row"
            >
              <div class="item-row-content">
                <div class="item-field">
                  <el-form-item label="产品 SKU" class="zero-mb">
                    <el-select
                      v-model="item.sku"
                      filterable
                      class="w-full"
                      size="default"
                      @change="onSkuChange(item)"
                    >
                      <el-option
                        v-for="p in productCatalog"
                        :key="p.sku"
                        :label="p.name"
                        :value="p.sku"
                      />
                    </el-select>
                  </el-form-item>
                </div>
                <div class="item-field item-field-sm">
                  <el-form-item label="数量" class="zero-mb">
                    <el-input-number
                      v-model="item.amount"
                      :min="1"
                      controls-position="right"
                      class="w-full"
                      size="default"
                    />
                  </el-form-item>
                </div>
                <div class="item-field item-field-sm">
                  <el-form-item label="单价" class="zero-mb">
                    <el-input-number
                      v-model="item.price"
                      :precision="2"
                      controls-position="right"
                      class="w-full"
                      size="default"
                    />
                  </el-form-item>
                </div>
                <div class="item-field asset-field">
                  <div class="asset-selector">
                    <div class="asset-info">
                      <span class="asset-selector-label">选定实物资产 (Specific Item/Serial)</span>
                      <div v-if="item.selectedItemId" class="asset-selected">
                        <span class="asset-id">{{ item.selectedItemId }}</span>
                        <el-tag size="small" type="success" effect="plain" class="font-bold">
                          SOH: {{ item.health }}%
                        </el-tag>
                        <span v-if="item.recycleOrderId" class="asset-trace">溯源: #{{ item.recycleOrderId }}</span>
                      </div>
                      <span v-else class="asset-empty">尚未选择具体出库资产...</span>
                    </div>
                    <el-button
                      type="primary"
                      size="small"
                      :disabled="!item.sku"
                      round
                      class="btn-select-asset"
                      @click="openAssetSelector(item)"
                    >
                      {{ item.selectedItemId ? '重新选择' : '点击选定资产' }}
                    </el-button>
                  </div>
                </div>
              </div>
              <el-button
                v-if="createForm.items.length > 1"
                type="danger"
                link
                class="btn-remove-item"
                @click="removeItemRow(idx)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer-between">
          <div class="footer-total">
            <span class="total-label">订单总额:</span>
            <p class="total-value">¥{{ orderTotal.toLocaleString() }}</p>
          </div>
          <div class="footer-buttons">
            <el-button size="default" class="btn-cancel" @click="createDialogVisible = false">取消</el-button>
            <el-button type="primary" size="default" class="btn-submit" :loading="submitting" @click="submitOrder">正式生成单据</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- Dialog: 录入散户信息 -->
    <!-- ═══════════════════════════════════════════════ -->
    <el-dialog
      v-model="retailDialogVisible"
      title="录入散户信息"
      width="360px"
      align-center
      append-to-body
      class="retail-dialog"
    >
      <el-form :model="retailForm" label-position="top">
        <el-form-item label="称呼" class="zero-mb">
          <el-input v-model="retailForm.name" />
        </el-form-item>
        <el-form-item label="电话" class="zero-mb">
          <el-input v-model="retailForm.phone" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer-right">
          <el-button size="small" @click="retailDialogVisible = false">取消</el-button>
          <el-button type="primary" size="small" class="btn-submit" @click="saveRetail">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- Dialog: 确认发货起运 -->
    <!-- ═══════════════════════════════════════════════ -->
    <el-dialog
      v-model="shipDialogVisible"
      title="确认发货起运"
      width="480px"
      align-center
      class="ship-dialog"
    >
      <template v-if="currentOrder">
        <el-form :model="shipForm" label-position="top">
          <el-form-item label="出库仓库" class="zero-mb">
            <el-select v-model="shipForm.warehouse" class="w-full">
              <el-option label="1号主仓 (上海)" value="1号主仓" />
            </el-select>
          </el-form-item>
          <el-form-item label="物流公司" class="zero-mb">
            <el-select v-model="shipForm.logisticsCo" class="w-full">
              <el-option label="顺丰速运" value="顺丰速运" />
              <el-option label="中通快运" value="中通快运" />
            </el-select>
          </el-form-item>
          <el-form-item label="运单号" class="zero-mb">
            <el-input v-model="shipForm.trackingNo" placeholder="输入单号" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <div class="dialog-footer-right">
          <el-button @click="shipDialogVisible = false">取消</el-button>
          <el-button type="primary" class="btn-submit px-10" @click="confirmShip">确认正式起运</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- Dialog: 录入回款流水 -->
    <!-- ═══════════════════════════════════════════════ -->
    <el-dialog
      v-model="paymentDialogVisible"
      title="录入回款流水"
      width="400px"
      align-center
      class="payment-dialog"
    >
      <template v-if="currentOrder">
        <div class="payment-banner">
          <p class="payment-banner-label">待收余额</p>
          <p class="payment-banner-value">¥{{ currentOrder.balance }}</p>
        </div>
        <el-form label-position="top">
          <el-form-item label="本次回款金额">
            <el-input-number
              v-model="paymentForm.amount"
              :min="0"
              :max="parseFloat(currentOrder.balance.replace(/,/g, ''))"
              class="w-full"
              size="large"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="入账账户 (Account)">
            <el-select v-model="paymentForm.account" class="w-full" size="large">
              <el-option label="中国工商银行 (基本户)" value="bank_icbc" />
              <el-option label="微信支付商户号" value="wechat_pay" />
              <el-option label="支付宝企业号" value="alipay_pay" />
            </el-select>
          </el-form-item>
          <el-form-item label="财务收款项 (Item Class)">
            <el-select v-model="paymentForm.method" class="w-full" size="large">
              <el-option label="销售回款" value="bank" />
              <el-option label="售后服务费" value="wechat" />
              <el-option label="其他营业收入" value="alipay" />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <div class="dialog-footer-right">
          <el-button @click="paymentDialogVisible = false">取消</el-button>
          <el-button type="primary" class="btn-submit px-10" @click="confirmPayment">确认收款过账</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- Dialog: 选择具体出库资产 -->
    <!-- ═══════════════════════════════════════════════ -->
    <el-dialog
      v-model="assetDialogVisible"
      :title="`选择具体出库资产: ${currentItemForAsset?.productName || ''}`"
      width="900px"
      class="asset-selector-dialog"
    >
      <div class="asset-dialog-body">
        <div class="asset-notice">
          <el-icon class="text-blue-500 text-xl mt-1"><InfoFilled /></el-icon>
          <div>
            <span class="asset-notice-title">精准资产锁定 (Precision Asset Allocation)</span>
            <span class="asset-notice-desc">您正在为该订单项匹配唯一的实物资产。系统已过滤出当前所有可售库存。</span>
          </div>
        </div>

        <div class="asset-search-bar">
          <el-input
            v-model="assetSearch"
            placeholder="搜索唯一识别码 / 序列号..."
            :prefix-icon="Search"
            class="flex-1 asset-search-input"
          />
          <el-button type="primary" plain class="btn-advanced-filter">
            <el-icon class="mr-1"><Filter /></el-icon>高级筛选
          </el-button>
        </div>

        <el-table
          :data="filteredAssets"
          highlight-current-row
          @current-change="onAssetSelect"
          class="asset-table"
        >
          <el-table-column label="唯一识别码/序列号" min-width="160">
            <template #default="{ row }">
              <div class="cell-asset-id">
                <span class="asset-id-main">{{ row.id }}</span>
                <span class="asset-id-sub">入库: {{ row.inDate }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="核心指标" min-width="180">
            <template #default="{ row }">
              <div class="cell-asset-metrics">
                <div class="metric-item">
                  <p class="metric-label">SOH</p>
                  <p class="metric-value" :class="row.health > 90 ? 'text-emerald' : 'text-orange'">
                    {{ row.health }}%
                  </p>
                </div>
                <div class="metric-item">
                  <p class="metric-label">Cycles</p>
                  <p class="metric-value-secondary">{{ row.cycles || '-' }} 次</p>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="实测性能" min-width="140">
            <template #default="{ row }">
              <div class="cell-asset-perf">
                <span>{{ row.capacity || '-' }} Ah</span>
                <span>压差: {{ row.voltageDiff || '-' }} mV</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="溯源/批次" min-width="150">
            <template #default="{ row }">
              <div class="cell-asset-trace">
                <span>#{{ row.recycleOrderId || 'PO-2401A' }}</span>
                <span>来源: {{ row.recycleOrderId ? '回收拆解' : '新件采购' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="所在位置" width="140" align="right">
            <template #default="{ row }">
              <div class="cell-asset-location">
                <span>{{ row.location || '1号仓-A1' }}</span>
                <span>库龄: {{ row.daysInStock }}天</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <div class="dialog-footer-right">
          <el-button @click="assetDialogVisible = false">取消</el-button>
          <el-button type="primary" class="btn-submit px-10" @click="confirmAssetSelection">确认选定此资产</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, InfoFilled, Search, Filter } from '@element-plus/icons-vue'
import { rowsApi, txApi } from '@/api/rows'
import { exportCsv, toNum, nowStamp } from '@/utils/export'

const salesOrders = ref({ list: [] })

// ── 列表筛选：状态 / 关键字 / 时间范围 ──
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref(null)
const page = ref(1)
const pageSize = ref(10)

const filteredOrders = computed(() => {
  let data = salesOrders.value.list || []
  if (statusFilter.value) {
    data = data.filter((o) => o.status === statusFilter.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter((o) =>
      String(o.id).toLowerCase().includes(q) ||
      (o.customer || '').toLowerCase().includes(q) ||
      (o.productSummary || '').toLowerCase().includes(q)
    )
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter((o) => {
      const d = (o.time || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})

async function loadSalesOrders() {
  try {
    const res = await rowsApi.list('sales_orders', { size: 200, sort: 'time', order: 'desc' })
    const list = res?.data?.list || []
    salesOrders.value = {
      list: list.map(r => ({
        id: r.id, customer: r.customer || '', productSummary: r.product_summary || r.items_summary || '',
        itemCount: r.item_count || 1, total: r.total_amount || r.total || '0',
        gp: r.gp || 25, status: r.status || 'pending_payment',
        time: r.time || '', logisticsCo: r.logistics_co || '', trackingNo: r.tracking_no || '',
        receivedAmount: r.received_amount || '0.00', balance: r.balance || '0.00',
        items: r.items_json ? JSON.parse(r.items_json) : [],
      })),
      monthAmount: list.reduce((s, r) => s + parseFloat(String(r.total_amount || r.total || '0').replace(/,/g, '')), 0),
      pendingShip: list.filter(r => r.status === 'pending_outbound' || r.status === 'shipping').length,
    }
  } catch (e) {
    ElMessage.error('加载失败')
  }
}
onMounted(() => { loadSalesOrders(); loadProductCatalog(); loadAssetInventory() })

function moneyNum(v) {
  return parseFloat(String(v ?? '0').replace(/,/g, '')) || 0
}
function ymOf(t) {
  const m = String(t || '').match(/(\d{4})[/-](\d{1,2})/)
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : ''
}
const now = new Date()
const thisYM = ymOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)

// ── Stat cards（真实聚合 sales_orders）──
const statCards = computed(() => {
  const list = salesOrders.value.list || []
  let monthAmount = 0
  const gps = []
  for (const o of list) {
    if (ymOf(o.time) === thisYM) monthAmount += moneyNum(o.total)
    gps.push(Number(o.gp) || 0)
  }
  const avgGp = gps.length ? Math.round(gps.reduce((a, b) => a + b, 0) / gps.length) : 0
  const pendingShip = list.filter((o) => ['pending_outbound', 'shipping'].includes(o.status)).length
  return [
    { label: '本月累计销售额', value: '¥' + monthAmount.toLocaleString('en-US'), colorClass: '' },
    { label: '平均销售毛利率', value: avgGp + '%', colorClass: 'text-emerald' },
    { label: '待出库订单 (SO)', value: pendingShip, colorClass: 'text-orange' },
  ]
})

// ── Product catalog（真实 products 表，仅在售且有 SKU）──
const productCatalog = ref([])
async function loadProductCatalog() {
  try {
    const res = await rowsApi.list('products', { size: 200 })
    productCatalog.value = (res?.data?.list || [])
      .filter((p) => p.status === '在售' && p.sku)
      .map((p) => ({ sku: p.sku, name: p.name, price: moneyNum(p.sale_price) }))
  } catch (e) {
    /* 加载失败保持空目录 */
  }
}

// ── Asset inventory（真实 stock_batches + stock_items，按 SKU 分组）──
const assetInventory = ref({})
async function loadAssetInventory() {
  try {
    const [bRes, iRes] = await Promise.all([
      rowsApi.list('stock_batches', { size: 1000 }),
      rowsApi.list('stock_items', { size: 200 }),
    ])
    const batches = bRes?.data?.list || []
    const items = iRes?.data?.list || []
    const itemById = {}
    for (const it of items) itemById[it.id] = it
    const groups = {}
    for (const b of batches) {
      const item = itemById[b.stock_item_id]
      if (!item || !item.sku) continue
      const days = b.mfd ? Math.max(0, Math.floor((Date.now() - new Date(b.mfd).getTime()) / 86400000)) : 0
      const row = {
        id: b.id,
        health: b.health ?? 100,
        recycleOrderId: b.recycle_order_id || '',
        daysInStock: days,
        inDate: b.mfd || '',
        cycles: '-',
        capacity: '-',
        voltageDiff: '-',
        location: item.warehouse || '1号仓',
      }
      ;(groups[item.sku] = groups[item.sku] || []).push(row)
    }
    assetInventory.value = groups
  } catch (e) {
    /* 加载失败保持空 */
  }
}

// ── State ──
const drawerVisible = ref(false)
const shipDialogVisible = ref(false)
const createDialogVisible = ref(false)
const retailDialogVisible = ref(false)
const paymentDialogVisible = ref(false)
const assetDialogVisible = ref(false)
const submitting = ref(false)

const currentOrder = ref(null)
const assetSearch = ref('')
const assetsToShow = ref([])
const selectedAsset = ref(null)
const currentItemForAsset = ref(null)

// ── Create form ──
const createForm = reactive({
  customer: '',
  address: '',
  paymentType: '全额预付',
  items: [
    { sku: '', productName: '', price: 0, amount: 1, selectedItemId: '', health: 0, recycleOrderId: '' },
  ],
  payer: '',
})

// ── Retail form ──
const retailForm = reactive({ name: '', phone: '' })

// ── Ship form ──
const shipForm = reactive({
  warehouse: '1号主仓',
  logisticsCo: '顺丰速运',
  trackingNo: '',
})

// ── Payment form ──
const paymentForm = reactive({
  amount: 0,
  method: 'bank',
  account: 'bank_icbc',
})

// ── Computed ──
const filteredAssets = computed(() =>
  assetsToShow.value.filter(
    (a) => !assetSearch.value || a.id.toLowerCase().includes(assetSearch.value.toLowerCase())
  )
)

const orderTotal = computed(() =>
  createForm.items.reduce((sum, item) => sum + item.amount * (item.price || 0), 0)
)

// ── Status helpers ──
function getStatusType(status) {
  const map = {
    pending_payment: 'warning',
    pending_outbound: 'primary',
    shipping: 'warning',
    completed: 'success',
    returned: 'danger',
  }
  return map[status] || 'info'
}

function getStatusLabel(status) {
  const map = {
    pending_payment: '等待回款',
    pending_outbound: '待分拣出库',
    shipping: '物流运送中',
    completed: '订单已完成',
    returned: '已退货入库',
  }
  return map[status] || '未知状态'
}

// ── Drawer ──
function openDrawer(row) {
  currentOrder.value = row
  drawerVisible.value = true
}

function advanceStatus(newStatus) {
  currentOrder.value.status = newStatus
  ElMessage.success(`订单已转入: ${getStatusLabel(newStatus)}`)
}

function handleReturn() {
  ElMessageBox.confirm(
    '确定执行销售退货入库流程吗？已收金额将进入退款流程，库存将回滚。',
    '退货确认',
    { confirmButtonText: '确定退货', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    currentOrder.value.status = 'returned'
    currentOrder.value.receivedAmount = '0.00'
    currentOrder.value.balance = currentOrder.value.total
    ElMessage.success('退货入库流程已启动')
  })
}

// ── Create dialog ──
function openCreateDialog() {
  Object.assign(createForm, {
    customer: '',
    address: '',
    paymentType: '全额预付',
    items: [{ sku: '', productName: '', price: 0, amount: 1, selectedItemId: '', health: 0, recycleOrderId: '' }],
    payer: '',
  })
  createDialogVisible.value = true
}

function addItemRow() {
  createForm.items.push({
    sku: '',
    productName: '',
    price: 0,
    amount: 1,
    selectedItemId: '',
    health: 0,
    recycleOrderId: '',
  })
}

function removeItemRow(idx) {
  createForm.items.splice(idx, 1)
}

function onSkuChange(item) {
  const found = productCatalog.value.find((p) => p.sku === item.sku)
  if (found) {
    item.productName = found.name
    item.price = found.price
    item.selectedItemId = ''
    item.health = 0
    item.recycleOrderId = ''
  }
}

function goToStaff() {
  window.open('/#/staff', '_blank')
}

function submitOrder() {
  if (!createForm.customer || createForm.items.some((i) => !i.sku)) {
    ElMessage.warning('请完善订单信息')
    return
  }
  if (createForm.items.some((i) => !i.selectedItemId)) {
    ElMessage.warning('请为所有项选定特定的实物资产')
    return
  }
  submitting.value = true
  const newId = 'SO' + Date.now().toString().slice(-8)
  rowsApi.create('sales_orders', {
    id: newId,
    customer: createForm.customer,
    product_summary: createForm.items.map((i) => `${i.productName} x${i.amount}`).join(', '),
    item_count: createForm.items.length,
    total: orderTotal.value.toLocaleString(),
    gp: 25,
    status: 'pending_payment',
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    received_amount: '0.00',
    balance: orderTotal.value.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    logistics_co: '',
    tracking_no: '',
    items_json: JSON.stringify(createForm.items),
  })
    .then(() => {
      salesOrders.value.list.unshift({
        id: newId,
        customer: createForm.customer,
        productSummary: createForm.items.map((i) => `${i.productName} x${i.amount}`).join(', '),
        itemCount: createForm.items.length,
        total: orderTotal.value.toLocaleString(),
        gp: 25,
        status: 'pending_payment',
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        receivedAmount: '0.00',
        balance: orderTotal.value.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        logisticsCo: '',
        trackingNo: '',
        items: JSON.parse(JSON.stringify(createForm.items)),
      })
      salesOrders.value.monthAmount += orderTotal.value
      salesOrders.value.pendingShip += 1
      ElMessage.success('销售订单已生成')
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '创建失败'))
    .finally(() => { submitting.value = false; createDialogVisible.value = false })
}

// ── Retail dialog ──
function openRetailDialog() {
  retailForm.name = ''
  retailForm.phone = ''
  retailDialogVisible.value = true
}

function saveRetail() {
  if (retailForm.name) {
    createForm.customer = retailForm.name + ' (个人)'
    retailDialogVisible.value = false
  }
}

// ── Ship dialog ──
function openShipDialog() {
  shipForm.warehouse = '1号主仓'
  shipForm.logisticsCo = '顺丰速运'
  shipForm.trackingNo = ''
  shipDialogVisible.value = true
}

function confirmShip() {
  const trackingNo = shipForm.trackingNo || 'SF' + Date.now().toString().slice(-6)
  // D2：订单选品（内存 items）→ 真实库存出库；无选品的旧单仅更新物流
  const outItems = (currentOrder.value.items || [])
    .map(i => ({ stockItemId: i.selectedItemId || '', sku: i.sku || '', qty: i.amount || 1 }))
    .filter(i => i.stockItemId || i.sku)
  const done = () => {
    currentOrder.value.status = 'shipping'
    currentOrder.value.logisticsCo = shipForm.logisticsCo
    currentOrder.value.trackingNo = trackingNo
    ElMessage.success('已正式起运，库存已扣减')
  }
  if (!outItems.length) {
    rowsApi.update('sales_orders', currentOrder.value.id, {
      status: 'shipping',
      logistics_co: shipForm.logisticsCo,
      tracking_no: trackingNo,
    }).then(done).catch(() => ElMessage.error('操作失败'))
  } else {
    txApi.salesOutbound({
      salesOrderId: currentOrder.value.id,
      items: outItems,
      logisticsCo: shipForm.logisticsCo,
      trackingNo,
    }).then(done).catch((e) => ElMessage.error(e?.response?.data?.message || '出库失败'))
  }
  shipDialogVisible.value = false
}

// ── Payment dialog ──
function openPaymentDialog() {
  paymentForm.amount = parseFloat(currentOrder.value.balance.replace(/,/g, ''))
  paymentDialogVisible.value = true
}

function confirmPayment() {
  const received = parseFloat(currentOrder.value.receivedAmount.replace(/,/g, ''))
  const balance = parseFloat(currentOrder.value.balance.replace(/,/g, ''))
  const newReceived = received + paymentForm.amount
  const newBalance = balance - paymentForm.amount
  const newStatus = (newBalance === 0 && currentOrder.value.status === 'pending_payment') ? 'pending_outbound' : currentOrder.value.status
  rowsApi.update('sales_orders', currentOrder.value.id, {
    received_amount: newReceived.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    balance: newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    status: newStatus,
  }).then(() => {
    currentOrder.value.receivedAmount = newReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })
    currentOrder.value.balance = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })
    if (newBalance === 0 && currentOrder.value.status === 'pending_payment') {
      currentOrder.value.status = 'pending_outbound'
    }
    ElMessage.success('回款金额已成功过账')
  }).catch(() => ElMessage.error('操作失败'))
  paymentDialogVisible.value = false
}

// ── Asset selector dialog ──
function openAssetSelector(item) {
  currentItemForAsset.value = item
  assetsToShow.value = assetInventory.value[item.sku] || []
  selectedAsset.value = null
  assetDialogVisible.value = true
}

function onAssetSelect(val) {
  selectedAsset.value = val
}

function confirmAssetSelection() {
  if (selectedAsset.value) {
    currentItemForAsset.value.selectedItemId = selectedAsset.value.id
    currentItemForAsset.value.health = selectedAsset.value.health
    currentItemForAsset.value.recycleOrderId = selectedAsset.value.recycleOrderId
    assetDialogVisible.value = false
    ElMessage.success(`已选定资产: ${selectedAsset.value.id}`)
  } else {
    ElMessage.warning('请先选择一个具体资产')
  }
}

// ── Export ──
function handleExport() {
  const list = filteredOrders.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的销售订单')
    return
  }
  exportCsv(`销售订单流水_${nowStamp()}.csv`,
    ['订单号', '下单时间', '客户', '产品明细摘要', 'SKU数量', '订单金额(元)', '毛利率(%)', '状态', '物流公司', '物流单号', '已回款(元)', '未回款(元)'],
    list.map(o => [
      o.id, o.time, o.customer, o.productSummary, o.itemCount,
      toNum(o.total), o.gp ?? '', getStatusLabel(o.status),
      o.logisticsCo || '', o.trackingNo || '', toNum(o.receivedAmount), toNum(o.balance),
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条销售订单`)
}
</script>

<style scoped>
.sales-orders-page {
  padding: 0;
}

/* ── Stat Cards ── */
.stat-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  padding: 28px;
  border-radius: 32px;
  border: 1px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s;
}
.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-card-label {
  font-size: 12px;
  font-weight: 900;
  color: #d1d5db;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
}

.stat-card-value {
  font-size: 30px;
  font-weight: 900;
  color: #111827;
  line-height: 1;
  letter-spacing: -0.02em;
}
.stat-card-value.text-emerald {
  color: #059669;
}
.stat-card-value.text-orange {
  color: #f97316;
}

/* ── Main Card ── */
.main-card {
  border-radius: 40px !important;
  border: none !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
  overflow: hidden;
}
.main-card :deep(.el-card__header) {
  padding: 24px 28px 16px;
  border-bottom: none;
}
.main-card :deep(.el-card__body) {
  padding: 0 28px 24px;
}

.card-header {
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
  flex-wrap: wrap;
  flex: 1;
  justify-content: flex-end;
}

.filter-bar .search-input {
  width: 220px;
}

.filter-bar .status-select {
  width: 140px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0 4px;
}

.card-title {
  font-size: 20px;
  font-weight: 900;
  color: #111827;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-export {
  padding: 8px 32px;
  font-weight: 900;
}
.btn-create {
  padding: 8px 40px;
  font-weight: 900;
  box-shadow: 0 8px 20px rgba(64, 158, 255, 0.2);
}

/* ── Table ── */
.orders-table {
  --el-table-border-color: transparent;
}

.cell-order-customer .order-id {
  font-weight: 700;
  color: #111827;
}
.cell-order-customer .order-customer {
  font-size: 13px;
  color: #6b7280;
  margin: 2px 0 0;
}

.cell-product-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.product-summary-text {
  font-weight: 700;
  color: #374151;
}
.product-sku-count {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 700;
}

.cell-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.amount-value {
  font-weight: 900;
  font-size: 16px;
  color: #111827;
}
.amount-gp {
  font-size: 11px;
  color: #6b7280;
  font-weight: 700;
}

.status-tag {
  font-weight: 900;
  padding: 0 20px;
  font-size: 12px !important;
  height: 28px;
}

.btn-manage {
  font-size: 14px;
  font-weight: 900;
}

/* ── Drawer ── */
.drawer-status-banner {
  background: linear-gradient(135deg, #1e293b, #0f172a);
  border-radius: 20px;
  padding: 28px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.banner-label {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  margin-bottom: 12px;
}
.banner-status {
  font-size: 22px;
  font-weight: 900;
  color: #fff;
  margin: 0 0 4px;
}
.banner-meta {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}
.banner-actions {
  display: flex;
  gap: 8px;
}
.btn-action {
  border-radius: 12px;
  font-weight: 900;
}

.drawer-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 28px;
}
.drawer-info-grid .col-span-2 {
  grid-column: span 2;
}

.info-item {}
.info-label {
  font-size: 10px;
  color: #9ca3af;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 4px;
}
.info-value {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}
.info-value-secondary {
  font-size: 14px;
  font-weight: 700;
  color: #4b5563;
}

/* ── Drawer section ── */
.drawer-section {
  margin-bottom: 28px;
}
.section-title {
  font-size: 13px;
  font-weight: 900;
  color: #1f2937;
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.finance-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.finance-item {}
.finance-label {
  font-size: 10px;
  color: #9ca3af;
  font-weight: 900;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.finance-value {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}
.finance-value.large {
  font-size: 20px;
  font-weight: 900;
}

.finance-status {}
.finance-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot-green {
  background: #10b981;
}
.dot-orange {
  background: #f97316;
}
.status-text {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.btn-small-action {
  border-radius: 12px;
  font-weight: 900;
}

/* ── Create dialog ── */
.form-row-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.zero-mb :deep(.el-form-item__content) {
  margin-bottom: 0;
}
.w-full {
  width: 100%;
}
.divider-line {
  height: 1px;
  background: #f3f4f6;
  margin: 12px 0;
}

.items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.items-header-label {
  font-size: 10px;
  font-weight: 900;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-row {
  background: #fff;
  border: 1px solid #f3f4f6;
  padding: 16px;
  border-radius: 12px;
  position: relative;
  transition: border-color 0.2s;
}
.item-row:hover {
  border-color: #dbeafe;
}

.item-row-content {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.item-field {
  flex: 1;
}
.item-field-sm {
  flex: 0 0 120px;
}
.asset-field {
  flex: 2;
}

.asset-selector {}
.asset-selector-label {
  font-size: 9px;
  font-weight: 900;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  display: block;
  margin-bottom: 4px;
}
.asset-selected {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.asset-id {
  font-weight: 700;
  color: #1f2937;
  font-size: 13px;
}
.asset-trace {
  font-size: 11px;
  color: #6b7280;
}
.asset-empty {
  font-size: 12px;
  color: #cbd5e1;
  margin-bottom: 6px;
  display: block;
}

.btn-remove-item {
  position: absolute;
  right: -4px;
  top: -4px;
  opacity: 0;
  transition: opacity 0.2s;
  background: #fff;
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.item-row:hover .btn-remove-item {
  opacity: 1;
}

.select-footer {
  display: flex;
  padding: 8px;
  border-top: 1px solid #f3f4f6;
}
.flex-1 {
  flex: 1;
}

.font-bold {
  font-weight: 700;
}

/* ── Dialog footers ── */
.dialog-footer-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.footer-total {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.total-label {
  font-size: 10px;
  color: #6b7280;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  line-height: 1;
}
.total-value {
  font-size: 18px;
  font-weight: 900;
  color: #111827;
  margin: 0;
}
.footer-buttons {
  display: flex;
  gap: 12px;
}

.dialog-footer-right {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  border-radius: 12px;
  padding: 0 32px;
  background: #1f2937;
  border-color: #374151;
  color: #9ca3af;
}
.btn-submit {
  border-radius: 12px;
  padding: 0 48px;
  font-weight: 900;
  box-shadow: 0 8px 20px rgba(64, 158, 255, 0.2);
}
.px-10 {
  padding-left: 40px;
  padding-right: 40px;
}

/* ── Payment dialog ── */
.payment-banner {
  background: #eff6ff;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
  text-align: center;
}
.payment-banner-label {
  font-size: 10px;
  color: #60a5fa;
  font-weight: 900;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.payment-banner-value {
  font-size: 28px;
  font-weight: 900;
  color: #1e40af;
  margin: 0;
}

/* ── Asset dialog ── */
.asset-notice {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #eff6ff;
  border-radius: 16px;
  margin-bottom: 20px;
}
.asset-notice-title {
  font-size: 14px;
  color: #1e40af;
  font-weight: 900;
  display: block;
}
.asset-notice-desc {
  font-size: 11px;
  color: #3b82f6;
  display: block;
  margin-top: 4px;
}
.text-blue-500 {
  color: #3b82f6;
}

.asset-search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.flex-1 {
  flex: 1;
}

.asset-table :deep(.el-table__row) {
  cursor: pointer;
}
.cell-asset-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.asset-id-main {
  font-weight: 700;
  color: #111827;
}
.asset-id-sub {
  font-size: 11px;
  color: #9ca3af;
}

.cell-asset-metrics {
  display: flex;
  gap: 16px;
}
.metric-item {}
.metric-label {
  font-size: 9px;
  color: #9ca3af;
  font-weight: 900;
  text-transform: uppercase;
  margin: 0 0 2px;
}
.metric-value {
  font-size: 12px;
  font-weight: 900;
}
.metric-value.text-emerald { color: #059669; }
.metric-value.text-orange { color: #f97316; }
.metric-value-secondary {
  font-size: 12px;
  font-weight: 900;
  color: #374151;
}

.cell-asset-perf {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #4b5563;
}

.cell-asset-trace {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #4b5563;
}

.cell-asset-location {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 12px;
  color: #4b5563;
}

/* ── Overrides ── */
:deep(.el-card__header) {
  border-bottom: none;
}

:deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: 20px 24px;
  font-weight: 900;
  font-size: 18px;
}
:deep(.el-drawer__body) {
  padding: 0 24px 24px;
}

:deep(.el-dialog__header) {
  font-weight: 900;
}
:deep(.el-dialog__body) {
  padding: 0 24px;
}
</style>
