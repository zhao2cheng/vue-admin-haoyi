<template>
  <div class="supplier-pay-page">
    <!-- 顶部概览卡 -->
    <el-card shadow="never" class="top-card">
      <div class="top-inner">
        <div class="top-left">
          <div class="stat-main">
            <p class="stat-label">供应商应付总额</p>
            <p class="stat-value">¥{{ fmtMoney(totals.payable) }}</p>
            <p class="stat-sub">按采购入库单汇总</p>
          </div>
          <div class="top-divider"></div>
          <div class="mini-list">
            <div class="mini">
              <p class="mini-label">已付总额</p>
              <p class="mini-value c-emerald">¥{{ fmtMoney(totals.paid) }}</p>
            </div>
            <div class="mini">
              <p class="mini-label">待付总额</p>
              <p class="mini-value orange">¥{{ fmtMoney(totals.balance) }}</p>
            </div>
            <div class="mini">
              <p class="mini-label">涉及供应商</p>
              <p class="mini-value">{{ supplierRows.length }}</p>
            </div>
          </div>
        </div>
        <el-button :icon="Refresh" circle class="refresh-btn" @click="refreshAll" />
      </div>
    </el-card>

    <!-- 供应商应付汇总 -->
    <el-card shadow="never" class="section-card">
      <div class="pane-head">
        <div class="pane-title">
          <h3>供应商应付台账</h3>
          <el-tag type="info" size="small" effect="plain" class="title-tag">来自采购入库单</el-tag>
        </div>
        <el-button :icon="Download" size="small" @click="exportLedger">导出台账</el-button>
      </div>
      <el-table :data="supplierRows" v-loading="loading" stripe>
        <el-table-column label="供应商" min-width="200">
          <template #default="{ row }">
            <span class="sup-name">{{ row.supplier }}</span>
          </template>
        </el-table-column>
        <el-table-column label="应付总额" width="160" align="right">
          <template #default="{ row }"><span class="c-blue">¥{{ fmtMoney(row.payable) }}</span></template>
        </el-table-column>
        <el-table-column label="已付总额" width="160" align="right">
          <template #default="{ row }"><span class="c-emerald">¥{{ fmtMoney(row.paid) }}</span></template>
        </el-table-column>
        <el-table-column label="待付余额" width="160" align="right">
          <template #default="{ row }"><span class="bal-amt" :class="row.balance > 0.005 ? 'c-orange' : 'c-emerald'">¥{{ fmtMoney(row.balance) }}</span></template>
        </el-table-column>
        <el-table-column label="采购单数" width="110" align="center" prop="count" />
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.balance > 0.005" type="primary" size="small" class="pay-btn" @click="openPay(row)">付款</el-button>
            <el-tag v-else type="success" size="small" effect="plain" class="settled-tag">已结清</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 付款记录 -->
    <el-card shadow="never" class="section-card">
      <div class="pane-head">
        <div class="pane-title">
          <h3>供应商付款记录</h3>
          <el-tag type="success" size="small" effect="plain" class="title-tag">实时同步</el-tag>
        </div>
        <div class="filter-bar">
          <el-input
            v-model="paySearch"
            placeholder="搜索单号、供应商、账户..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-date-picker
            v-model="payDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            size="small"
            clearable
          />
          <el-button :icon="Download" size="small" @click="exportPayments">导出记录</el-button>
        </div>
      </div>
      <el-table :data="pagedFilteredPayments" v-loading="loading" stripe>
        <el-table-column label="付款单号" width="130">
          <template #default="{ row }"><span class="mono c-blue">{{ row.pay_no }}</span></template>
        </el-table-column>
        <el-table-column label="供应商" min-width="160" prop="supplier" />
        <el-table-column label="实付金额" width="150" align="right">
          <template #default="{ row }"><span class="c-rose">-¥{{ row.amount }}</span></template>
        </el-table-column>
        <el-table-column label="支付方式" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" effect="plain" size="small" class="!rounded-md font-black">{{ row.channel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="出款账户" min-width="180" prop="account" />
        <el-table-column label="收款户名" min-width="140" prop="payee" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="success" size="small" effect="plain" class="!rounded-md font-black">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作人" width="120" prop="operator" />
        <el-table-column label="付款时间" width="170">
          <template #default="{ row }"><span class="mono">{{ row.created_at }}</span></template>
        </el-table-column>
        <el-table-column label="备注" min-width="140" prop="remark" />
      </el-table>

      <!-- 分页：对筛选后的付款记录全集切片，搜索/日期筛选仍作用于全部数据 -->
      <div v-if="filteredPayments.length" class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredPayments.length"
          :page-sizes="[10, 20, 50, 100, 200]"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
        />
      </div>
    </el-card>

    <!-- 付款弹窗 -->
    <el-dialog v-model="payDialogVisible" title="供应商付款执行" width="560px" class="pro-dialog pay-dialog">
      <div v-if="payRow">
        <div class="pay-hero">
          <div class="pay-hero-text">
            <div class="pay-hero-cap">供应商付款 ({{ payRow.supplier }})</div>
            <div class="pay-hero-amount">¥{{ fmtMoney(payRow.balance) }}</div>
            <div class="pay-hero-sub">待付余额 · 共 {{ payRow.count }} 张采购单</div>
          </div>
          <div class="pay-hero-icon">
            <el-icon :size="46"><Coin /></el-icon>
          </div>
        </div>

        <el-form label-position="top" class="pay-form">
          <el-form-item label="本次付款金额">
            <el-input-number v-model="payForm.amount" :min="0" :precision="2" :step="1000" :controls="false" class="w-full" placeholder="0.00" />
          </el-form-item>
          <el-form-item label="出款账户 (Account)">
            <el-select v-model="payForm.account" class="w-full" placeholder="选择出款账户">
              <el-option v-for="a in accounts" :key="a.no" :label="a.name" :value="a.name" />
            </el-select>
          </el-form-item>
        </el-form>

        <div class="pay-payee">
          <div class="pay-payee-head">
            <el-icon :size="14"><CreditCard /></el-icon>
            <span class="pay-payee-cap">收款方账户详情 (PAYEE ACCOUNT)</span>
          </div>
          <div class="pay-payee-row">
            <span class="pay-payee-label">收款人</span>
            <el-input v-model="payForm.payee" class="pay-payee-input" size="small" placeholder="收款户名" />
          </div>
          <div class="pay-payee-row">
            <span class="pay-payee-label">银行账号</span>
            <el-input v-model="payForm.bankAccount" class="pay-payee-input mono" size="small" placeholder="银行账号" />
          </div>
          <div class="pay-payee-row">
            <span class="pay-payee-label">开户行</span>
            <el-input v-model="payForm.bankName" class="pay-payee-input" size="small" placeholder="开户行" />
          </div>
          <div class="pay-method">
            <button
              v-for="m in payMethods"
              :key="m.value"
              type="button"
              class="pay-method-btn"
              :class="{ active: payForm.channel === m.value }"
              @click="payForm.channel = m.value"
            >
              <span class="pay-method-tag">{{ m.label }}</span>
            </button>
          </div>
        </div>

        <el-form label-position="top" class="pay-form">
          <el-form-item label="备注">
            <el-input v-model="payForm.remark" type="textarea" :rows="2" placeholder="付款备注（可选）" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="payDialogVisible = false">取消</el-button>
        <el-button class="pay-confirm-btn" :loading="paying" @click="submitPay">确认支付</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, CreditCard, Coin, Download, Search } from '@element-plus/icons-vue'
