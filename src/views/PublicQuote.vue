<template>
  <div class="public-quote-page min-h-screen bg-gray-50 p-4 md:p-8 flex flex-col items-center">
    <!-- 深色 hero 卡片 -->
    <div class="hero-wrapper relative max-w-xl w-full">
      <div class="hero-card">
        <div class="hero-deco"></div>
        <div class="hero-top">
          <span class="hero-no">单号 {{ quoteId }}</span>
          <el-button text size="small" class="copy-btn" @click="copyLink">
            <el-icon class="mr-1"><Link /></el-icon>复制竞价链接
          </el-button>
        </div>
        <el-tag effect="dark" type="warning" class="quote-tag">竞价邀约中</el-tag>
        <h1 class="hero-title">
          顺风物流园电池处置项目<br />
          <span class="hero-accent">在线报价通道</span>
        </h1>
        <div class="hero-meta">
          <div class="meta-item">
            <el-icon><Clock /></el-icon>
            <span>截止: 04-30 18:00</span>
          </div>
          <div class="meta-item">
            <el-icon><User /></el-icon>
            <span>负责人: 陈业务</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 报价表单 -->
    <div class="form-card max-w-xl w-full bg-white rounded-3xl shadow-sm border border-gray-100 p-6 mt-6">
      <h3 class="step-title">第一步：填写您的身份信息</h3>
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="企业/个人名称">
            <el-input v-model="form.name" placeholder="请输入您的全名" />
          </el-form-item>
          <el-form-item label="联系电话">
            <el-input v-model="form.phone" placeholder="接收中签通知" />
          </el-form-item>
        </div>
      </el-form>

      <div class="step-head">
        <h3 class="step-title mb-0">第二步：完善报价资产明细</h3>
        <el-button type="primary" link :icon="Plus" class="add-btn" @click="addItem">新增报价项</el-button>
      </div>

      <div class="items-wrap">
        <div
          v-for="(item, i) in form.items"
          :key="i"
          class="product-card bg-gray-50 p-5 rounded-3xl border border-transparent relative group"
        >
          <el-button
            v-if="form.items.length > 1"
            class="del-btn"
            type="danger"
            circle
            :icon="Delete"
            @click="removeItem(i)"
          />
          <el-form-item label="资产名称/规格">
            <el-input v-model="item.name" placeholder="例如：75kWh 三元锂模组" />
          </el-form-item>
          <div class="num-grid">
            <el-form-item label="数量 (组/台)">
              <el-input-number v-model="item.qty" :min="1" class="w-full" />
            </el-form-item>
            <el-form-item label="意向单价 (¥)">
              <el-input-number v-model="item.price" :precision="2" class="w-full" />
            </el-form-item>
          </div>
        </div>
      </div>

      <h3 class="step-title">第三步：支付与物流备注</h3>
      <el-form label-position="top">
        <el-form-item label="期望支付条件">
          <el-select v-model="form.payment" class="w-full">
            <el-option label="全额预付 (推荐)" value="全额预付" />
            <el-option label="货到付款" value="货到付款" />
            <el-option label="分期结算" value="分期结算" />
          </el-select>
        </el-form-item>
        <el-form-item label="物流安排">
          <el-radio-group v-model="form.logistics" class="custom-radio-group">
            <el-radio label="self" border>自提</el-radio>
            <el-radio label="vendor" border>需配送</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <div class="submit-area">
        <el-button
          type="primary"
          class="submit-btn w-full !rounded-2xl h-14 !text-base font-black"
          :loading="submitting"
          @click="submit"
        >提交正式报价方案</el-button>
        <p class="agree-tip">提交即代表您已同意《资产处置竞价协议》</p>
      </div>
    </div>

    <!-- 底部固定提交条 -->
    <div class="sticky-bar fixed bottom-0 inset-x-0 z-10">
      <div class="max-w-xl mx-auto px-4 pb-4">
        <el-button type="primary" class="w-full !rounded-xl h-12 font-bold" @click="submit">提交报价</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Clock, User, Link } from '@element-plus/icons-vue'
