<template>
  <div class="qd">
    <!-- Top bar: back + title + live + copy link -->
    <div class="qd-top">
      <div class="qd-left">
        <el-button circle size="small" class="back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <div>
          <h2 class="qd-title">多方出价横向比对中心</h2>
          <p class="qd-sub">PROJECT: {{ projectId }} • 顺风物流园电池处置</p>
        </div>
      </div>
      <div class="qd-right">
        <div class="live">
          <span class="live-dot"></span>
          <span class="live-text">实时竞价中</span>
        </div>
        <el-button type="primary" size="small" class="copy" @click="copyLink">复制对外录入链接</el-button>
      </div>
    </div>

    <!-- Body: left rail + bid cards -->
    <div class="qd-body">
      <!-- Left rail -->
      <div class="rail w-64 shrink-0">
        <div class="rail-card">
          <h3 class="rail-h">竞价标的项目</h3>
          <div class="asset-mini">
            <p class="asset-name">75kWh 翻新动力电池组</p>
            <div class="asset-row">
              <span class="lab">基准价:</span><span class="val">¥240,000</span>
            </div>
            <div class="asset-row">
              <span class="lab">参考数量:</span><span class="val">12 组</span>
            </div>
          </div>
          <h3 class="rail-h mt">渠道热度</h3>
          <div class="space-y-4">
            <div class="track-mini">
              <p class="lab">浏览次数</p>
              <p class="num text-blue-600">142</p>
            </div>
            <div class="track-mini">
              <p class="lab">有效出价</p>
              <p class="num text-emerald-600">6</p>
            </div>
          </div>
        </div>
        <div class="decision">
          <p class="dec-h">决策建议</p>
          <p class="dec-d">优先录用 <b>顺风物流</b>，其综合出价最高且资金回笼最快。</p>
        </div>
      </div>

      <!-- Bid cards -->
      <div class="bids">
        <div
          v-for="(b, i) in bids"
          :key="i"
          class="bid-card"
          :class="{ best: b.isBest }"
        >
          <div class="bid-head">
            <div class="bid-id">
              <div class="avatar">{{ b.name.charAt(0) }}</div>
              <div>
                <p class="bid-name">{{ b.name }}</p>
                <p class="bid-time">{{ b.time }} 提交</p>
              </div>
            </div>
            <el-tag v-if="b.isBest" size="small" type="success" effect="dark" class="best-tag">最优推介</el-tag>
          </div>

          <div class="bid-amount">
            <p class="amt-h">报价总额</p>
            <p class="amt-v" :class="{ em: b.isBest }">¥{{ b.price }}</p>
          </div>

          <div class="bid-items">
            <p class="items-h">方案明细 ({{ b.items.length }})</p>
            <div v-for="(it, j) in b.items" :key="j" class="item-pill">
              <p class="ip-name">{{ it.name }}</p>
              <div class="ip-row">
                <span class="ip-q">{{ it.qty }} x ¥{{ it.unitPrice }}</span>
                <span class="ip-s">¥{{ it.qty * it.unitPrice }}</span>
              </div>
            </div>
          </div>

          <div class="bid-foot">
            <div class="pay"><span class="pay-l">付款条件:</span><span class="pay-v">{{ b.payment }}</span></div>
            <el-button
              type="primary"
              class="accept"
              :class="b.isBest ? 'em' : 'dark'"
              @click="acceptBid(b)"
            > 录用并生成订单 </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { rowsApi, txApi } from '@/api/rows'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => route.params.id || 'QT240401')

/* ---------- 从后端加载报价竞价明细 ---------- */
const bids = ref([])

onMounted(async () => {
  try {
    const res = await rowsApi.list('quotation_bids', {
      size: 200, filter: JSON.stringify({ quotation_id: projectId.value })
    })
    bids.value = (res.data?.list || []).map(r => ({
      id: r.id, name: r.name || '', price: r.price || '', credit: r.credit || '',
      payment: r.payment || '', time: r.time || '', isBest: !!r.is_best,
      items: r.items_json ? JSON.parse(r.items_json) : [],
    }))
  } catch { /* 后端不可达时保留空列表 */ }
})

function copyLink() {
  const link = `${window.location.origin}/#/public-quote`
  navigator.clipboard?.writeText(link)
  ElMessage.success('外部竞价链接已复制')
}

function acceptBid(b) {
  ElMessageBox.confirm(
    `确认录用 <b>${b.name}</b> 的报价方案吗？录用后将自动生成正式销售单。`,
    '中签结论确认',
    { dangerouslyUseHTMLString: true, confirmButtonText: '立即转单', cancelButtonText: '再考虑下' }
  ).then(() => {
    txApi.quoteAccept({ quotationId: projectId.value, bidId: b.id })
      .then((r) => {
        ElMessage.success(`报价已录用！销售单 ${r?.data?.salesOrderId || '(SO)'} 已生成`)
        setTimeout(() => router.push('/inventory/sales'), 1500)
      })
      .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
  }).catch(() => {})
}