import { rowsApi, txApi } from '@/api/rows'
import { exportCsv, nowStamp } from '@/utils/export'

// ── 金额处理（库内金额为逗号 TEXT）──
const parseMoney = (s) => { const n = parseFloat(String(s ?? '0').replace(/,/g, '')); return isNaN(n) ? 0 : n }
const fmtMoney = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── 出款账户（与业绩结算中心同款）──
const accounts = ref([
  { name: '中国工商银行 (基本户)', no: '6222 **** **** 8891' },
  { name: '微信支付商户号', no: 'MID: 15928300' },
  { name: '支付宝企业号', no: 'fin@antigravity.com' },
])
const payMethods = [
  { label: '支付宝码', value: '支付宝码' },
  { label: '微信码', value: '微信码' },
  { label: '银行转账', value: '银行转账' },
]

const loading = ref(false)
const pos = ref([])          // purchase_orders 原始行
const payments = ref([])     // supplier_payments 原始行
const suppliers = ref([])    // suppliers 档案（收款信息预填）

// ── 按供应商汇总 ──
const supplierRows = computed(() => {
  const map = new Map()
  for (const po of pos.value) {
    const sup = po.supplier || '未知供应商'
    const total = parseMoney(po.total) || parseMoney(po.amount)   // 金额列历史不统一：total 或 amount
    const paid = parseMoney(po.paid_amount)
    const cur = map.get(sup) || { supplier: sup, payable: 0, paid: 0, count: 0 }
    cur.payable += total
    cur.paid += paid
    cur.count += 1
    map.set(sup, cur)
  }
  return [...map.values()].map((r) => ({ ...r, balance: r.payable - r.paid }))
})

