<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content">
        <div class="title-section">
          <h3>电池回收订单</h3>
          <p>管理所有废旧电池回收申请与处理进度</p>
        </div>
        <div class="filter-bar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索订单号、客户、电话..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
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
          <el-radio-group v-model="filterStatus" size="large" class="status-tabs">
            <el-radio-button label="all">全部</el-radio-button>
            <el-radio-button label="pending">待评估</el-radio-button>
            <el-radio-button label="processing">处理中</el-radio-button>
            <el-radio-button label="completed">已完成</el-radio-button>
          </el-radio-group>
          <el-button plain :icon="Download" @click="exportOrders">导出</el-button>
        </div>
      </div>
    </template>

      <el-table :data="pagedFilteredOrders" style="width:100%" v-loading="tableLoading" class="dense-table">
        <!-- 订单信息 -->
        <el-table-column label="订单信息" min-width="240">
          <template #default="{ row }">
            <div class="order-info-cell">
              <div class="icon-circle">
                <el-icon><RefreshRight /></el-icon>
              </div>
              <div class="order-meta">
                <p class="order-id">订单号: {{ row.id }}</p>
                <p class="order-time">{{ row.time }}</p>
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- 来源徽标 -->
        <el-table-column label="来源" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.source === 'miniapp'" type="success" size="small" effect="plain">小程序</el-tag>
            <el-tag v-else type="info" size="small" effect="plain">销售录入</el-tag>
          </template>
        </el-table-column>

        <!-- 电池详情 -->
        <el-table-column label="电池详情" min-width="200">
          <template #default="{ row }">
            <p class="battery-brand">{{ row.brand }} / {{ row.type }}</p>
            <p class="battery-spec">数量: {{ row.count }} | 容量: {{ row.capacity }}</p>
          </template>
        </el-table-column>

        <!-- 客户信息 -->
        <el-table-column label="客户信息" width="180">
          <template #default="{ row }">
            <p class="customer-name">{{ row.userName }}</p>
            <p class="customer-phone">{{ row.phone }}</p>
          </template>
        </el-table-column>

        <!-- 估价金额 -->
        <el-table-column label="估价金额" width="140">
          <template #default="{ row }">
            <span class="valuation">¥{{ row.valuation }}</span>
          </template>
        </el-table-column>

        <!-- 当前状态 -->
        <el-table-column label="当前状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="dot">
              {{ statusLabel(row.status) }}
            </el-tag>
            <el-tag v-if="row.returnStatus === 1" type="danger" size="small" effect="dark" class="ml-1">退货退款中</el-tag>
            <el-tag v-else-if="row.returnStatus === 2" type="info" size="small" effect="plain" class="ml-1">已退货退款</el-tag>
          </template>
        </el-table-column>

        <!-- 客户收款 -->
        <el-table-column label="客户收款" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.payeeChannel" type="success" size="small" effect="plain">{{ row.payeeChannel }}</el-tag>
            <span v-else class="pay-none">—</span>
          </template>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column label="操作" width="150" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              link type="primary"
              @click="openAudit(row)"
            >审核评估</el-button>
            <el-button
              v-if="row.status === 'processing'"
              link type="primary"
              @click="completeOrder(row)"
            >完成回收</el-button>
            <el-button
              link type="primary"
              @click="openDetail(row)"
            >详情</el-button>
          </template>
        </el-table-column>
      </el-table>

    <!-- 分页：对筛选后的全集切片，搜索/状态/日期筛选仍作用于全部数据 -->
    <div class="pagination-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="filteredOrders.length"
        :page-sizes="[10, 20, 50, 100, 200]"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
      />
    </div>

    <!-- ========== 订单详情抽屉 ========== -->
    <el-drawer
      v-model="drawerVisible"
      title="回收订单详情"
      size="500px"
      class="recycle-detail-drawer"
    >
      <template v-if="currentOrder">
        <!-- 状态横幅 -->
        <div :class="['status-banner', currentOrder.status]">
          <el-icon :size="24"><BatteryCharging /></el-icon>
          <div class="banner-text">
            <p class="banner-status">{{ statusLabel(currentOrder.status) }}
              <el-tag v-if="currentOrder.returnStatus === 1" type="danger" size="small" effect="dark" class="ml-2">退货退款处理中</el-tag>
              <el-tag v-else-if="currentOrder.returnStatus === 2" type="info" size="small" effect="plain" class="ml-2">退货已完成</el-tag>
            </p>
            <p class="banner-id">单号: {{ currentOrder.id }}</p>
          </div>
        </div>

        <el-scrollbar height="calc(100vh - 280px)">
          <div class="drawer-body">
            <!-- 电池产品信息 -->
            <div class="section-title">电池产品信息</div>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="品牌/型号">{{ currentOrder.brand }}</el-descriptions-item>
              <el-descriptions-item label="电池类型">{{ currentOrder.type }}</el-descriptions-item>
              <el-descriptions-item label="标称容量">{{ currentOrder.capacity }}</el-descriptions-item>
              <el-descriptions-item label="回收数量">{{ currentOrder.count }}</el-descriptions-item>
              <el-descriptions-item label="预估金额">
                <span class="valuation">¥{{ currentOrder.valuation }}</span>
              </el-descriptions-item>
            </el-descriptions>

            <!-- 客户联系信息 -->
            <div class="section-title">客户联系信息</div>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="联系人">{{ currentOrder.userName }}</el-descriptions-item>
              <el-descriptions-item label="联系电话">{{ currentOrder.phone }}</el-descriptions-item>
              <el-descriptions-item label="回收地址">{{ currentOrder.address || '上海市浦东新区张江路 888 号' }}</el-descriptions-item>
            </el-descriptions>

            <!-- 回收现场照片 -->
            <div class="section-title">回收现场照片 ({{ allPhotoItems.length }})</div>
            <div v-if="allPhotoItems.length" class="photo-album">
              <div class="photo-grid">
                <div
                  v-for="(item, i) in allPhotoItems" :key="i"
                  class="photo-cell"
                  @click="openLightbox(i)"
                >
                  <img :src="item.url" class="photo-img" alt="" />
                  <span v-if="item.label" class="photo-tag">{{ item.label }}</span>
                </div>
              </div>
            </div>
            <div v-else class="payee-none">暂无现场照片</div>

            <!-- 照片灯箱（上一张/下一张） -->
            <Teleport to="body">
              <div v-if="lightboxVisible" class="lightbox" @click.self="closeLightbox">
                <button class="lb-btn lb-prev" :class="{ disabled: lightboxIndex <= 0 }" @click.stop="prevPhoto">‹</button>
                <img class="lb-img" :src="allPhotoUrls[lightboxIndex]" alt="" @click.stop />
                <button class="lb-btn lb-next" :class="{ disabled: lightboxIndex >= allPhotoUrls.length - 1 }" @click.stop="nextPhoto">›</button>
                <div class="lb-bar">
                  <span class="lb-count">{{ lightboxIndex + 1 }} / {{ allPhotoUrls.length }}</span>
                  <button class="lb-close" @click.stop="closeLightbox">✕</button>
                </div>
              </div>
            </Teleport>

            <!-- 财务结算状态 -->
            <div class="section-title">财务结算状态 (Finance)</div>
            <div class="finance-panel">
              <div class="finance-row">
                <div class="finance-item">
                  <p class="finance-label">应付总额 (Total)</p>
                  <p class="finance-value total">¥{{ currentOrder.valuation }}</p>
                </div>
                <div class="finance-divider"></div>
                <div class="finance-item">
                  <p class="finance-label">累计实付 (Paid)</p>
                  <p class="finance-value paid">¥{{ currentOrder.paidAmount || '0.00' }}</p>
                </div>
              </div>
              <div class="finance-row-bottom">
                <div class="finance-item">
                  <p class="finance-label">待付余额 (Balance)</p>
                  <p class="finance-value balance">¥{{ balanceAmount }}</p>
                </div>
                <div class="finance-item">
                  <p class="finance-label">当前状态</p>
                  <el-tag
                    :type="isFullyPaid ? 'success' : 'danger'"
                    effect="dark"
                    size="small"
                    class="settlement-tag"
                  >{{ isFullyPaid ? '已结清' : '待支付' }}</el-tag>
                </div>
              </div>
            </div>

            <!-- 客户收款信息（报价后业务员登记） -->
            <div class="section-title">客户收款信息</div>
            <div class="payee-panel">
              <div class="payee-head">
                <el-tag v-if="currentOrder.payeeChannel" type="success" effect="plain" size="small">
                  收款渠道：{{ currentOrder.payeeChannel }}
                </el-tag>
                <span v-else class="payee-none">尚未登记</span>
                <div class="payee-head-actions">
                  <el-button
                    v-if="canFinance && currentOrder.payeeChannel && !isFullyPaid"
                    type="success"
                    size="small"
                    class="payee-pay-btn"
                    @click="payToCustomer"
                  >💳 打款给客户</el-button>
                  <el-button link type="primary" size="small" class="payee-edit-btn" @click="openPayeeEdit">
                    {{ currentOrder.payeeChannel ? '编辑收款信息' : '登记收款信息' }}
                  </el-button>
                </div>
              </div>
              <div v-if="currentOrder.payeeChannel" class="payee-body">
                <div class="payee-qr-row">
                  <div v-for="c in payeeChannelList" :key="c.key" class="payee-qr-cell" :title="c.label">
                    <el-image
                      v-if="currentOrder[c.field]"
                      :src="currentOrder[c.field]"
                      :preview-src-list="[currentOrder[c.field]]"
                      preview-teleported
                      fit="cover"
                      class="payee-qr-thumb"
                    />
                    <div v-else class="payee-qr-empty">{{ c.short }}</div>
                    <span class="payee-qr-label">{{ c.label }}</span>
                  </div>
                </div>
                <div v-if="currentOrder.payeeBankHolder || currentOrder.payeeBankName || currentOrder.payeeBankAccount" class="payee-bank">
                  <p class="payee-bank-line">
                    <span>户名：</span>{{ currentOrder.payeeBankHolder || '—' }}
                  </p>
                  <p class="payee-bank-line">
                    <span>开户行：</span>{{ currentOrder.payeeBankName || '—' }} {{ currentOrder.payeeBankBranch || '' }}
                  </p>
                  <p class="payee-bank-line">
                    <span>账号：</span>{{ currentOrder.payeeBankAccount || '—' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- 业务流程追踪 -->
            <div class="section-title">业务流程追踪</div>
            <el-timeline>
              <el-timeline-item
                v-for="(s, i) in timelineSteps"
                :key="i"
                :timestamp="s.time"
                :type="s.type"
                :hollow="s.hollow"
              >{{ s.text }}</el-timeline-item>
            </el-timeline>
          </div>
        </el-scrollbar>

        <!-- 操作栏（固定在抽屉底部，始终可见；只要未结清即显示，与回收是否完成无关） -->
        <div v-if="currentOrder && !isFullyPaid" class="drawer-footer-actions">
          <el-button
            v-if="!currentOrder.paymentApplied"
            type="warning"
            class="footer-btn apply-btn"
            @click="applyPayment"
          >业务员发起申请</el-button>
          <el-button
            v-if="canFinance"
            type="success"
            class="footer-btn pay-btn"
            @click="payToCustomer"
          >执行财务打款</el-button>
        </div>
        <div v-else-if="currentOrder && isFullyPaid" class="drawer-footer-done">✓ 该订单已完成回收并结清，操作已全部锁定</div>
      </template>
    </el-drawer>

    <!-- ========== 审核评估对话框 ========== -->
    <el-dialog
      v-model="auditVisible"
      title="回收订单审核评估"
      width="720px"
      align-center
      class="custom-dialog"
    >
      <el-form :model="auditForm" label-width="100px" class="audit-form">
        <!-- 订单快照 -->
        <div class="form-section">
          <el-descriptions title="订单快照" :column="1" border>
            <el-descriptions-item label="电池品牌">{{ currentOrder?.brand }}</el-descriptions-item>
            <el-descriptions-item label="电池类型">{{ currentOrder?.type }}</el-descriptions-item>
            <el-descriptions-item label="申报数量">{{ currentOrder?.count }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 核心评估定价 -->
        <div class="form-section">
          <p class="section-label">核心评估定价 (Pricing)</p>
          <el-form-item label="评估总价" class="pricing-item">
            <el-input-number v-model="auditForm.price" :min="0" class="full-width" size="large" />
          </el-form-item>
          <el-form-item label="收款人">
            <el-input v-model="auditForm.payee" placeholder="默认为申请人名称" />
          </el-form-item>
        </div>

        <!-- 收款账户详情 -->
        <div class="form-section">
          <p class="section-label with-icon">
            <el-icon><Wallet /></el-icon> 收款账户详情 (Payment Details)
          </p>
          <el-row :gutter="10">
            <el-col :span="12">
              <el-form-item label="银行账号" label-width="70px" class="compact-item">
                <el-input v-model="auditForm.bankAccount" placeholder="卡号/支付宝" size="small" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="开户行" label-width="70px" class="compact-item">
                <el-input v-model="auditForm.bankName" placeholder="分行名称" size="small" />
              </el-form-item>
            </el-col>
          </el-row>
          <div class="qr-row">
            <div class="qr-item">
              <p class="qr-label">支付宝码</p>
              <el-icon v-if="!auditForm.alipayQR" :size="14" class="qr-placeholder"><PictureFilled /></el-icon>
              <img v-else :src="auditForm.alipayQR" class="qr-img" />
            </div>
            <div class="qr-item">
              <p class="qr-label">微信码</p>
              <el-icon v-if="!auditForm.wechatQR" :size="14" class="qr-placeholder"><PictureFilled /></el-icon>
              <img v-else :src="auditForm.wechatQR" class="qr-img" />
            </div>
          </div>
        </div>

        <el-form-item label="上门时间">
          <el-date-picker v-model="auditForm.visitTime" type="datetime" class="full-width" />
        </el-form-item>
        <el-form-item label="审核备注">
          <el-input v-model="auditForm.remark" type="textarea" placeholder="输入审核意见或评估说明" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="auditVisible = false">取消</el-button>
          <el-button type="primary" @click="submitAudit" :loading="actionLoading">审核通过</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ========== 财务支付对话框 ========== -->
    <el-dialog
      v-model="paymentVisible"
      title="财务出纳支付执行"
      width="720px"
      align-center
      class="custom-dialog"
    >
      <template v-if="currentOrder">
        <div class="payment-dialog-body">
          <!-- 支付摘要 -->
          <div class="payment-summary">
            <div class="payment-icon-wrap">
              <el-icon :size="60"><Wallet /></el-icon>
            </div>
            <p class="payment-title">待支付金额 (ID: {{ currentOrder.id }})</p>
            <p class="payment-amount">¥{{ currentOrder.valuation }}</p>
          </div>

          <!-- 收款方账户详情 -->
          <div class="payee-details">
            <p class="section-label with-icon">
              <el-icon><Wallet /></el-icon> 收款方账户详情 (Payee Account)
            </p>
            <template v-if="currentOrder.payeeChannel">
              <div class="payee-info-list">
                <div class="payee-row">
                  <span class="payee-label">收款渠道:</span>
                  <el-tag type="success" effect="plain" size="small">{{ currentOrder.payeeChannel }}</el-tag>
                </div>
                <div class="payee-row">
                  <span class="payee-label">收款人:</span>
                  <span class="payee-value">{{ currentOrder.payeeBankHolder || currentOrder.userName }}</span>
                </div>
                <div v-if="currentOrder.payeeBankAccount" class="payee-row">
                  <span class="payee-label">银行账号:</span>
                  <span class="payee-value mono">{{ currentOrder.payeeBankAccount }}</span>
                </div>
                <div v-if="currentOrder.payeeBankName || currentOrder.payeeBankBranch" class="payee-row">
                  <span class="payee-label">开户行:</span>
                  <span class="payee-value">{{ currentOrder.payeeBankName }} {{ currentOrder.payeeBankBranch }}</span>
                </div>
                <div class="payee-qr-row">
                  <el-popover
                    v-for="c in payeeChannelList"
                    :key="c.key"
                    placement="top"
                    :width="180"
                    trigger="hover"
                  >
                    <template #reference>
                      <el-button size="small" type="primary" plain class="qr-btn">{{ c.label }}码</el-button>
                    </template>
                    <div class="qr-popover">
                      <p class="qr-popover-title">{{ c.label }}收款码</p>
                      <div class="qr-popover-img">
                        <el-image
                          v-if="currentOrder[c.field]"
                          :src="currentOrder[c.field]"
                          :preview-src-list="[currentOrder[c.field]]"
                          preview-teleported
                          fit="contain"
                          class="payee-qr-preview"
                        />
                        <el-icon v-else :size="40" class="text-gray-300"><PictureFilled /></el-icon>
                      </div>
                    </div>
                  </el-popover>
                </div>
              </div>
            </template>
            <div v-else class="payee-missing">
              <el-icon :size="16"><Warning /></el-icon>
              <span>该订单尚未登记客户收款信息，请先在订单详情「客户收款信息」区登记收款码 / 银行卡后再打款。</span>
            </div>
          </div>

          <!-- 支付表单 -->
          <el-form :model="paymentForm" label-position="top">
            <el-form-item label="本次实付金额">
              <el-input-number
                v-model="paymentForm.amount"
                :min="0"
                :precision="2"
                class="full-width"
                size="large"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="出款账户 (Account)">
              <el-select v-model="paymentForm.account" class="full-width" size="large">
                <el-option label="中国工商银行 (基本户)" value="中国工商银行 (基本户)" />
                <el-option label="微信支付商户号" value="微信支付商户号" />
                <el-option label="支付宝企业号" value="支付宝企业号" />
              </el-select>
            </el-form-item>
            <el-form-item label="财务付款项 (Item Class)">
              <el-select v-model="paymentForm.item" class="full-width" size="large">
                <el-option label="采购货款" value="采购货款" />
                <el-option label="物流快递费" value="物流快递费" />
                <el-option label="回收预付款" value="回收预付款" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </template>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="paymentVisible = false" class="rounded-btn">取消</el-button>
          <el-button type="primary" class="pay-submit-btn" @click="submitPayment">确认拨款支付</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ========== 客户收款信息编辑对话框 ========== -->
    <el-dialog
      v-model="payeeVisible"
      :title="currentOrder?.payeeChannel ? '编辑客户收款信息' : '登记客户收款信息'"
      width="560px"
      align-center
      class="pro-dialog"
    >
      <el-form :model="payeeForm" label-width="90px" label-position="left" class="pt-4 pr-4">
        <el-form-item label="收款渠道">
          <el-select v-model="payeeForm.channel" class="w-full">
            <el-option v-for="c in payeeChannelList" :key="c.key" :label="c.label" :value="c.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户收款码">
          <div class="qr-upload-grid">
            <div v-for="c in payeeChannelList" :key="c.key" class="qr-uploader" @click="pickPayeeQr(c.field)">
              <img v-if="payeeForm[c.field]" :src="payeeForm[c.field]" class="qr-upload-img" />
              <el-icon v-else size="28" class="text-gray-200"><Picture /></el-icon>
              <span class="qr-upload-hint">{{ payeeForm[c.field] ? '点击更换' : '点击上传' }}</span>
              <span class="qr-upload-label">{{ c.label }}</span>
              <span v-if="payeeForm[c.field]" class="qr-remove" @click.stop="payeeForm[c.field] = ''">✕</span>
            </div>
          </div>
          <input ref="payeeFileInput" type="file" accept="image/*" class="hidden-input" @change="onPayeeFileChange" />
          <p class="qr-tip">上传客户手机上的收款码；银行卡转账渠道由下方银行信息展示。</p>
        </el-form-item>
        <el-form-item label="收款户名">
          <el-input v-model="payeeForm.bankHolder" placeholder="客户真实姓名" />
        </el-form-item>
        <el-form-item label="开户行">
          <el-input v-model="payeeForm.bankName" placeholder="如：中国建设银行" />
        </el-form-item>
        <el-form-item label="开户支行">
          <el-input v-model="payeeForm.bankBranch" placeholder="如：广州白云支行（选填）" />
        </el-form-item>
        <el-form-item label="银行账号">
          <el-input v-model="payeeForm.bankAccount" placeholder="请输入银行卡号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-btns">
          <el-button @click="payeeVisible = false">取消</el-button>
          <el-button type="primary" class="px-8" :loading="payeeSaving" @click="savePayee">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight, Wallet, PictureFilled, Picture, Warning, Download, Search } from '@element-plus/icons-vue'
import { rowsApi, txApi } from '@/api/rows'
import { exportCsv, toNum, nowStamp } from '@/utils/export'
import { uploadImage } from '@/utils/upload'
import { useAuthStore } from '@/store/auth'

const auth = useAuthStore()
// 财务打款为 finance 域操作：无财务权限的账号（如仓管）隐藏打款按钮
const canFinance = computed(() => {
  const p = auth.user?.permissions || []
  return p.includes('*') || p.includes('finance')
})

// 回收现场照片：解析后端 photos 字段（JSON 字符串），并把相对 /uploads 路径补成可访问的绝对地址
const UPLOAD_BASE =
  (typeof window !== 'undefined' && window.location)
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : 'http://127.0.0.1:4000'

function normUrl(u) {
  if (!u) return ''
  if (/^https?:\/\//.test(u)) return u
  if (u.startsWith('/uploads/')) return UPLOAD_BASE + u
  return u
}

function parsePhotos(raw) {
  if (!raw) return []
  let arr = raw
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter(p => p && Array.isArray(p.urls) && p.urls.length)
    .map(p => ({ label: p.label || '', urls: p.urls.filter(Boolean).map(normUrl) }))
}

// ========== State ==========
const filterStatus = ref('all')
const tableLoading = ref(false)
const actionLoading = ref(false)
const drawerVisible = ref(false)
const auditVisible = ref(false)
const paymentVisible = ref(false)
const currentOrder = ref(null)

// Reactive order list (loaded from backend; mutable for local state changes)
const orders = ref([])

async function loadOrders() {
  tableLoading.value = true
  try {
    const res = await rowsApi.list('recycle_orders', { size: 200, sort: 'time', order: 'desc' })
    const list = res?.data?.list || []
    orders.value = list.map(r => ({
      id: r.id, userName: r.user_name || r.supplier || '', phone: r.phone || '',
      brand: r.brand || '', type: r.type || '', count: r.count || 1,
      capacity: r.capacity || '', valuation: r.valuation || r.amount || '0',
      status: r.status || 'pending', time: r.time || r.date || '',
      auditTime: r.audit_time || '', paymentAppliedTime: r.payment_applied_time || '',
      paidTime: r.paid_time || '', completedTime: r.completed_time || '',
      paymentApplied: !!r.payment_applied, paid: !!r.paid,
      returnStatus: Number(r.return_applied) || 0, returnTime: r.return_time || '',
      returnDoneTime: r.return_done_time || '',
      paidAmount: r.paid_amount || '0.00', address: r.address || '',
      payeeChannel: r.payee_channel || '',
      payeeWechatQr: r.payee_wechat_qr || '', payeeAlipayQr: r.payee_alipay_qr || '',
      payeeUnionpayQr: r.payee_unionpay_qr || '',
      payeeBankHolder: r.payee_bank_holder || '', payeeBankName: r.payee_bank_name || '',
      payeeBankBranch: r.payee_bank_branch || '', payeeBankAccount: r.payee_bank_account || '',
      photos: parsePhotos(r.photos),
      source: r.source || (r.source_type === 'miniapp' ? 'miniapp' : 'manual'),
    }))
  } catch (e) {
    ElMessage.error('加载回收订单失败')
  } finally {
    tableLoading.value = false
  }
}

onMounted(loadOrders)

// Audit form
const auditForm = reactive({
  price: 0,
  visitTime: '',
  remark: '',
  payee: '',
  bankAccount: '',
  bankName: '',
  alipayQR: '',
  wechatQR: '',
})

// Payment form
const paymentForm = reactive({
  account: '中国工商银行 (基本户)',
  item: '回收预付款',
  amount: 0,
})

// ========== Computed ==========
const searchQuery = ref('')
const dateRange = ref(null)

const filteredOrders = computed(() => {
  let data = orders.value
  // 归一：电池回收页只展示小程序来源的单（source=miniapp），不混入销售录入单
  data = data.filter(o => o.source === 'miniapp')
  if (filterStatus.value !== 'all') {
    data = data.filter(o => o.status === filterStatus.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter(o =>
      String(o.id).includes(q) ||
      (o.userName || '').toLowerCase().includes(q) ||
      (o.phone || '').includes(q)
    )
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter(o => {
      const d = (o.time || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

// ========== 分页（前端切片）==========
// 搜索/状态/日期筛选已作用于全集 filteredOrders，这里只对结果做分页展示
const currentPage = ref(1)
const pageSize = ref(10)
const pagedFilteredOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})

// 任一筛选条件变化时，回到第一页（避免停留在超出范围的页码）
watch([filterStatus, searchQuery, dateRange, () => orders.value.length], () => {
  currentPage.value = 1
})

// ========== Export ==========
function exportOrders() {
  const list = filteredOrders.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的订单')
    return
  }
  exportCsv(`电池回收订单_${nowStamp()}.csv`,
    ['订单号', '提交时间', '品牌', '类型', '数量', '容量', '估价金额(元)', '状态', '客户', '联系电话', '地址', '收款渠道', '已付金额(元)'],
    list.map(o => [
      o.id, o.time, o.brand, o.type, o.count, o.capacity,
      toNum(o.valuation), statusLabel(o.status), o.userName, o.phone,
      o.address || '', o.payeeChannel || '', toNum(o.paidAmount),
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条订单`)
}

// 当前订单全部照片 URL（用于详情抽屉图片预览大图列表）
const allPhotoUrls = computed(() => {
  const photos = currentOrder.value?.photos || []
  return photos.flatMap(p => p.urls || []).map(normUrl)
})
// 扁平化全部照片（带标签），用于一行三列网格展示
const allPhotoItems = computed(() => {
  const photos = currentOrder.value?.photos || []
  const items = []
  photos.forEach(p => (p.urls || []).forEach(u => items.push({ url: normUrl(u), label: p.label || '' })))
  return items
})

// 照片灯箱：一行三列网格 + 上一张/下一张
const lightboxVisible = ref(false)
const lightboxIndex = ref(0)
function openLightbox(idx) {
  lightboxIndex.value = idx
  lightboxVisible.value = true
}
function closeLightbox() {
  lightboxVisible.value = false
}
function prevPhoto() {
  if (lightboxIndex.value > 0) lightboxIndex.value--
}
function nextPhoto() {
  if (lightboxIndex.value < allPhotoUrls.value.length - 1) lightboxIndex.value++
}

const balanceAmount = computed(() => {
  if (!currentOrder.value) return '0.00'
  const total = parseFloat(currentOrder.value.valuation.replace(/,/g, ''))
  const paid = parseFloat((currentOrder.value.paidAmount || '0').replace(/,/g, ''))
  return (total - paid).toLocaleString(undefined, { minimumFractionDigits: 2 })
})

const isFullyPaid = computed(() => {
  if (!currentOrder.value) return false
  const total = parseFloat(currentOrder.value.valuation.replace(/,/g, ''))
  const paid = parseFloat((currentOrder.value.paidAmount || '0').replace(/,/g, ''))
  return paid >= total
})

// 业务追踪时间线：优先使用后端记录的真实操作时间字段；
// 若旧数据没有该字段，则回退到基于提交时间的占位推导。
function nowTime() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function addMin(timeStr, mins) {
  const m = String(timeStr || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})/)
  if (!m) return timeStr || ''
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + mins)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const timelineSteps = computed(() => {
  const o = currentOrder.value
  if (!o) return []
  const base = o.time || ''
  const steps = [{ time: base, text: '用户提交回收申请', type: 'primary', hollow: true }]
  if (o.status !== 'pending') {
    steps.push({
      time: o.auditTime || addMin(base, 75),
      text: '管理员审核通过，已评估金额',
      type: 'success'
    })
  }
  if (o.paymentApplied) {
    steps.push({
      time: o.paymentAppliedTime || addMin(base, 120),
      text: '业务员提交资金申请，等待财务拨付',
      type: 'warning'
    })
  }
  if (o.paid) {
    steps.push({
      time: o.paidTime || addMin(base, 150),
      text: `财务已完成打款支付 (收款人: ${o.userName})`,
      type: 'success'
    })
  }
  if (o.status === 'completed') {
    steps.push({
      time: o.completedTime || addMin(base, 1440),
      text: '上门回收完成，回收资产已正式入库',
      type: 'success'
    })
  }
  if (o.returnStatus === 1 || o.returnStatus === 2) {
    steps.push({
      time: o.returnTime || '',
      text: `客户发起退货/退款申请，资产退还、款项原路退回 (退款对象: ${o.userName})`,
      type: 'danger'
    })
  }
  if (o.returnStatus === 2) {
    steps.push({
      time: o.returnDoneTime || '',
      text: '退货完成，财务已确认退款到账，流程闭环',
      type: 'success'
    })
  }
  return steps
})

// ========== Helpers ==========
function statusTagType(status) {
  return { pending: 'warning', processing: 'primary', completed: 'success' }[status] || 'info'
}

function statusLabel(status) {
  return { pending: '待评估', processing: '处理中', completed: '已完成' }[status] || status
}

// ========== Actions ==========
function applyPayment() {
  ElMessageBox.confirm('确定为此订单申请资金拨付吗？', '申请确认').then(() => {
    const t = nowTime()
    rowsApi.update('recycle_orders', currentOrder.value.id, { payment_applied: 1, payment_applied_time: t })
      .then(() => {
        currentOrder.value.paymentApplied = true
        currentOrder.value.paymentAppliedTime = t
        ElMessage.success('资金申请已提交至财务')
      })
      .catch(() => ElMessage.error('操作失败'))
  }).catch(() => {})
}

function openAudit(row) {
  currentOrder.value = row
  auditForm.price = parseFloat(row.valuation.replace(/,/g, ''))
  auditForm.payee = row.userName
  auditForm.bankAccount = ''
  auditForm.bankName = ''
  auditForm.alipayQR = ''
  auditForm.wechatQR = ''
  auditForm.visitTime = ''
  auditForm.remark = ''
  auditVisible.value = true
}

function submitAudit() {
  actionLoading.value = true
  const t = nowTime()
  rowsApi.update('recycle_orders', currentOrder.value.id, {
    status: 'processing',
    valuation: auditForm.price.toLocaleString(),
    audit_time: t,
  })
    .then(() => {
      const idx = orders.value.findIndex(o => o.id === currentOrder.value.id)
      if (idx > -1) {
        orders.value[idx].status = 'processing'
        orders.value[idx].valuation = auditForm.price.toLocaleString()
        orders.value[idx].auditTime = t
      }
      currentOrder.value.auditTime = t
      ElMessage.success('审核已通过，订单进入处理中状态')
    })
    .catch(() => ElMessage.error('操作失败'))
    .finally(() => { actionLoading.value = false; auditVisible.value = false })
}

// 打款给客户：未发起资金申请时先自动发起，再打开财务打款对话框
function payToCustomer() {
  const o = currentOrder.value
  if (!o.payeeChannel) {
    // 未登记收款方式：直接打开登记面板，省去来回找入口
    ElMessage.warning('请先登记客户收款方式，已为你打开登记面板')
    openPayeeEdit()
    return
  }
  if (!o.paymentApplied) {
    ElMessageBox.confirm('该订单尚未发起资金申请，是否先发起资金申请，再执行打款？', '打款前确认', { type: 'warning' })
      .then(() => {
        const t = nowTime()
        rowsApi.update('recycle_orders', o.id, { payment_applied: 1, payment_applied_time: t })
          .then(() => {
            o.paymentApplied = true
            o.paymentAppliedTime = t
            ElMessage.success('资金申请已提交，正在打开打款…')
            openPayment()
          })
          .catch(() => ElMessage.error('操作失败'))
      })
      .catch(() => {})
    return
  }
  openPayment()
}

function openPayment() {
  const o = currentOrder.value
  const total = parseFloat(o.valuation.replace(/,/g, ''))
  const paid = parseFloat((o.paidAmount || '0').replace(/,/g, ''))
  paymentForm.amount = total - paid
  // 出款账户按客户收款渠道自动预选
  const channelAccount = {
    '微信': '微信支付商户号',
    '支付宝': '支付宝企业号',
    '银联云闪付': '中国工商银行 (基本户)',
    '银行卡转账': '中国工商银行 (基本户)',
  }
  if (channelAccount[o.payeeChannel]) paymentForm.account = channelAccount[o.payeeChannel]
  paymentVisible.value = true
}

function submitPayment() {
  const o = currentOrder.value
  const hasPayee = o && o.payeeChannel && (o.payeeWechatQr || o.payeeAlipayQr || o.payeeUnionpayQr || o.payeeBankAccount)
  if (!hasPayee) {
    return ElMessage.warning('该订单尚未登记客户收款信息，请先登记客户收款码 / 银行卡后再打款')
  }
  if (!paymentForm.account || !paymentForm.item || !paymentForm.amount) {
    return ElMessage.warning('请选择支付账户、类目并输入有效金额')
  }
  actionLoading.value = true
    txApi.recyclePay({
      orderId: currentOrder.value.id,
      amount: paymentForm.amount,
      account: paymentForm.account,
      itemClass: paymentForm.item,
    })
      .then((res) => {
        const r = res?.data || {}
        const t = nowTime()
        if (r.newPaid) currentOrder.value.paidAmount = r.newPaid
        if (r.isFullyPaid) {
          currentOrder.value.paid = true
          currentOrder.value.paidTime = r.paidTime || t
        }
      ElMessage.success(`财务支付成功！已通过 [${paymentForm.account}] 支付 [${paymentForm.item}] 共 ¥${paymentForm.amount.toLocaleString()}`)
      // 打款完成 → 生成系统通知（小程序轮询 recycle-get 收到 paid 后更新状态并推送）
      if (r.isFullyPaid) {
        rowsApi.create('notifications', {
          type: 'recycle',
          title: '💳 款项已支付',
          content: `订单 ${currentOrder.value.id} 已通过 [${paymentForm.account}] 支付 ¥${paymentForm.amount.toLocaleString()}，款项已发放。`,
          ref_id: currentOrder.value.id,
          source: 'system',
        })
      }
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '支付失败'))
    .finally(() => { actionLoading.value = false; paymentVisible.value = false })
}

function completeOrder(row) {
  ElMessageBox.confirm('确定已完成回收并支付款项吗？', '提示', { type: 'warning' }).then(() => {
    tableLoading.value = true
    const t = nowTime()
    rowsApi.update('recycle_orders', row.id, { status: 'completed', completed_time: t })
      .then(() => {
        const idx = orders.value.findIndex(o => o.id === row.id)
        if (idx > -1) {
          orders.value[idx].status = 'completed'
          orders.value[idx].completedTime = t
        }
        ElMessage.success('订单已完成')
      })
      .catch(() => ElMessage.error('操作失败'))
      .finally(() => { tableLoading.value = false })
  }).catch(() => {})
}

function openDetail(row) {
  currentOrder.value = row
  drawerVisible.value = true
}

// ========== 客户收款信息编辑 ==========
const payeeVisible = ref(false)
const payeeSaving = ref(false)
const payeeFileInput = ref(null)
const payeeTargetField = ref('')
const payeeChannelList = [
  { key: 'wechat', label: '微信', short: '微', field: 'payeeWechatQr' },
  { key: 'alipay', label: '支付宝', short: '支', field: 'payeeAlipayQr' },
  { key: 'unionpay', label: '银联云闪付', short: '银', field: 'payeeUnionpayQr' },
]
const payeeForm = reactive({
  channel: '微信',
  payeeWechatQr: '', payeeAlipayQr: '', payeeUnionpayQr: '',
  bankHolder: '', bankName: '', bankBranch: '', bankAccount: '',
})

function openPayeeEdit() {
  const o = currentOrder.value
  if (!o) return
  payeeForm.channel = o.payeeChannel || '微信'
  payeeForm.payeeWechatQr = o.payeeWechatQr || ''
  payeeForm.payeeAlipayQr = o.payeeAlipayQr || ''
  payeeForm.payeeUnionpayQr = o.payeeUnionpayQr || ''
  payeeForm.bankHolder = o.payeeBankHolder || ''
  payeeForm.bankName = o.payeeBankName || ''
  payeeForm.bankBranch = o.payeeBankBranch || ''
  payeeForm.bankAccount = o.payeeBankAccount || ''
  payeeVisible.value = true
}

function pickPayeeQr(field) {
  payeeTargetField.value = field
  payeeFileInput.value?.click()
}

async function onPayeeFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!/^image\//.test(file.type)) {
    ElMessage.warning('请选择图片文件')
    return
  }
  // 先经 /api/open/upload 转存为服务器图片 URL，避免把 base64 直接灌入库
  try {
    const url = await uploadImage(file)
    payeeForm[payeeTargetField.value] = url
  } catch {
    ElMessage.error('收款码上传失败，请重试')
  }
  e.target.value = ''
}

async function savePayee() {
  if (!payeeForm.channel) {
    ElMessage.warning('请选择收款渠道')
    return
  }
  const hasPayee = payeeForm.payeeWechatQr || payeeForm.payeeAlipayQr || payeeForm.payeeUnionpayQr || payeeForm.bankAccount
  if (!hasPayee) {
    ElMessage.warning('请至少提供一个收款方式（任一收款码或银行卡号）')
    return
  }
  payeeSaving.value = true
  try {
    const res = await rowsApi.update('recycle_orders', currentOrder.value.id, {
      payee_channel: payeeForm.channel,
      payee_wechat_qr: payeeForm.payeeWechatQr,
      payee_alipay_qr: payeeForm.payeeAlipayQr,
      payee_unionpay_qr: payeeForm.payeeUnionpayQr,
      payee_bank_holder: payeeForm.bankHolder.trim(),
      payee_bank_name: payeeForm.bankName.trim(),
      payee_bank_branch: payeeForm.bankBranch.trim(),
      payee_bank_account: payeeForm.bankAccount.trim(),
    })
    const updatedRow = res?.data
    if (updatedRow) {
      currentOrder.value = {
        ...currentOrder.value,
        payeeChannel: updatedRow.payee_channel || '',
        payeeWechatQr: updatedRow.payee_wechat_qr || '',
        payeeAlipayQr: updatedRow.payee_alipay_qr || '',
        payeeUnionpayQr: updatedRow.payee_unionpay_qr || '',
        payeeBankHolder: updatedRow.payee_bank_holder || '',
        payeeBankName: updatedRow.payee_bank_name || '',
        payeeBankBranch: updatedRow.payee_bank_branch || '',
        payeeBankAccount: updatedRow.payee_bank_account || '',
      }
      const idx = orders.value.findIndex(x => x.id === currentOrder.value.id)
      if (idx >= 0) orders.value[idx] = currentOrder.value
    }
    ElMessage.success('收款信息已保存')
    payeeVisible.value = false
    loadOrders()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    payeeSaving.value = false
  }
}
</script>

<style scoped>
/* ========== Card Header ========== */
/* 对齐原型：标题左、筛选与状态页签右 (flex 两端对齐) */
.title-section h3 {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  line-height: 1.4;
}

.title-section p {
  font-size: 14px;
  line-height: 20px;
  color: #9ca3af;
  margin-top: 4px;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0 8px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
  min-width: 320px;
}

.filter-bar .search-input {
  width: 220px;
}

.status-tabs {
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* ========== Table Styles ========== */
/* 对齐原型：单元格垂直内边距 20px（EP 默认 8px） */
.dense-table :deep(td.el-table__cell) {
  padding: 20px 0 !important;
}

/* 分页容器：表格底部右侧，与原型截图红框位置一致 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}

.dense-table :deep(.el-table__body tr) {
  transition: background 0.15s;
}

.dense-table :deep(.el-table__body tr:hover) {
  background: #f9fafb;
}

/* Order Info Cell */
.order-info-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-circle {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f0fdf4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #22c55e;
  flex-shrink: 0;
}

.order-meta .order-id {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: #111827;
}

.order-meta .order-time {
  font-size: 12px;
  line-height: 16px;
  color: #9ca3af;
  margin-top: 2px;
}

/* Battery Details */
.battery-brand {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: #111827;
}

.battery-spec {
  font-size: 12px;
  line-height: 16px;
  color: #9ca3af;
  margin-top: 2px;
}

/* Customer */
.customer-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: #111827;
}

.customer-phone {
  font-size: 12px;
  line-height: 16px;
  color: #9ca3af;
  margin-top: 2px;
}

/* Valuation */
.valuation {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: #ea580c;
}

/* 客户收款占位 */
.pay-none {
  color: #c0c4cc;
}

/* ========== 抽屉：客户收款信息 ========== */
.payee-panel {
  border: 1px solid #f3f4f6;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  background: #fafafa;
}
.payee-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.payee-none {
  color: #9ca3af;
  font-size: 13px;
}
.payee-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.payee-pay-btn {
  border-radius: 10px !important;
  font-weight: 700 !important;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2) !important;
}
.payee-qr-preview {
  width: 160px;
  height: 160px;
  border-radius: 8px;
}
.payee-missing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b45309;
  font-size: 13px;
  line-height: 1.5;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 10px 12px;
}
.payee-qr-row {
  display: flex;
  gap: 12px;
}
.payee-qr-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.payee-qr-thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
  cursor: pointer;
}
.payee-qr-empty {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: 1px dashed #e5e7eb;
  background: #fff;
  color: #c0c4cc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.payee-qr-label {
  font-size: 10px;
  color: #9ca3af;
}
.payee-bank {
  margin-top: 14px;
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
  font-size: 13px;
  color: #374151;
}
.payee-bank-line {
  line-height: 1.8;
}
.payee-bank-line span {
  color: #9ca3af;
}

/* ========== 收款信息编辑对话框 ========== */
.qr-upload-grid {
  display: flex;
  gap: 12px;
}
.qr-uploader {
  width: 100px;
  height: 100px;
  border: 2px dashed #e5e7eb;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: border-color .2s;
  background: #f9fafb;
  position: relative;
}
.qr-uploader:hover {
  border-color: #059669;
}
.qr-upload-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.qr-upload-hint {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 6px;
}
.qr-upload-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, .55);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 2px 0;
}
.qr-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  background: rgba(0, 0, 0, .5);
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
}
.qr-tip {
  font-size: 11px;
  color: #9ca3af;
  margin: 6px 0 0;
  line-height: 1.5;
}
.hidden-input {
  display: none;
}
.dialog-btns {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* ========== Drawer ========== */
.recycle-detail-drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding-bottom: 16px;
  border-bottom: 1px solid #f3f4f6;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 20px;
}

.status-banner.pending {
  background: linear-gradient(135deg, #fef3c7, #fffbeb);
  color: #92400e;
}

.status-banner.processing {
  background: linear-gradient(135deg, #dbeafe, #eff6ff);
  color: #1e40af;
}

.status-banner.completed {
  background: linear-gradient(135deg, #d1fae5, #ecfdf5);
  color: #065f46;
}

.banner-text .banner-status {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.025em;
}

.banner-text .banner-id {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 2px;
}

.drawer-body {
  padding: 4px 0;
}

.section-title {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #111827;
  margin: 24px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f3f4f6;
}

/* ========== Finance Panel ========== */
.finance-panel {
  background: #f9fafb;
  border-radius: 16px;
  padding: 20px;
}

.finance-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.finance-row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.finance-item {
  flex: 1;
}

.finance-divider {
  width: 1px;
  height: 40px;
  background: #e5e7eb;
  margin: 0 20px;
}

.finance-label {
  font-size: 10px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.finance-value {
  font-size: 20px;
  font-weight: 900;
}

.finance-value.total {
  color: #f59e0b;
}

.finance-value.paid {
  color: #10b981;
}

.finance-value.balance {
  color: #ef4444;
}

.settlement-tag {
  border-radius: 8px !important;
  font-weight: 900 !important;
}

/* 抽屉底部操作栏（固定可见） */
.drawer-footer-actions {
  display: flex;
  gap: 10px;
  padding: 16px 0 4px;
  border-top: 1px solid #f3f4f6;
  margin-top: 8px;
}

.footer-btn {
  flex: 1;
  border-radius: 16px !important;
  font-weight: 900 !important;
  height: 48px;
}

.apply-btn {
  box-shadow: 0 10px 15px -3px rgba(249, 115, 22, 0.15);
}

.pay-btn {
  box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.15);
}

.settled-btn {
  opacity: 0.5;
}

.drawer-footer-done {
  padding: 20px 0 4px;
  text-align: center;
  color: #10b981;
  font-weight: 700;
  font-size: 13px;
  border-top: 1px solid #f3f4f6;
  margin-top: 8px;
}

/* ========== Dialog Common ========== */
.custom-dialog :deep(.el-dialog) {
  border-radius: 24px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.rounded-btn {
  border-radius: 12px !important;
}

/* ========== Audit Dialog ========== */
.audit-form .form-section {
  margin-bottom: 20px;
}

.section-label {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #9ca3af;
  margin-bottom: 16px;
}

.section-label.with-icon {
  display: flex;
  align-items: center;
  gap: 4px;
}

.full-width {
  width: 100%;
}

.pricing-item {
  margin-bottom: 24px !important;
}

.compact-item {
  margin-bottom: 8px !important;
}

.qr-row {
  display: flex;
  gap: 20px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}

.qr-item {
  text-align: center;
  flex: 1;
}

.qr-label {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  color: #9ca3af;
  margin-bottom: 4px;
}

.qr-placeholder {
  color: #e5e7eb;
}

.qr-img {
  width: 24px;
  height: 24px;
  margin: 0 auto;
}

/* ========== Payment Dialog ========== */
.payment-dialog-body {
  padding: 8px 0;
}

.payment-summary {
  text-align: center;
  margin-bottom: 28px;
}

.payment-icon-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #ecfdf5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: #10b981;
}

.payment-title {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.payment-amount {
  font-size: 32px;
  font-weight: 900;
  color: #111827;
  letter-spacing: -0.025em;
}

.payee-details {
  background: #f9fafb;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
}

.payee-info-list {
  margin-top: 12px;
}

.payee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}

.payee-label {
  color: #6b7280;
}

.payee-value {
  font-weight: 700;
  color: #111827;
}

.payee-value.mono {
  font-family: 'SF Mono', 'Cascadia Code', monospace;
}

.payee-qr-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.qr-btn {
  flex: 1;
  border-radius: 8px !important;
  font-weight: 900 !important;
}

.qr-popover {
  text-align: center;
}

.qr-popover-title {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
  color: #3b82f6;
}

.qr-popover-img {
  display: flex;
  justify-content: center;
}

.pay-submit-btn {
  border-radius: 12px !important;
  background: #059669 !important;
  border-color: #059669 !important;
  font-weight: 900 !important;
  padding: 0 40px !important;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2) !important;
}

/* ========== Scrollbar beautify ========== */
.recycle-detail-drawer :deep(.el-scrollbar__wrap) {
  padding-right: 8px;
}

.recycle-detail-drawer :deep(.el-scrollbar__thumb) {
  background: #e5e7eb;
  border-radius: 4px;
}

/* ========== Override descriptions border style ========== */
:deep(.el-descriptions__label) {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

:deep(.el-descriptions__content) {
  font-size: 13px;
  color: #111827;
}

/* ========== 现场照片（详情） ========== */
.photo-album {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.photo-group-label {
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  margin-bottom: 8px;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.photo-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #f0f0f0;
  background: #fafafa;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.photo-cell:hover {
  transform: scale(1.03);
}
.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.photo-tag {
  position: absolute;
  left: 0;
  bottom: 0;
  max-width: 100%;
  padding: 2px 8px;
  font-size: 10px;
  line-height: 1.4;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-bottom-left-radius: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ========== 照片灯箱 ========== */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
}
.lb-img {
  max-width: 80vw;
  max-height: 80vh;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  user-select: none;
}
.lb-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 32px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease;
}
.lb-btn:hover {
  background: rgba(255, 255, 255, 0.32);
}
.lb-btn.disabled {
  opacity: 0.25;
  cursor: not-allowed;
}
.lb-prev { left: 24px; }
.lb-next { right: 24px; }
.lb-bar {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
}
.lb-count {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 14px;
  border-radius: 16px;
}
.lb-close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}
.lb-close:hover {
  background: rgba(255, 255, 255, 0.32);
}
</style>
