<template>
  <div class="purchase-page p-4">
    <!-- ====== STAT CARDS ROW ====== -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="header">
          <span class="dot emerald"></span>
          <span class="title">本月采购总额</span>
        </div>
        <div class="body">
          <span class="symbol">¥</span>
          <span class="number">{{ formatKpi(kpiMonthAmount) }}</span>
          <span class="unit">.00</span>
        </div>
        <div class="footer">
          <span class="label">本月 PO</span>
          <span class="percent positive">{{ kpiMonthPoCount }} 单</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="header">
          <span class="dot orange"></span>
          <span class="title">待质检/入库批次</span>
        </div>
        <div class="body">
          <span class="number">{{ kpiPendingInbound }}</span>
          <span class="unit">单</span>
        </div>
        <div class="footer">
          <span class="label">已到货</span>
          <span class="percent">{{ kpiArrived }} 批</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="header">
          <span class="dot blue"></span>
          <span class="title">应付账款总额</span>
        </div>
        <div class="body">
          <span class="symbol">¥</span>
          <span class="number">{{ formatKpi(kpiUnpaidAmount) }}</span>
        </div>
        <div class="footer">
          <span class="label">待结算 PO</span>
          <span class="percent danger">{{ kpiUnpaidPoCount }} 单</span>
        </div>
      </div>
    </div>

    <!-- ====== MAIN CARD WITH TABLE ====== -->
    <el-card shadow="never" class="main-card">
      <template #header>
        <div class="main-card-header">
          <div class="title-group">
            <h3>
              采购工作台
              <span class="title-sub">(PO Lifecycle)</span>
            </h3>
          </div>
          <div class="header-actions">
            <el-button type="primary" :icon="Plus" @click="openCreateDialog">
              发起采购申请
            </el-button>
            <el-button :icon="Download" @click="exportReport">
              导出报表
            </el-button>
          </div>
        </div>
      </template>

      <div class="filter-toolbar">
        <div class="filter-pills">
          <span
            v-for="pill in filterPills"
            :key="pill.key"
            :class="['pill', { active: activeFilter === pill.key }]"
            @click="activeFilter = pill.key"
          >{{ pill.label }} {{ pill.count }}</span>
        </div>
        <div class="filter-bar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索单号、供应商、产品..."
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
      </div>

      <el-table :data="pagedFilteredOrders" style="width: 100%" class="pro-table" size="small">
        <el-table-column label="单据编号" width="160">
          <template #default="{ row }">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-bold text-gray-900 text-[13px]">#{{ row.id }}</span>
              <span class="text-[10px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded-full">{{ row.type }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="供应商" width="180">
          <template #default="{ row }">
            <p class="font-bold text-gray-700 text-[13px]">{{ row.supplier }}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">账期: {{ row.paymentTerms }}</p>
          </template>
        </el-table-column>
        <el-table-column label="来源回收单" width="170">
          <template #default="{ row }">
            <template v-if="row.recycleOrderId">
              <el-link type="primary" class="!font-mono !font-bold !text-[12px]" @click="goRecycleOrder(row.recycleOrderId)">
                {{ row.recycleOrderId }}
              </el-link>
              <div class="flex items-center gap-1 mt-0.5">
                <el-tag type="warning" size="small" effect="plain" class="!text-[9px] !px-1 !py-0">回收入库</el-tag>
                <span v-if="row.warehouseId" class="text-[10px] text-gray-400">{{ row.warehouseId }}</span>
              </div>
            </template>
            <template v-else>
              <el-tag type="info" size="small" effect="plain" class="!text-[9px] !px-1.5 !py-0.5">直采</el-tag>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="采购项 (首项)" min-width="220">
          <template #default="{ row }">
            <div>
              <p class="font-bold text-gray-700 text-[13px] truncate max-w-[200px]">{{ row.productName }}</p>
              <p class="text-[10px] text-gray-400 mt-0.5">
                单价: ¥{{ row.price }} | 数量: {{ row.amount }}
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="总金额" width="140">
          <template #default="{ row }">
            <div class="flex flex-col items-end">
              <p class="font-black text-gray-900 text-[15px]">¥{{ row.total }}</p>
              <el-tag size="small" type="info" class="mt-1">含税 {{ row.taxRate }}%</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="单据状态" width="140">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)" effect="dark" class="font-bold">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" class="font-bold" @click="viewDetail(row)">
              管理详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页：对筛选后的全集切片，状态/搜索/日期筛选仍作用于全部数据 -->
      <div v-if="filteredOrders.length" class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredOrders.length"
          :page-sizes="[10, 20, 50, 100, 200]"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
        />
      </div>
    </el-card>

    <!-- ====== DRAWER: 采购单全生命周期详情 ====== -->
    <el-drawer
      v-model="drawerVisible"
      title="采购单全生命周期详情"
      size="680px"
      class="pro-drawer"
    >
      <template v-if="selectedPO">
        <div class="drawer-content">
          <!-- Status Banner -->
          <div class="status-banner">
            <div>
              <p class="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                Current Workflow Status
              </p>
              <p class="text-xl font-black text-white">
                {{ getStatusLabel(selectedPO.status) }}
              </p>
            </div>
            <div class="banner-actions">
              <el-button
                v-if="selectedPO.status === 'draft'"
                type="primary"
                class="!rounded-xl font-black px-6"
                @click="updateStatus('pending_approval')"
              >
                提交采购审核
              </el-button>
              <el-button
                v-if="selectedPO.status === 'pending_approval'"
                type="success"
                class="!rounded-xl font-black px-6"
                @click="updateStatus('approved')"
              >
                审核通过 (下达采购)
              </el-button>
              <el-button
                v-if="selectedPO.status === 'approved'"
                type="primary"
                class="!rounded-xl font-black px-6"
                @click="updateStatus('arrived')"
              >
                到货确认登记
              </el-button>
              <el-button
                v-if="selectedPO.status === 'arrived'"
                type="warning"
                class="!rounded-xl font-black px-6"
                @click="openQCDialog"
              >
                进行质检评估
              </el-button>
              <template v-if="selectedPO.status === 'qc_passed'">
                <el-button
                  v-if="selectedPO.paymentStatus !== 'paid'"
                  type="success"
                  class="!rounded-xl font-black px-10 shadow-lg shadow-[#10b981]/20"
                  @click="openPaymentDialog"
                >
                  执行财务打款确认
                </el-button>
                <el-button
                  v-if="selectedPO.paymentStatus === 'paid'"
                  type="primary"
                  class="!rounded-xl font-black px-10 shadow-lg shadow-blue-500/20"
                  @click="openInboundDialog"
                >
                  最终正式入库
                </el-button>
              </template>
              <el-button
                v-if="selectedPO.status === 'completed'"
                type="danger"
                plain
                class="!rounded-xl font-black px-6"
                @click="startReturn"
              >
                发起退货退款
              </el-button>
            </div>
          </div>

          <!-- Workflow Progress -->
          <div class="workflow-progress">
            <div class="absolute top-1/2 left-0 w-full h-[2px] bg-gray-100 -translate-y-1/2 -z-10" />
            <div
              v-for="(step, idx) in workflowSteps"
              :key="step.key"
              class="flex flex-col items-center gap-2"
            >
              <div
                :class="[
                  'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-4 transition-all duration-500',
                  getStepStyle(step.key),
                ]"
              >
                {{ idx + 1 }}
              </div>
              <span
                :class="[
                  'text-[9px] font-black uppercase tracking-tighter',
                  selectedPO.status === step.key ? 'text-blue-500' : 'text-gray-400',
                ]"
              >
                {{ step.label }}
              </span>
            </div>
          </div>

          <!-- Financial Settlement -->
          <div class="finance-section">
            <div class="flex justify-between items-center mb-4">
              <h4 class="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                财务结算明细 (Financial Settlement)
              </h4>
              <el-tag
                :type="paymentSettled ? 'success' : 'danger'"
                effect="dark"
                size="small"
                class="!rounded-md font-black uppercase"
              >
                {{ paymentSettled ? '已实付结清' : '待财务支付' }}
              </el-tag>
            </div>
            <div class="finance-grid">
              <div class="finance-item">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">
                  应付总额 (Total)
                </span>
                <span class="text-xl font-black text-gray-900">¥{{ selectedPO.total }}</span>
              </div>
              <div class="finance-item">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">
                  累计实付 (Paid)
                </span>
                <span class="text-xl font-black text-[#059669]">¥{{ selectedPO.paidAmount || '0.00' }}</span>
              </div>
              <div class="finance-item">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">
                  待付余额 (Balance)
                </span>
                <span class="text-xl font-black text-rose-500">¥{{ pendingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
              </div>
              <div class="finance-item">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">
                  收款人 (Payee)
                </span>
                <span class="text-sm font-bold text-gray-600 truncate mt-1">{{ selectedPO.supplier }}</span>
              </div>
            </div>
            <div class="finance-actions">
              <el-button
                v-if="!paymentSettled"
                type="success"
                class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-[#10b981]/20"
                @click="openPaymentDialog"
              >
                继续执行财务打款
              </el-button>
              <el-button
                v-else
                type="info"
                disabled
                class="flex-1 !rounded-xl font-black h-12 opacity-50"
              >
                该单据款项已结清
              </el-button>
              <el-button
                v-if="selectedPO.status === 'completed'"
                type="danger"
                class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-rose-900/20"
                @click="startReturn"
              >
                发起退货出库流程
              </el-button>
            </div>
          </div>

          <!-- Basic Info Grid -->
          <div class="info-section">
            <h4 class="section-title">单据基本信息</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">供应商</span>
                <span class="value font-bold">{{ selectedPO.supplier }}</span>
              </div>
              <div class="info-item">
                <span class="label">期望交期</span>
                <span class="value font-bold">{{ selectedPO.deliveryDate || '2024-05-10' }}</span>
              </div>
              <div class="info-item">
                <span class="label">支付账期</span>
                <span class="value font-bold">{{ selectedPO.paymentTerms }}</span>
              </div>
              <div class="info-item">
                <span class="label">采购类型</span>
                <span class="value font-bold">{{ selectedPO.type }}</span>
              </div>
            </div>
          </div>

          <!-- Product Items Table -->
          <div class="items-section">
            <h4 class="section-title">采购明细项</h4>
            <el-table :data="[selectedPO]" border class="inner-table" size="small">
              <el-table-column prop="productName" label="产品名称" />
              <el-table-column prop="price" label="含税单价" width="120" />
              <el-table-column prop="amount" label="采购数量" width="100" align="center" />
              <el-table-column label="小计金额" width="120" align="right">
                <template #default="{ row }">¥{{ row.total }}</template>
              </el-table-column>
            </el-table>
          </div>

          <!-- Timeline -->
          <div class="timeline-section">
            <h4 class="section-title">业务操作日志</h4>
            <el-timeline>
              <el-timeline-item timestamp="2024-04-24 10:00" type="primary" hollow>
                发起采购申请 (张三)
              </el-timeline-item>
              <el-timeline-item
                v-if="selectedPO.step >= 2"
                timestamp="2024-04-24 11:30"
                type="success"
              >
                财务审核通过 (李四)
              </el-timeline-item>
              <el-timeline-item
                v-if="selectedPO.status === 'qc_passed'"
                timestamp="2024-04-24 14:00"
                type="warning"
              >
                品控质检合格 (系统评分: 98)
              </el-timeline-item>
            </el-timeline>
          </div>
        </div>
      </template>
    </el-drawer>

    <!-- ====== DIALOG: 采购到货质检评估 ====== -->
    <el-dialog
      v-model="qcVisible"
      title="采购到货质检评估"
      width="720px"
      align-center
      class="pro-dialog"
    >
      <template v-if="selectedPO">
        <div>
          <el-alert
            title="请根据该产品的品类模板执行质检录入，判定结果将直接影响入库流程。"
            type="warning"
            show-icon
            :closable="false"
            class="mb-6"
          />
          <div class="mb-6">
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">待检产品</p>
            <p class="text-sm font-black text-gray-900">{{ selectedPO.productName }}</p>
            <p class="text-[10px] text-gray-400 mt-1">供应商: {{ selectedPO.supplier }}</p>
          </div>
          <el-form :model="qcForm" label-position="top">
            <el-form-item label="外观及包装核对">
              <el-radio-group v-model="qcForm.appearance" size="small">
                <el-radio-button label="合格">全量合格</el-radio-button>
                <el-radio-button label="部分损毁">部分损毁</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="质检实测评分 (0-100)">
              <el-slider v-model="qcForm.score" show-input />
            </el-form-item>
            <el-form-item label="质检结论">
              <el-input
                v-model="qcForm.remark"
                type="textarea"
                :rows="3"
                placeholder="输入质检详细结论..."
              />
            </el-form-item>
          </el-form>
        </div>
      </template>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="qcVisible = false">取消</el-button>
          <el-button type="success" @click="submitQC('passed')">判定通过</el-button>
          <el-button type="danger" @click="submitQC('failed')">判定不合格 (退回)</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ====== DIALOG: 执行采购入库 ====== -->
    <el-dialog
      v-model="inboundVisible"
      title="执行采购入库 (生成库存批次)"
      width="720px"
      align-center
      class="pro-dialog"
    >
      <template v-if="selectedPO">
        <div>
          <div class="flex items-start gap-4 mb-6">
            <el-icon :size="60" class="text-[#34d399]">
              <component :is="inboundIcon" />
            </el-icon>
            <div>
              <p class="text-[10px] text-[#34d399] font-bold uppercase tracking-widest mb-1">
                待入库产品
              </p>
              <p class="text-sm font-black text-gray-900">{{ selectedPO.productName }}</p>
              <p class="text-lg font-black text-gray-900 mt-1">
                {{ selectedPO.amount }}
                <span class="text-xs font-normal">Units</span>
              </p>
            </div>
          </div>
          <el-alert
            title="系统将根据入库结果自动增加对应仓库的实时库存量。"
            type="info"
            :closable="false"
            show-icon
            class="mb-6"
          />
          <el-form :model="inboundForm" label-position="top">
            <el-form-item label="入库库存项">
              <el-select
                v-model="inboundForm.stockItemId"
                class="w-full"
                filterable
                placeholder="选择要入库的库存 SKU（库存将增加）"
              >
                <el-option
                  v-for="si in stockItems"
                  :key="si.id"
                  :label="`${si.name} (${si.sku || si.id}) 现存 ${si.qty || 0}${si.unit || ''}`"
                  :value="si.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="入库数量">
              <el-input-number v-model="inboundForm.qty" :min="1" class="!w-full" />
            </el-form-item>
            <el-form-item label="批次生成号">
              <el-input
                v-model="inboundForm.batchNo"
                placeholder="自动生成或输入供应商批次"
              />
            </el-form-item>
            <el-form-item label="生产日期">
              <el-date-picker
                v-model="inboundForm.mfd"
                type="date"
                class="!w-full"
                placeholder="选择日期"
              />
            </el-form-item>
          </el-form>
        </div>
      </template>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="inboundVisible = false">取消</el-button>
          <el-button type="primary" @click="executeInbound">确认过账入库</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ====== DIALOG: 发起资产采购申请 ====== -->
    <el-dialog
      v-model="createVisible"
      title="发起资产采购申请"
      width="720px"
      align-center
      class="pro-dialog"
    >
      <div>
        <el-form :model="createForm" label-width="100px" label-position="top">
          <el-row :gutter="20">
            <el-col :span="24">
              <el-form-item label="来源类型">
                <el-radio-group v-model="createForm.sourceType" class="!w-full">
                  <el-radio-button value="direct">直接采购</el-radio-button>
                  <el-radio-button value="recycle">回收资产入库</el-radio-button>
                </el-radio-group>
              </el-form-item>
            </el-col>
            <el-col v-if="createForm.sourceType === 'recycle'" :span="12">
              <el-form-item label="关联回收单号">
                <el-select v-model="createForm.recycleOrderId" placeholder="选择已完成回收单" filterable class="w-full">
                  <el-option v-for="r in recycleOrderOptions" :key="r.id" :label="`${r.id} · ${r.supplier} · 估值 ¥${r.valuation}`" :value="r.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col v-if="createForm.sourceType === 'recycle'" :span="12">
              <el-form-item label="入库目标仓库">
                <el-select v-model="createForm.warehouseId" placeholder="选择仓库" clearable class="w-full">
                  <el-option v-for="w in warehouseOptions" :key="w.id" :label="`${w.name} (${w.id})`" :value="w.id" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="目标供应商">
                <el-select
                  v-model="createForm.supplier"
                  class="w-full"
                  placeholder="选择合作伙伴"
                  @change="selectSupplier"
                >
                  <template #footer>
                    <div class="select-footer">
                      <el-button
                        type="primary"
                        size="small"
                        link
                        class="flex-1 font-black"
                        @click="openSupplierManager"
                      >
                        新窗口建商户
                      </el-button>
                    </div>
                  </template>
                  <el-option
                    v-for="s in supplierPaymentInfo"
                    :key="s.name"
                    :label="s.name"
                    :value="s.name"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="收款人 (Payee Name)">
                <el-input
                  v-model="createForm.payee"
                  placeholder="默认为供应商名称"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="期望交期">
                <el-date-picker
                  v-model="createForm.deliveryDate"
                  type="date"
                  class="!w-full"
                  placeholder="选择日期"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- Payment Details -->
          <div class="payment-details-card">
            <p class="payment-details-title">
              <el-icon><Money /></el-icon>
              收款账户详情 (Payment Details)
            </p>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="银行账号" class="!mb-4">
                  <el-input
                    v-model="createForm.bankAccount"
                    placeholder="卡号/支付宝号"
                    size="small"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="开户行" class="!mb-4">
                  <el-input
                    v-model="createForm.bankName"
                    placeholder="具体网点名称"
                    size="small"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <div class="qr-row">
              <div class="qr-item">
                <p class="text-[9px] font-black text-gray-400 uppercase">上传支付宝码</p>
                <img
                  v-if="createForm.alipayQR"
                  :src="createForm.alipayQR"
                  class="w-8 h-8 mx-auto mt-1"
                />
                <el-icon v-else :size="16" class="text-gray-200 mt-1"><Picture /></el-icon>
              </div>
              <div class="qr-item">
                <p class="text-[9px] font-black text-gray-400 uppercase">上传微信码</p>
                <img
                  v-if="createForm.wechatQR"
                  :src="createForm.wechatQR"
                  class="w-8 h-8 mx-auto mt-1"
                />
                <el-icon v-else :size="16" class="text-gray-200 mt-1"><Picture /></el-icon>
              </div>
            </div>
          </div>

          <el-divider>
            <span class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              产品明细项
            </span>
          </el-divider>

          <div class="product-items-row">
            <el-row :gutter="20">
              <el-col :span="10">
                <el-form-item label="选择产品" class="!mb-0">
                  <el-select v-model="createForm.productName" class="w-full">
                    <el-option
                      label="退役动力电池模组 (CATL 75kWh)"
                      value="退役动力电池模组 (CATL 75kWh)"
                    />
                    <el-option
                      label="三元锂方形电芯 (NCM 51Ah)"
                      value="三元锂方形电芯 (NCM 51Ah)"
                    />
                    <el-option
                      label="退役 BMS 电池管理主板"
                      value="退役 BMS 电池管理主板"
                    />
                    <el-option
                      label="动力电池液冷板组件 (铝制)"
                      value="动力电池液冷板组件 (铝制)"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="7">
                <el-form-item label="单价 (¥)" class="!mb-0">
                  <el-input-number
                    v-model="createForm.price"
                    :min="0"
                    class="!w-full"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="7">
                <el-form-item label="申请数量" class="!mb-0">
                  <el-input-number
                    v-model="createForm.amount"
                    :min="1"
                    class="!w-full"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </div>

          <el-form-item label="申请备注 (采购缘由)">
            <el-input
              v-model="createForm.remark"
              type="textarea"
              :rows="3"
              placeholder="请详细说明此次采购的需求背景、项目关联等..."
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createVisible = false">暂存草稿</el-button>
          <el-button
            type="primary"
            class="!bg-[#059669] !border-none"
            :loading="loading"
            @click="submitCreate"
          >
            立即发起审批
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ====== DIALOG: 财务出纳支付执行 ====== -->
    <el-dialog
      v-model="paymentVisible"
      title="财务出纳支付执行"
      width="720px"
      align-center
      class="pro-dialog"
    >
      <template v-if="selectedPO">
        <div>
          <div class="payment-hero">
            <el-icon :size="60" class="text-white/80">
              <Money />
            </el-icon>
            <p class="text-[12px] text-gray-400 font-mono tracking-wider mt-4">
              本次待支付金额 (PO: {{ selectedPO.id }})
            </p>
            <p class="text-4xl font-black text-white tracking-tighter mt-1">
              ¥{{ pendingBalance.toLocaleString() }}
            </p>
          </div>

          <div class="payee-info-card">
            <p class="payee-info-title">
              <el-icon><Money /></el-icon>
              收款方账户详情 (Payee Account)
            </p>
            <div class="payee-details">
              <div class="payee-row">
                <span class="text-gray-500">收款方:</span>
                <span class="font-bold text-gray-900">{{ selectedPO.payee || selectedPO.supplier }}</span>
              </div>
              <div class="payee-row">
                <span class="text-gray-500">银行账号:</span>
                <span class="font-bold text-gray-900">
                  {{ selectedPO.bankAccount || '6222 **** **** 8888' }}
                </span>
              </div>
              <div class="qr-buttons">
                <el-popover placement="top" :width="200" trigger="hover">
                  <template #reference>
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      class="flex-1 !rounded-lg font-black"
                    >
                      支付宝码
                    </el-button>
                  </template>
                  <div>
                    <p class="text-[10px] font-black mb-2 uppercase tracking-widest text-blue-500">
                      Alipay QR Code
                    </p>
                    <div class="flex justify-center">
                      <el-icon :size="40" class="text-gray-300"><Picture /></el-icon>
                    </div>
                  </div>
                </el-popover>
                <el-popover placement="top" :width="200" trigger="hover">
                  <template #reference>
                    <el-button
                      size="small"
                      type="success"
                      plain
                      class="flex-1 !rounded-lg font-black"
                    >
                      微信码
                    </el-button>
                  </template>
                  <div>
                    <p class="text-[10px] font-black mb-2 uppercase tracking-widest text-[#10b981]">
                      WeChat QR Code
                    </p>
                    <div class="flex justify-center">
                      <el-icon :size="40" class="text-gray-300"><Picture /></el-icon>
                    </div>
                  </div>
                </el-popover>
              </div>
            </div>
          </div>

          <el-form label-position="top" class="mt-6">
            <el-form-item label="本次实付金额">
              <el-input-number
                v-model="paymentForm.amount"
                :min="0"
                :precision="2"
                class="!w-full"
                size="large"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="出款账户 (Account)">
              <el-select v-model="paymentForm.account" class="w-full" size="large">
                <el-option label="中国工商银行 (基本户)" value="中国工商银行 (基本户)" />
                <el-option label="微信支付商户号" value="微信支付商户号" />
                <el-option label="支付宝企业号" value="支付宝企业号" />
              </el-select>
            </el-form-item>
            <el-form-item label="财务付款项 (Item Class)">
              <el-select v-model="paymentForm.item" class="w-full" size="large">
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
          <el-button class="!rounded-xl" @click="paymentVisible = false">取消</el-button>
          <el-button
            type="primary"
            class="!rounded-xl !bg-[#059669] !border-none font-black px-10 shadow-lg shadow-[#10b981]/20"
            @click="executePayment"
          >
            确认拨款支付
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { rowsApi, txApi } from '@/api/rows'
import { useRouter } from 'vue-router'
import { exportCsv, toNum, nowStamp } from '@/utils/export'
const router = useRouter()
import {
  Plus,
  Download,
  Money,
  Picture,
  Box,
  Search,
} from '@element-plus/icons-vue'

// ==================== ICONS ====================
const inboundIcon = Box

// ==================== REACTIVE STATE ====================

const drawerVisible = ref(false)
const qcVisible = ref(false)
const inboundVisible = ref(false)
const createVisible = ref(false)
const paymentVisible = ref(false)
const loading = ref(false)
const selectedPO = ref(null)
const activeFilter = ref('all')

// ==================== FORMS ====================

const qcForm = reactive({
  appearance: '合格',
  score: 100,
  remark: '',
})

const inboundForm = reactive({
  stockItemId: null,
  qty: 1,
  batchNo: 'BATCH-' + Date.now().toString().slice(-6),
  mfd: '',
})

// D1：入库选择库存项（真实库存主数据）
const stockItems = ref([])
async function loadStockItems() {
  try {
    const res = await rowsApi.list('stock_items', { size: 500 })
    stockItems.value = res?.data?.list || []
  } catch { /* 后端不可达时保持空 */ }
}

const createForm = reactive({
  supplier: '',
  deliveryDate: '',
  productName: '',
  price: 0,
  amount: 1,
  remark: '',
  payee: '',
  bankAccount: '',
  bankName: '',
  alipayQR: '',
  wechatQR: '',
  // 关联字段：来源回收单（业务回收单入库时挂接）
  sourceType: 'direct',         // direct=直接采购 / recycle=回收单入库
  recycleOrderId: '',           // 选了回收单时填入 id
  warehouseId: '',              // 入库目标仓库
})

// 可关联的回收单候选（status=completed 或 paid 已结清）
const recycleOrderOptions = ref([])
async function loadRecycleOrderOptions() {
  try {
    const res = await rowsApi.list('recycle_orders', { size: 200 })
    recycleOrderOptions.value = (res.data?.list || [])
      .filter((r) => ['completed', 'paid'].includes(r.status) || r.paid || r.status === 'completed')
      .map((r) => ({
        id: r.id,
        supplier: r.supplier || r.user_name || '',
        valuation: r.valuation || '',
        summary: r.summary || '',
        status: r.status,
      }))
  } catch { /* 后端不可达时保持空 */ }
}

const warehouseOptions = ref([])
async function loadWarehouseOptions() {
  try {
    const res = await rowsApi.list('warehouses', { size: 50 })
    warehouseOptions.value = (res.data?.list || []).map((w) => ({ id: w.code || w.id, name: w.name || w.code }))
  } catch { /* fallback */ }
}

const paymentForm = reactive({
  account: '中国工商银行 (基本户)',
  item: '采购货款',
  amount: 0,
})

// ==================== DATA ====================

const purchaseOrders = ref([])

onMounted(async () => {
  try {
    const res = await rowsApi.list('purchase_orders', { size: 200, sort: 'id', order: 'desc' })
    purchaseOrders.value = (res.data?.list || []).map(r => ({
      id: r.po_no || r.id, productName: r.product_name || r.item || '',
      amount: r.qty || r.amount || 0, price: r.price || String(r.unit_price || ''),
      total: r.total || String(r.amount || ''), taxRate: r.tax_rate ? Number(r.tax_rate) : 13,
      supplier: r.supplier || '', paymentTerms: r.payment_terms || '',
      status: r.status || 'pending_approval', step: r.step || 1, type: r.type || '通用物资',
      paymentStatus: r.payment_status || 'unpaid', paidAmount: r.paid_amount || '0.00',
      paymentApplied: r.payment_status === 'paid',
      deliveryDate: r.delivery_date || '', payee: r.payee || '',
      bankAccount: r.bank_account || '', bankName: r.bank_name || '',
      time: r.created_at || r.delivery_date || '',
      // 关联字段：来源回收单 + 目标仓库 + 来源类型
      recycleOrderId: r.recycle_order_id || '',
      warehouseId: r.warehouse_id || '',
      sourceType: r.source_type || 'direct',
    }))
  } catch { /* 后端不可达时保留空列表 */ }
  loadStockItems()
  loadRecycleOrderOptions()
  loadWarehouseOptions()
})

const workflowSteps = [
  { key: 'pending_approval', label: '审核' },
  { key: 'approved', label: '订单' },
  { key: 'arrived', label: '到货' },
  { key: 'qc_passed', label: '质检' },
  { key: 'pending_payment', label: '付款' },
  { key: 'completed', label: '完成' },
]

const supplierPaymentInfo = ref([
  {
    name: '宁德时代科技',
    bankAccount: '6222 0210 0100 8888 666',
    bankName: '中国工商银行宁德分行',
    alipayQR: '',
    wechatQR: '',
  },
  {
    name: '星星充电',
    bankAccount: '6217 0012 1000 5555 222',
    bankName: '招商银行常州支行',
  },
  {
    name: '特来电配件部',
    bankAccount: '6214 8801 2345 6789 000',
    bankName: '青岛银行崂山支行',
  },
])

const filterPills = computed(() => {
  const all = purchaseOrders.value.length
  const count = (status) => purchaseOrders.value.filter((o) => o.status === status).length
  return [
    { key: 'all', label: '全部', count: all },
    { key: 'pending_approval', label: '待审核', count: count('pending_approval') },
    { key: 'arrived', label: '待质检', count: count('arrived') },
    { key: 'qc_passed', label: '待入库', count: count('qc_passed') },
    { key: 'completed', label: '已完成', count: count('completed') },
  ]
})

// ==================== KPI 计算（基于真实 PO 数据）====================
const num = (v) => Number(String(v || '0').replace(/,/g, '')) || 0
const fmt = (n) => Math.round(n).toLocaleString('en-US')

const currentYM = new Date().toISOString().slice(0, 7) // YYYY-MM
const kpiMonthPoCount = computed(() => purchaseOrders.value.filter((o) => (o.time || '').slice(0, 7) === currentYM).length)
const kpiMonthAmount = computed(() => purchaseOrders.value
  .filter((o) => (o.time || '').slice(0, 7) === currentYM)
  .reduce((s, o) => s + num(o.total || (num(o.price) * num(o.amount))), 0)
)
const kpiPendingInbound = computed(() => purchaseOrders.value.filter((o) => ['arrived', 'qc_passed'].includes(o.status)).length)
const kpiArrived = computed(() => purchaseOrders.value.filter((o) => o.status === 'arrived').length)
const kpiUnpaidPoCount = computed(() => purchaseOrders.value.filter((o) => o.status !== 'completed' && o.paymentStatus !== 'paid').length)
const kpiUnpaidAmount = computed(() => purchaseOrders.value
  .filter((o) => o.status !== 'completed' && o.paymentStatus !== 'paid')
  .reduce((s, o) => s + num(o.total || (num(o.price) * num(o.amount))), 0)
)
function formatKpi(n) { return fmt(n) }

// ==================== COMPUTED ====================

const searchQuery = ref('')
const dateRange = ref(null)

const filteredOrders = computed(() => {
  let data = purchaseOrders.value
  if (activeFilter.value !== 'all') {
    data = data.filter((o) => o.status === activeFilter.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter((o) =>
      String(o.id).toLowerCase().includes(q) ||
      (o.supplier || '').toLowerCase().includes(q) ||
      (o.productName || '').toLowerCase().includes(q)
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

// 分页：对筛选后的全集切片，状态/搜索/日期筛选仍作用于全部数据
const currentPage = ref(1)
const pageSize = ref(10)
const pagedFilteredOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([activeFilter, searchQuery, dateRange, () => purchaseOrders.value.length], () => {
  currentPage.value = 1
})

const paymentSettled = computed(() => {
  if (!selectedPO.value) return false
  const total = parseFloat(selectedPO.value.total.replace(/,/g, ''))
  const paid = parseFloat((selectedPO.value.paidAmount || '0').replace(/,/g, ''))
  return total <= paid
})

const pendingBalance = computed(() => {
  if (!selectedPO.value) return 0
  const total = parseFloat(selectedPO.value.total.replace(/,/g, ''))
  const paid = parseFloat((selectedPO.value.paidAmount || '0').replace(/,/g, ''))
  return total - paid
})

// ==================== METHODS ====================

const statusStepMap = {
  pending_approval: 1,
  approved: 2,
  arrived: 3,
  qc_passed: 4,
  pending_payment: 5,
  completed: 6,
}

function getStepStyle(stepKey) {
  if (!selectedPO.value) return 'bg-gray-50 border-gray-100 text-gray-300'
  const currentStep = statusStepMap[selectedPO.value.status] || 0
  const stepNum = statusStepMap[stepKey] || 0
  if (stepNum < currentStep) return 'bg-[#10b981] border-[#d1fae5] text-white'
  if (stepNum === currentStep) return 'bg-blue-500 border-blue-100 text-white animate-pulse'
  return 'bg-gray-50 border-gray-100 text-gray-300'
}

function getStatusLabel(status) {
  const map = {
    draft: '草稿',
    pending_approval: '待审核',
    approved: '待到货',
    arrived: '待质检',
    qc_passed: '质检通过(待入库)',
    pending_payment: '财务待支付',
    completed: '已入库',
    rejected: '已驳回',
    returned: '已退货',
  }
  return map[status] || status
}

function getStatusTagType(status) {
  const map = {
    draft: 'info',
    pending_approval: 'warning',
    approved: 'primary',
    arrived: 'warning',
    qc_passed: 'success',
    pending_payment: 'danger',
    completed: 'success',
    rejected: 'danger',
    returned: 'danger',
  }
  return map[status] || 'info'
}

function selectSupplier(name) {
  createForm.payee = name
  const info = supplierPaymentInfo.value.find((s) => s.name === name)
  if (info) {
    createForm.bankAccount = info.bankAccount || ''
    createForm.bankName = info.bankName || ''
    createForm.alipayQR = info.alipayQR || ''
    createForm.wechatQR = info.wechatQR || ''
  }
}

function startReturn() {
  ElMessageBox.confirm(
    '确定执行退货出库流程吗？单据将进入退款结算状态。',
    '退货确认',
    {
      confirmButtonText: '执行退货',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(() => {
    if (!selectedPO.value?.id) {
      ElMessage.error('采购单缺失')
      return
    }
    txApi.returnOutbound({ purchaseOrderId: selectedPO.value.id })
      .then(() => {
        if (selectedPO.value) {
          selectedPO.value.status = 'returned'
          selectedPO.value.paymentStatus = 'unpaid'
        }
        ElMessage.success('退货出库流程已启动，请及时联系供应商处理退款')
      })
      .catch((e) => ElMessage.error(e?.response?.data?.message || '退货启动失败'))
  })
}

function viewDetail(row) {
  selectedPO.value = row
  drawerVisible.value = true
}

function updateStatus(status) {
  if (selectedPO.value) {
    selectedPO.value.status = status
    ElMessage.success(`单据状态已变更为: ${getStatusLabel(status)}`)
  }
}

function openPaymentDialog() {
  if (!selectedPO.value) return
  const total = parseFloat(selectedPO.value.total.replace(/,/g, ''))
  const paid = parseFloat((selectedPO.value.paidAmount || '0').replace(/,/g, ''))
  paymentForm.amount = total - paid
  paymentVisible.value = true
}

function executePayment() {
  if (!paymentForm.account || !paymentForm.item || !paymentForm.amount) {
    ElMessage.warning('请选择支付账户、类目并输入有效金额')
    return
  }
  loading.value = true
  if (!selectedPO.value) return
  const total = parseFloat(selectedPO.value.total.replace(/,/g, ''))
  rowsApi.update('purchase_orders', selectedPO.value.id, {
    paid_amount: total.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    payment_status: 'paid',
    payee: selectedPO.value.payee || selectedPO.value.supplier,
  })
    .then(() => {
      selectedPO.value.paidAmount = total.toLocaleString(undefined, { minimumFractionDigits: 2 })
      selectedPO.value.paymentStatus = 'paid'
      selectedPO.value.paymentApplied = true
      selectedPO.value.payee = selectedPO.value.payee || selectedPO.value.supplier
      ElMessage.success('财务打款已执行！款项已汇入供应商账户')
    })
    .catch(() => ElMessage.error('支付失败'))
    .finally(() => { loading.value = false; paymentVisible.value = false })
}

function openQCDialog() {
  qcForm.appearance = '合格'
  qcForm.score = 100
  qcForm.remark = ''
  qcVisible.value = true
}

function submitQC(result) {
  if (!selectedPO.value) return
  const newStatus = result === 'passed' ? 'qc_passed' : 'rejected'
  rowsApi.update('purchase_orders', selectedPO.value.id, { status: newStatus })
    .then(() => {
      selectedPO.value.status = newStatus
      if (result === 'passed') {
        ElMessage.success('质检判定通过，请执行入库')
      } else {
        ElMessage.error('质检不合格，已驳回该批次')
      }
    })
    .catch(() => ElMessage.error('操作失败'))
  qcVisible.value = false
}

function openInboundDialog() {
  inboundForm.batchNo = 'BATCH-' + Date.now().toString().slice(-6)
  inboundForm.qty = selectedPO.value ? Number(selectedPO.value.amount) || 1 : 1
  inboundVisible.value = true
}

function executeInbound() {
  if (!selectedPO.value) return
  if (!inboundForm.stockItemId || !inboundForm.qty) {
    return ElMessage.warning('请选择入库库存项并填写数量')
  }
  loading.value = true
  txApi.purchaseInbound({
    purchaseOrderId: selectedPO.value.id,
    items: [{
      stockItemId: inboundForm.stockItemId,
      qty: inboundForm.qty,
      batchNo: inboundForm.batchNo,
      mfd: inboundForm.mfd ? inboundForm.mfd.toISOString().slice(0, 10) : '',
    }],
  })
    .then(() => {
      selectedPO.value.status = 'completed'
      selectedPO.value.step = 6
      ElMessage.success('入库成功，库存已增加并生成批次')
      inboundVisible.value = false
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
    .finally(() => { loading.value = false })
}

function openCreateDialog() {
  Object.assign(createForm, {
    supplier: '',
    deliveryDate: '',
    productName: '',
    price: 0,
    amount: 1,
    remark: '',
    payee: '',
    bankAccount: '',
    bankName: '',
    alipayQR: '',
    wechatQR: '',
  })
  createVisible.value = true
}

function submitCreate() {
  if (!createForm.supplier || !createForm.productName) {
    ElMessage.error('请完善申请信息')
    return
  }
  if (createForm.sourceType === 'recycle' && !createForm.recycleOrderId) {
    ElMessage.error('来源回收单模式必须选择回收单号')
    return
  }
  loading.value = true
  const poNo = `PO${new Date().toISOString().slice(2, 10).replace(/-/g, '')}00${purchaseOrders.value.length + 1}`
  const total = createForm.price * createForm.amount
  txApi.purchaseOrderCreate({
    po: {
      po_no: poNo,
      supplier: createForm.supplier,
      payment_terms: '月结30天',
      tax_rate: '13',
      type: createForm.sourceType === 'recycle' ? '回收资产入库' : '核心件采购',
      delivery_date: createForm.deliveryDate || '',
      recycle_order_id: createForm.sourceType === 'recycle' ? createForm.recycleOrderId : '',
      warehouse_id: createForm.warehouseId || '',
    },
    items: [{
      product_name: createForm.productName,
      qty: createForm.amount,
      unit_price: createForm.price,
      unit: createForm.sourceType === 'recycle' ? '组' : '件',
      serial_no: createForm.sourceType === 'recycle' ? `${poNo}-${Date.now().toString().slice(-6)}` : '',
    }],
  })
    .then(() => {
      purchaseOrders.value.unshift({
        id: poNo,
        productName: createForm.productName,
        amount: createForm.amount,
        price: createForm.price.toLocaleString(),
        total: total.toLocaleString(),
        taxRate: 13,
        supplier: createForm.supplier,
        paymentTerms: '月结30天',
        status: 'pending_approval',
        step: 1,
        type: createForm.sourceType === 'recycle' ? '回收资产入库' : '核心件采购',
        paymentStatus: 'unpaid',
        paidAmount: '0.00',
        paymentApplied: false,
        payee: createForm.payee || createForm.supplier,
        bankAccount: createForm.bankAccount,
        bankName: createForm.bankName,
        deliveryDate: createForm.deliveryDate || '',
        recycleOrderId: createForm.sourceType === 'recycle' ? createForm.recycleOrderId : '',
        warehouseId: createForm.warehouseId || '',
        sourceType: createForm.sourceType,
      })
      ElMessage.success('采购申请已发起，请等待主管审核')
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '创建失败'))
    .finally(() => { loading.value = false; createVisible.value = false })
}

function openSupplierManager() {
  window.open('/#/data/suppliers', '_blank')
  ElMessage.info('已在新窗口打开供应商管理...')
}

// 跳转业务回收单档案并定位该单（用 hash query 传递 id）
function goRecycleOrder(id) {
  router.push({ path: '/recycle/my-orders', query: { highlight: id } })
}

function exportReport() {
  const list = filteredOrders.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的采购单据')
    return
  }
  exportCsv(`采购单据_${nowStamp()}.csv`,
    ['单据编号', '类型', '供应商', '账期', '采购项', '单价(元)', '数量', '总金额(元)', '税率(%)', '单据状态'],
    list.map(o => [
      o.id, o.type, o.supplier, o.paymentTerms || '',
      o.productName, toNum(o.price), o.amount, toNum(o.total),
      o.taxRate ?? '', getStatusLabel(o.status),
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条采购单据`)
}
</script>

<style scoped>
/* ==================== STATS ROW ==================== */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 32px;
  border: 1px solid #f3f4f6;
  padding: 28px 32px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s;
  cursor: default;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-card .header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.stat-card .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stat-card .dot.emerald {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
}

.stat-card .dot.orange {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}

.stat-card .dot.blue {
  background: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
}

.stat-card .title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
}

.stat-card .body {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-bottom: 12px;
}

.stat-card .body .symbol {
  font-size: 18px;
  font-weight: 700;
  color: #6b7280;
  margin-right: 1px;
}

.stat-card .body .number {
  font-size: 32px;
  font-weight: 900;
  color: #111827;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.stat-card .body .unit {
  font-size: 16px;
  font-weight: 700;
  color: #9ca3af;
  margin-left: 2px;
}

.stat-card .footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-card .footer .label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
}

.stat-card .footer .percent {
  font-size: 12px;
  font-weight: 800;
  color: #6b7280;
}

.stat-card .footer .percent.positive {
  color: #10b981;
}

.stat-card .footer .percent.danger {
  color: #ef4444;
}

/* ==================== MAIN CARD ==================== */
.main-card {
  border-radius: 40px !important;
  border: none !important;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
  overflow: hidden;
}

.main-card :deep(.el-card__header) {
  padding: 24px 32px 16px;
  border-bottom: none;
}

.main-card :deep(.el-card__body) {
  padding: 0 32px 20px;
}

.main-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.title-group h3 {
  font-size: 20px;
  font-weight: 900;
  color: #111827;
  margin: 0;
  letter-spacing: -0.02em;
}

.title-group h3 .title-sub {
  font-size: 13px;
  font-weight: 500;
  color: #9ca3af;
  margin-left: 6px;
  letter-spacing: 0;
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

/* ====== FILTER TOOLBAR (Tabs + Search/Date) ====== */
.filter-toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0 12px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 4px;
}

.filter-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  display: inline-block;
  padding: 6px 18px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 12px;
  background: #f3f4f6;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.pill:hover {
  background: #e5e7eb;
  color: #6b7280;
}

.pill.active {
  background: #111827;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-bar .search-input {
  width: 240px;
}

/* ==================== TABLE ==================== */
.pro-table :deep(.el-table__header th) {
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d1d5db !important;
  background: transparent !important;
}

.pro-table :deep(.el-table__body td) {
  padding-top: 14px;
  padding-bottom: 14px;
}

/* ==================== DRAWER ==================== */
.pro-drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: 24px 28px;
  border-bottom: 1px solid #f3f4f6;
  font-weight: 900;
}

.pro-drawer :deep(.el-drawer__body) {
  padding: 0;
}

.drawer-content {
  padding: 0;
}

/* Status Banner */
.status-banner {
  background: #111827;
  padding: 32px 28px;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}

.banner-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Workflow Progress */
.workflow-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  padding: 32px 28px;
  background: #fff;
  border-bottom: 1px solid #f3f4f6;
}

/* Finance Section */
.finance-section {
  padding: 28px;
  background: #fff;
  border-bottom: 1px solid #f3f4f6;
}

.finance-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  background: #f9fafb;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid #f3f4f6;
  margin-bottom: 16px;
}

.finance-item {
  text-align: left;
}

.finance-actions {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #f3f4f6;
}

/* Info Section */
.info-section {
  padding: 28px;
  background: #fff;
  border-bottom: 1px solid #f3f4f6;
}

.section-title {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #d1d5db;
  margin-bottom: 20px;
  margin-top: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
}

.info-item .value {
  font-size: 13px;
  color: #111827;
}

/* Items Section */
.items-section {
  padding: 28px;
  background: #fff;
  border-bottom: 1px solid #f3f4f6;
}

.inner-table :deep(.el-table__header th) {
  background: #f9fafb !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
}

/* Timeline Section */
.timeline-section {
  padding: 28px;
  background: #fff;
}

/* ==================== DIALOG ==================== */
.pro-dialog :deep(.el-dialog__header) {
  padding: 28px 28px 16px;
  font-weight: 900;
}

.pro-dialog :deep(.el-dialog__body) {
  padding: 16px 28px;
}

.pro-dialog :deep(.el-dialog__footer) {
  padding: 16px 28px 28px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* ==================== CREATE DIALOG ==================== */
.payment-details-card {
  background: #f9fafb;
  border: 1px solid #f3f4f6;
  border-radius: 24px;
  padding: 20px;
  margin-top: 16px;
  margin-bottom: 8px;
}

.payment-details-title {
  font-size: 12px;
  font-weight: 800;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.qr-row {
  display: flex;
  gap: 40px;
  margin-top: 8px;
}

.qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.select-footer {
  padding: 8px 12px;
  border-top: 1px solid #f3f4f6;
  display: flex;
}

.product-items-row {
  background: #f9fafb;
  border: 1px solid #f3f4f6;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}

/* ==================== PAYMENT DIALOG ==================== */
.payment-hero {
  background: #111827;
  border-radius: 24px;
  padding: 32px;
  text-align: center;
  color: #fff;
  margin-bottom: 24px;
}

.payee-info-card {
  background: #f9fafb;
  border: 1px solid #f3f4f6;
  border-radius: 24px;
  padding: 20px;
  margin-bottom: 8px;
}

.payee-info-title {
  font-size: 12px;
  font-weight: 800;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.payee-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.payee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.qr-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