const totals = computed(() =>
  supplierRows.value.reduce(
    (a, r) => ({ payable: a.payable + r.payable, paid: a.paid + r.paid, balance: a.balance + r.balance }),
    { payable: 0, paid: 0, balance: 0 },
  ),
)

const supplierInfoMap = computed(() => new Map(suppliers.value.map((s) => [s.name, s])))

async function loadAll() {
  loading.value = true
  try {
    const [poRes, payRes, supRes] = await Promise.all([
      rowsApi.list('purchase_orders', { size: 200, sort: 'id', order: 'asc' }),
      rowsApi.list('supplier_payments', { size: 200, sort: 'id', order: 'desc' }),
      rowsApi.list('suppliers', { size: 200 }),
    ])
    pos.value = poRes?.data?.list || []
    payments.value = payRes?.data?.list || []
    suppliers.value = supRes?.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}
onMounted(loadAll)

function refreshAll() {
  loadAll().then(() => ElMessage.success('数据已同步'))
}

// ── 付款记录筛选：关键字 / 时间范围 ──
const paySearch = ref('')
const payDateRange = ref(null)

const filteredPayments = computed(() => {
  let data = payments.value
  if (paySearch.value) {
    const q = paySearch.value.toLowerCase()
    data = data.filter((p) =>
      String(p.pay_no || p.id).toLowerCase().includes(q) ||
      (p.supplier || '').toLowerCase().includes(q) ||
      (p.account || '').toLowerCase().includes(q) ||
      (p.payee || '').toLowerCase().includes(q)
    )
  }
  if (payDateRange.value && payDateRange.value.length === 2) {
    const [start, end] = payDateRange.value
    data = data.filter((p) => {
      const d = (p.created_at || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

// 分页：对筛选后的付款记录全集切片，搜索/日期筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedFilteredPayments = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredPayments.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([paySearch, payDateRange, () => payments.value.length], () => {
  currentPage.value = 1
})

// ── Export ──
function exportLedger() {
  const list = supplierRows.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的应付台账')
    return
  }
  exportCsv(`供应商应付台账_${nowStamp()}.csv`,
    ['供应商', '应付总额(元)', '已付总额(元)', '待付余额(元)', '采购单数'],
    list.map(r => [
      r.supplier,
      r.payable.toFixed(2),
      r.paid.toFixed(2),
      r.balance.toFixed(2),
      r.count,
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条应付台账`)
}

function exportPayments() {
  const list = filteredPayments.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的付款记录')
    return
  }
  exportCsv(`供应商付款记录_${nowStamp()}.csv`,
    ['付款单号', '供应商', '实付金额(元)', '支付方式', '出款账户', '收款户名', '状态', '操作人', '付款时间', '备注'],
    list.map(p => [
      p.pay_no || p.id, p.supplier || '', p.amount, p.channel || '',
      p.account || '', p.payee || '', p.status || '', p.operator || '',
      p.created_at || '', p.remark || '',
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条付款记录`)
}

// ── 付款弹窗 ──
const payDialogVisible = ref(false)
const payRow = ref(null)
const paying = ref(false)
const payForm = ref({ amount: null, account: '', channel: '银行转账', payee: '', bankAccount: '', bankName: '', remark: '' })

function openPay(row) {
  payRow.value = row
  const info = supplierInfoMap.value.get(row.supplier)
  payForm.value = {
    amount: Math.round(row.balance * 100) / 100,
    account: accounts.value[0]?.name || '',
    channel: '银行转账',
    payee: info?.name || row.supplier,
    bankAccount: info?.bank_account || '',
    bankName: info?.bank_name || '',
    remark: '',
  }
  payDialogVisible.value = true
}

function submitPay() {
  const amt = parseMoney(payForm.value.amount)
  if (!(amt > 0)) return ElMessage.warning('请输入有效的付款金额')
  if (amt > payRow.value.balance + 0.005) {
    return ElMessage.warning(`付款金额不能超过待付余额 ¥${fmtMoney(payRow.value.balance)}`)
  }
  if (!payForm.value.account) return ElMessage.warning('请选择出款账户')
  paying.value = true
  txApi
    .supplierPay({
      supplier: payRow.value.supplier,
      amount: payForm.value.amount,
      account: payForm.value.account,
      channel: payForm.value.channel,
      remark: payForm.value.remark,
      payee: payForm.value.payee,
      bank_account: payForm.value.bankAccount,
      bank_name: payForm.value.bankName,
    })
    .then((res) => {
      const d = res?.data || {}
      payDialogVisible.value = false
      const covered = (d.allocation || []).length
      ElMessageBox.alert(
        `本次实付 ¥${d.amount || fmtMoney(amt)}，覆盖 ${covered} 张采购单，付款单号 ${d.payNo || '—'}`,
        '付款成功',
        { confirmButtonText: '好的' },
      ).catch(() => {})
      loadAll()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '付款失败'))
    .finally(() => (paying.value = false))
}
</script>

<style scoped>
.supplier-pay-page { display: flex; flex-direction: column; gap: 16px; }

/* 顶部概览卡 */
.top-card { border-radius: 28px; border: 1px solid #f0f2f5; }
.top-inner { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; }
.top-left { display: flex; align-items: center; gap: 40px; }
.stat-main .stat-label { font-size: 11px; font-weight: 800; color: #9ca3af; letter-spacing: .15em; text-transform: uppercase; margin: 0 0 8px; }
.stat-main .stat-value { font-size: 34px; font-weight: 900; color: #111827; margin: 0; line-height: 1; }
.stat-main .stat-sub { font-size: 11px; font-weight: 700; color: #10b981; margin: 8px 0 0; }
.top-divider { width: 1px; height: 48px; background: #f3f4f6; }
.mini-list { display: flex; gap: 36px; }
.mini-label { font-size: 11px; font-weight: 700; color: #9ca3af; margin: 0 0 6px; }
.mini-value { font-size: 20px; font-weight: 900; color: #374151; margin: 0; }
.mini-value.orange { color: #f97316; }
.refresh-btn { border-radius: 9999px; }

/* 区块卡 */
.section-card { border-radius: 28px; border: 1px solid #f0f2f5; }
.pane-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 12px; }

.filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-bar .search-input { width: 220px; }
.pane-title { display: flex; align-items: center; gap: 10px; }
.pane-title h3 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.title-tag { border-radius: 8px; font-weight: 700; }

/* 表格通用 */
.c-blue { color: #2563eb; font-weight: 700; }
.c-emerald { color: #059669; font-weight: 700; }
.c-rose { color: #f43f5e; font-weight: 700; }
.c-orange { color: #f97316; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }
.sup-name { font-size: 14px; font-weight: 800; color: #111827; }
.bal-amt { font-size: 15px; font-weight: 900; }
.settled-tag { border-radius: 8px; font-weight: 700; }
.pay-btn {
  --el-button-bg-color: #2563eb;
  --el-button-border-color: #2563eb;
  --el-button-hover-bg-color: #1d4ed8;
  --el-button-hover-border-color: #1d4ed8;
  font-weight: 800;
  border-radius: 9999px;
  padding-left: 16px; padding-right: 16px;
}

/* 付款弹窗 */
.pay-dialog :deep(.el-dialog__body) { padding: 18px 24px 8px; }
.pay-hero {
  background: linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%);
  border-radius: 20px;
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  margin-bottom: 18px;
  box-shadow: 0 12px 28px rgba(6, 78, 59, .25);
  position: relative;
  overflow: hidden;
}
.pay-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 80% at 100% 0%, rgba(16,185,129,.45), transparent 60%);
  pointer-events: none;
}
.pay-hero-text { position: relative; z-index: 1; }
.pay-hero-cap { font-size: 11px; letter-spacing: .12em; opacity: .75; font-weight: 700; text-transform: uppercase; }
.pay-hero-amount { font-size: 36px; font-weight: 900; margin: 6px 0 4px; line-height: 1.05; letter-spacing: -.02em; }
.pay-hero-sub { font-size: 11px; opacity: .65; font-weight: 600; }
.pay-hero-icon {
  width: 72px; height: 72px; border-radius: 18px;
  background: rgba(255,255,255,.12); display: grid; place-items: center;
  color: #fff; position: relative; z-index: 1;
  border: 1px solid rgba(255,255,255,.18);
}
.pay-form { margin-bottom: 6px; }
.pay-form :deep(.el-form-item__label) { font-weight: 800; color: #1f2937; }
.pay-payee {
  background: linear-gradient(180deg, #ecfdf5 0%, #f0fdf4 100%);
  border: 1px solid #a7f3d0;
  border-radius: 16px;
  padding: 16px 18px;
  margin-top: 6px;
}
.pay-payee-head {
  display: flex; align-items: center; gap: 8px;
  font-size: 10px; font-weight: 900; color: #047857;
  text-transform: uppercase; letter-spacing: .12em; margin-bottom: 12px;
}
.pay-payee-row {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 8px 0;
  border-top: 1px dashed #a7f3d0;
}
.pay-payee-row:first-of-type { border-top: none; }
.pay-payee-label { font-size: 12px; color: #6b7280; font-weight: 700; flex-shrink: 0; }
.pay-payee-input { max-width: 260px; }
.pay-method { display: flex; gap: 10px; margin-top: 14px; }
.pay-method-btn {
  flex: 1; height: 42px; border-radius: 12px; border: 1px solid #a7f3d0;
  background: #fff; cursor: pointer; transition: all .15s;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 800; color: #047857;
}
.pay-method-btn:hover { border-color: #10b981; box-shadow: 0 4px 10px rgba(16,185,129,.2); }
.pay-method-btn.active {
  border-color: #047857; background: linear-gradient(180deg, #d1fae5, #a7f3d0);
  box-shadow: inset 0 0 0 1px #047857;
}
.pay-confirm-btn {
  --el-button-bg-color: #10b981;
  --el-button-border-color: #10b981;
  --el-button-hover-bg-color: #059669;
  --el-button-hover-border-color: #059669;
  --el-button-active-bg-color: #047857;
  --el-button-active-border-color: #047857;
  font-weight: 900;
  padding-left: 28px; padding-right: 28px;
}

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