function goBack() {
  router.push('/inventory/quotations')
}
</script>

<style scoped>
.qd { padding: 0; }

/* Top bar */
.qd-top {
  display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
  background: #fff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px 20px; margin-bottom: 18px;
  box-shadow: 0 4px 16px -12px rgba(15,23,42,.3);
}
.qd-left { display: flex; align-items: center; gap: 12px; }
.back { background: #f8fafc; border-color: #e2e8f0; }
.qd-title { font-size: 14px; font-weight: 900; color: #111827; margin: 0; }
.qd-sub { margin: 3px 0 0; font-size: 11px; color: #94a3b8; font-family: ui-monospace, monospace; }
.qd-right { display: flex; align-items: center; gap: 12px; }
.live { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; border: 1px solid #d1fae5; padding: 6px 12px; border-radius: 12px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pulse 1.2s infinite; }
.live-text { font-size: 9px; font-weight: 900; color: #059669; }
.copy { font-weight: 700; background: #10b981 !important; border-color: #10b981 !important; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

/* Body */
.qd-body { display: flex; gap: 18px; align-items: flex-start; }

/* Left rail */
.rail { display: flex; flex-direction: column; }
.rail-card {
  background: #fff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px; box-shadow: 0 4px 16px -12px rgba(15,23,42,.3);
}
.rail-h { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: .1em; margin: 0 0 16px; }
.rail-h.mt { margin-top: 24px; }
.asset-mini { background: #f9fafb; padding: 12px; border-radius: 12px; margin-bottom: 24px; }
.asset-name { font-size: 12px; font-weight: 900; color: #111827; line-height: 1.3; margin: 0; }
.asset-row { display: flex; justify-content: space-between; margin-top: 8px; font-size: 9px; font-weight: 700; }
.asset-row .lab { color: #9ca3af; }
.asset-row .val { color: #111827; }
.track-mini { margin-bottom: 16px; }
.track-mini .lab { margin: 0; font-size: 9px; color: #9ca3af; }
.track-mini .num { margin: 4px 0 0; font-size: 18px; font-weight: 900; }
.text-blue-600 { color: #2563eb !important; }
.text-emerald-600 { color: #059669 !important; }
.decision {
  margin-top: 16px; background: #064e3b; border-radius: 12px; padding: 12px 14px; color: #fff;
}
.dec-h { font-size: 9px; font-weight: 900; color: #6ee7b7; text-transform: uppercase; letter-spacing: .1em; margin: 0 0 4px; }
.dec-d { font-size: 10px; opacity: .8; line-height: 1.5; margin: 0; }

/* Bid cards */
.bids { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; flex: 1; }
.bid-card {
  width: 288px; flex-shrink: 0; display: flex; flex-direction: column;
  border-radius: 16px; padding: 16px; background: #fff; border: 1px solid #f1f5f9;
  transition: all .15s; box-shadow: 0 4px 16px -12px rgba(15,23,42,.3);
}
.bid-card.best { background: #ecfdf5; border-color: #a7f3d0; }
.bid-head { display: flex; justify-content: space-between; align-items: flex-start; }
.bid-id { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 36px; height: 36px; border-radius: 10px; background: #1e293b; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900;
}
.bid-name { font-size: 13px; font-weight: 800; color: #111827; margin: 0; }
.bid-time { font-size: 10px; color: #9ca3af; margin: 2px 0 0; }
.best-tag { transform: scale(.75); transform-origin: right; }
.bid-amount { margin-top: 16px; }
.amt-h { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: .1em; margin: 0 0 4px; }
.amt-v { font-size: 24px; font-weight: 900; color: #111827; margin: 0; }
.amt-v.em { color: #059669; }
.bid-items { margin-top: 16px; }
.items-h { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: .1em; margin: 0 0 8px; }
.item-pill { background: rgba(255,255,255,.6); border: 1px solid #f8fafc; border-radius: 10px; padding: 8px; margin-bottom: 8px; }
.ip-name { font-size: 12px; font-weight: 700; color: #334155; margin: 0; }
.ip-row { display: flex; justify-content: space-between; font-size: 11px; }
.ip-q { color: #94a3b8; }
.ip-s { font-weight: 800; color: #0f172a; }
.bid-foot { margin-top: auto; padding-top: 14px; }
.pay { margin-bottom: 10px; }
.pay-l { font-size: 9px; color: #9ca3af; font-weight: 700; margin-right: 4px; }
.pay-v { font-size: 12px; font-weight: 800; color: #111827; }
.accept { width: 100%; border-radius: 12px; height: 40px; font-size: 12px; font-weight: 900; box-shadow: 0 8px 20px -8px rgba(16,185,129,.5); }
.accept.em { background: #10b981 !important; border-color: #10b981 !important; }
.accept.dark { background: #111827 !important; border-color: #111827 !important; }
</style>