import api from '@/api/index'

const route = useRoute()
const quoteId = ref(route.query.q || 'QT240401')

// 对外公开报价页数据
const form = reactive({
  name: '',
  phone: '',
  items: [{ name: '75kWh 翻新动力电池组', qty: 12, price: 21000 }],
  payment: '全额预付',
  logistics: 'self',
})
const submitting = ref(false)

function addItem() {
  form.items.push({ name: '', qty: 1, price: 0 })
}
function removeItem(i) {
  form.items.splice(i, 1)
}
function copyLink() {
  const url = `${window.location.origin}/#/public-quote?q=${encodeURIComponent(quoteId.value)}`
  navigator.clipboard?.writeText(url)
  ElMessage.success('外部竞价链接已复制')
}
function submit() {
  if (!form.name || !form.phone) {
    return ElMessage.error('请填写您的基本身份信息')
  }
  submitting.value = true
  api.post('/open/quote-submit', {
    quotationId: quoteId.value,
    name: form.name,
    phone: form.phone,
    payment: form.payment,
    logistics: form.logistics,
    items: form.items,
  })
    .then(() => {
      submitting.value = false
      ElMessageBox.alert(
        '您的报价已成功上传至竞价系统，请保持电话畅通，我们将在竞价结束后第一时间通知您结果。',
        '提交成功',
        {
          confirmButtonText: '查看我的报价单',
          callback: () => {
            window.location.reload()
          },
        }
      )
    })
    .catch((e) => {
      submitting.value = false
      ElMessage.error(e?.response?.data?.message || '提交失败，请稍后重试')
    })
}
</script>

<style scoped>
.public-quote-page { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; padding-bottom: 90px; }
.hero-wrapper { }
.hero-card {
  background: #064e3b;
  border-radius: 40px;
  padding: 32px;
  color: #fff;
  box-shadow: 0 20px 40px rgba(6, 78, 59, 0.3);
  position: relative;
  overflow: hidden;
}
.hero-deco {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 160px;
  height: 160px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50%;
  filter: blur(40px);
}
.hero-top { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.hero-no { font-size: 11px; color: #a7f3d0; font-family: ui-monospace, monospace; }
.copy-btn { color: #a7f3d0; border-color: rgba(167, 243, 208, 0.4); }
.quote-tag { border-radius: 9999px; font-weight: 900; padding: 0 16px; margin-bottom: 16px; position: relative; z-index: 1; }
.hero-title { font-size: 24px; font-weight: 900; margin: 0 0 24px; line-height: 1.3; position: relative; z-index: 1; }
.hero-accent { color: #34d399; }
.hero-meta { display: flex; gap: 20px; position: relative; z-index: 1; }
.meta-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a7f3d0; }

.form-card { }
.step-title { font-size: 10px; font-weight: 900; color: #9ca3af; letter-spacing: 0.2em; text-transform: uppercase; margin: 24px 0 12px; }
.step-title.mb-0 { margin-bottom: 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.step-head { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 12px; }
.add-btn { font-weight: 900; font-size: 12px; }

.items-wrap { display: flex; flex-direction: column; gap: 12px; }
.product-card { transition: border-color 0.2s; }
.product-card:hover { border-color: #a7f3d0; }
.del-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}
.product-card:hover .del-btn { opacity: 1; }
.num-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.w-full { width: 100%; }
.custom-radio-group { display: flex; gap: 12px; }

.submit-area { margin-top: 24px; }
.submit-btn {
  box-shadow: 0 12px 24px rgba(167, 243, 208, 0.4);
  transition: all 0.15s;
}
.submit-btn:active { transform: scale(0.95); }
.agree-tip { text-align: center; font-size: 10px; color: #9ca3af; margin: 16px 0 0; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }

.sticky-bar {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
}
@media (max-width: 640px) {
  .form-grid, .num-grid { grid-template-columns: 1fr; }
}
</style>
