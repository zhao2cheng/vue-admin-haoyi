<template>
  <div class="settlement-page">
    <!-- 顶部概览卡 -->
    <el-card shadow="never" class="top-card">
      <div class="top-inner">
        <div class="top-left">
          <div class="stat-main">
            <p class="stat-label">{{ selectedMonth }} 待结算总额</p>
            <p class="stat-value">¥{{ kpiPendingStr }}</p>
            <p class="stat-sub">
              待核销 <span class="c-orange">{{ kpiPendingFlowCnt }}</span> 条 · 已核销 <span class="c-green">{{ kpiSettledFlowCnt }}</span> 条 / 共 <span class="c-mute">{{ filteredFlowsByMonth.length }}</span> 条
            </p>
          </div>
          <div class="top-divider"></div>
          <div class="mini-list">
            <div class="mini">
              <p class="mini-label">已发放支出</p>
              <p class="mini-value">¥{{ kpiPaidStr }}</p>
            </div>
            <div class="mini">
              <p class="mini-label">待付款笔数</p>
              <p class="mini-value orange">{{ kpiAbnormalStr }}</p>
            </div>
          </div>
        </div>
        <el-button type="primary" class="settle-btn" @click="oneClickSettle">一键执行 {{ selectedMonth }} 结算</el-button>
      </div>
    </el-card>

    <!-- Tab 容器 -->
    <el-tabs type="border-card" class="settlement-tabs">
      <!-- Tab 1：绩效结算与发放 -->
      <el-tab-pane label="绩效结算与发放">
        <div class="pane-head">
          <div class="pane-title">
            <h3>销售业绩结算表 ({{ selectedMonth }})</h3>
            <el-date-picker
              v-model="selectedMonth"
              type="month"
              placeholder="选择月份"
              value-format="YYYY-MM"
              format="YYYY-MM"
              size="small"
              style="width: 120px; margin-left: 12px"
            />
            <el-radio-group v-model="perfStatusFilter" size="small" class="title-radio">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="待发放">待发放</el-radio-button>
              <el-radio-button label="已发放">已发放</el-radio-button>
            </el-radio-group>
            <el-tag v-if="usingFallbackPerf" type="warning" size="small" effect="dark" class="title-tag">演示数据</el-tag>
          </div>
          <div class="pane-actions">
            <el-button type="warning" size="small" round @click="oneClickSettle">一键执行 {{ selectedMonth }} 结算</el-button>
            <el-button type="warning" size="small" round class="batch-plan-btn" @click="batchDialog = true">批量提成方案</el-button>
          </div>
        </div>
        <el-empty v-if="perfLoaded && !filteredPerf.length" description="暂无该月份绩效结算数据" />
        <el-table v-else :data="filteredPerf" stripe>
          <el-table-column label="销售人员" min-width="200">
            <template #default="{ row }">
              <div class="staff-cell">
                <el-avatar :size="36" :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${row.name}`" />
                <div>
                  <p class="staff-name">{{ row.name }}</p>
                  <p class="staff-dept">{{ row.dept }}</p>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="有效回收额" width="150" align="right">
            <template #default="{ row }"><span class="c-blue">¥{{ row.recycleVal }}</span></template>
          </el-table-column>
          <el-table-column label="有效销售额" width="150" align="right">
            <template #default="{ row }"><span class="c-emerald">¥{{ row.salesVal }}</span></template>
          </el-table-column>
          <el-table-column label="提成基数/比例" width="180">
            <template #default="{ row }">
              <div class="base-cell">
                <span class="base-val">¥{{ row.base }}</span>
                <el-tag size="small" effect="plain" class="rate-tag">×{{ row.rate }}%</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="应发绩效" width="180" align="right">
            <template #default="{ row }"><span class="final-amt">¥{{ row.finalAmount }}</span></template>
          </el-table-column>
          <el-table-column label="发放状态" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === '已发放' ? 'success' : 'warning'" size="small" effect="dark">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审核" width="130" align="center">
            <template #default="{ row }">
              <el-tooltip v-if="row.auditStatus !== '未审核'" placement="top" effect="light">
                <template #content>
                  <div class="audit-tip">
                    <p>审核人：{{ row.auditor || '—' }}</p>
                    <p>审核时间：{{ row.auditTime || '—' }}</p>
                    <p v-if="row.auditComment">审核意见：{{ row.auditComment }}</p>
                  </div>
                </template>
                <el-tag :type="auditTagType(row.auditStatus)" size="small" effect="plain" class="!rounded-md font-black cursor-help">
                  {{ row.auditStatus }}
                </el-tag>
              </el-tooltip>
              <el-tag v-else type="info" size="small" effect="plain" class="!rounded-md font-black">未审核</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" align="center" fixed="right" width="240">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openDetail(row)">明细</el-button>
              <el-button v-if="row.status !== '已发放'" link type="warning" size="small" @click="openAudit(row)">审核</el-button>
              <el-button v-if="row.status === '待发放' && row.auditStatus === '已审核'" link type="success" size="small" @click="payOne(row)">发放</el-button>
              <el-tooltip v-else-if="row.status === '待发放'" content="需审核通过后方可发放" placement="top">
                <span class="pay-disabled-hint">待审核</span>
              </el-tooltip>
              <el-button link type="danger" size="small" @click="removeCommission(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Tab 2：付款账户与资金项 -->
      <el-tab-pane label="付款账户与资金项">
        <div class="pane-head">
          <div>
            <h3 class="big-title">财务支付账户管理</h3>
            <p class="sub-title">管理公司对公账户、第三方支付平台及日常付款项分类</p>
          </div>
          <el-button type="primary" round icon="Plus" @click="openAccountDialog">添加支付账户</el-button>
        </div>

        <div class="account-grid">
          <div class="account-card" v-for="a in accounts" :key="a.name">
            <div class="account-head">
              <span class="account-icon" :class="a.type">{{ a.badge }}</span>
              <div>
                <div class="account-name">{{ a.name }}</div>
                <div class="account-no">{{ a.no }}</div>
              </div>
            </div>
            <div class="account-balance">
              <span class="bal-label">账户余额</span>
              <span class="bal-value">¥{{ a.balance }}</span>
            </div>
          </div>
        </div>

        <!-- 资金池合计（与顶部 KPI 联动） -->
        <div class="account-summary">
          <div class="as-item">
            <span class="as-label">💰 公司可动用资金池</span>
            <span class="as-value primary">¥{{ accountTotalStr }}</span>
          </div>
          <div class="as-divider"></div>
          <div class="as-item">
            <span class="as-label">已发放支出</span>
            <span class="as-value">¥{{ kpiPaidStr }}</span>
          </div>
          <div class="as-divider"></div>
          <div class="as-item">
            <span class="as-label">待付款总额</span>
            <span class="as-value warn">¥{{ kpiPendingStr }}</span>
          </div>
          <div class="as-divider"></div>
          <div class="as-item">
            <span class="as-label">净可用余额</span>
            <span class="as-value success">¥{{ accountNetStr }}</span>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 3：收付款流水明细 -->
      <el-tab-pane label="收付款流水明细">
        <div class="pane-head">
          <div class="pane-title">
            <h3>全局资金流水记录 (All Transactions)</h3>
            <el-tag type="success" size="small" effect="plain" class="title-tag">实时同步</el-tag>
          </div>
          <div class="pane-actions">
            <el-date-picker
              v-model="flowDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              size="small"
              clearable
            />
            <el-radio-group v-model="flowFilter" size="small">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="out">支出</el-radio-button>
              <el-radio-button label="in">收入</el-radio-button>
            </el-radio-group>
            <el-button :icon="Plus" size="small" @click="newFlowDialog = true">新增流水</el-button>
            <el-button :icon="Download" size="small" @click="exportFlows">导出流水</el-button>
            <el-button :icon="Refresh" circle size="small" @click="refreshFlow" />
          </div>
        </div>
        <el-table :data="pagedFlows" stripe>
          <el-table-column label="发生时间" width="170" prop="time" />
          <el-table-column label="流水类型" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.type === '收入' ? 'success' : 'danger'" size="small" class="!rounded-md font-black">{{ row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="关联业务单号" width="180">
            <template #default="{ row }"><span class="mono c-blue">{{ row.orderId }}</span></template>
          </el-table-column>
          <el-table-column label="金额" width="150" align="right">
            <template #default="{ row }">
              <span class="flow-amt" :class="row.type === '收入' ? 'c-emerald' : 'c-rose'">
                {{ row.type === '收入' ? '+' : '-' }}¥{{ row.amount }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="支付账户" min-width="180" prop="account" />
          <el-table-column label="资金项分类" min-width="140">
            <template #default="{ row }">
              <el-tag type="info" effect="plain" size="small" class="!rounded-md font-black">{{ row.itemClass }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === '已结算' ? 'success' : 'warning'" size="small" effect="plain" class="!rounded-md font-black">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待结算' && row.type === '支出'" type="primary" size="small" class="pay-btn" @click="openPay(row)">
                立即付款
              </el-button>
              <span v-else class="op-empty">—</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页：对筛选后的流水全集切片，类型/日期筛选仍作用于全部数据 -->
        <div v-if="filteredFlows.length" class="pagination-wrap">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :total="filteredFlows.length"
            :page-sizes="[10, 20, 50, 100, 200]"
            v-model:current-page="flowPage"
            v-model:page-size="flowPageSize"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 月度绩效计算明细 -->
    <el-dialog v-model="detailDialog" title="月度绩效计算明细" width="600px" class="pro-dialog">
      <div v-if="detailRow">
        <div class="detail-formula-head">
          <h4 class="detail-cap">计算公式</h4>
          <span class="detail-model">标准提成模型 V2.0</span>
        </div>
        <p class="detail-formula">
          ( 回收额 ¥{{ detailRow.recycleVal }} + 销售额 ¥{{ detailRow.salesVal }} ) × {{ detailRow.rate }}% = ¥{{ detailRow.finalAmount }}
        </p>
        <h4 class="detail-cap detail-cap--mt">关联业务订单 ({{ relatedOrders.length }})</h4>
        <div class="related-list">
          <div v-for="o in relatedOrders" :key="o.id" class="related-item">
            <span class="related-id">{{ o.id }} · {{ o.type }}</span>
            <span class="related-amt">¥{{ o.amount }}</span>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 批量调整业绩提成方案 -->
    <el-dialog v-model="batchDialog" title="批量调整业绩提成方案" width="500px" class="pro-dialog" @closed="planRate = '1.2'; customName = ''; customRate = 1.5">
      <el-alert
        title="应用后，选定范围内的所有未结算订单将按新方案重新计算提成额。"
        type="info" show-icon :closable="false" class="mb-6"
      />
      <el-form label-position="top">
        <el-form-item label="选择目标提成方案">
          <el-select v-model="planRate" class="w-full" size="large" placeholder="选择提成方案">
            <el-option label="标准销售提成 (1.2%)" value="1.2" />
            <el-option label="大客户特惠方案 (0.8%)" value="0.8" />
            <el-option label="激励季翻倍方案 (2.4%)" value="2.4" />
            <el-option label="新人工底提成 (1.0%)" value="1.0" />
            <el-option label="自定义比例" value="custom" />
          </el-select>
        </el-form-item>
        <template v-if="planRate === 'custom'">
          <el-form-item label="方案名称">
            <el-input v-model="customName" maxlength="30" show-word-limit placeholder="如：大客户 8 月特惠方案" />
          </el-form-item>
          <el-form-item label="自定义提成比例 (%)">
            <el-input-number v-model="customRate" :min="0" :max="100" :precision="2" :step="0.1" controls-position="right" style="width: 100%" placeholder="请输入百分比，如 1.5" />
          </el-form-item>
        </template>
        <el-form-item label="应用范围">
          <el-checkbox-group v-model="applyScope">
            <el-checkbox label="sales_dept_1">销售一部</el-checkbox>
            <el-checkbox label="sales_dept_2">销售二部</el-checkbox>
            <el-checkbox label="new_staff">本月入职新人</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchDialog = false">取消</el-button>
        <el-button class="batch-apply-btn" :loading="applying" @click="applyPlan">立即全量应用</el-button>
      </template>
    </el-dialog>
  <!-- 财务出纳支付执行 (与原型弹窗一致) -->
    <el-dialog v-model="payDialog" title="财务出纳支付执行" width="560px" class="pro-dialog pay-dialog">
      <div v-if="payRow">
        <div class="pay-hero">
          <div class="pay-hero-text">
            <div class="pay-hero-cap">待支付回款单 (ID: {{ payRow.orderId }})</div>
            <div class="pay-hero-amount">¥{{ payRow.amount }}</div>
            <div class="pay-hero-sub">{{ payRow.itemClass }} · {{ payRow.time }}</div>
          </div>
          <div class="pay-hero-icon">
            <el-icon :size="46"><Folder /></el-icon>
          </div>
        </div>

        <el-form label-position="top" class="pay-form">
          <el-form-item label="本次实付金额">
            <el-input v-model="payForm.amount" placeholder="0.00">
              <template #prefix><span class="pay-input-prefix">¥</span></template>
            </el-input>
          </el-form-item>
          <el-form-item label="出款账户 (Account)">
            <el-select v-model="payForm.account" class="w-full" placeholder="选择出款账户">
              <el-option v-for="a in accounts" :key="a.no" :label="a.name" :value="a.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="财务付款项 (Item Class)">
            <el-select v-model="payForm.itemClass" class="w-full" placeholder="选择付款项分类">
              <el-option label="回收预付款" value="回收预付款" />
              <el-option label="采购货款" value="采购货款" />
              <el-option label="物流快递费" value="物流快递费" />
              <el-option label="运营服务费" value="运营服务费" />
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
            <span class="pay-payee-value">{{ payRow.payee }}</span>
          </div>
          <div class="pay-payee-row">
            <span class="pay-payee-label">银行账号</span>
            <span class="pay-payee-value mono">{{ payRow.payeeNo }}</span>
          </div>
          <div class="pay-method">
            <button type="button" class="pay-method-btn" :class="{ active: payForm.method === 'alipay' }" @click="payForm.method = 'alipay'">
              <span class="pay-method-tag">支付宝码</span>
            </button>
            <button type="button" class="pay-method-btn" :class="{ active: payForm.method === 'wechat' }" @click="payForm.method = 'wechat'">
              <span class="pay-method-tag">微信码</span>
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="payDialog = false">取消</el-button>
        <el-button class="pay-confirm-btn" :loading="paying" @click="submitPay">确认支付资金</el-button>
      </template>
    </el-dialog>

    <!-- 提成发放确认 -->
    <el-dialog v-model="commissionPayDialog" title="提成发放确认" width="480px" class="pro-dialog">
      <div v-if="commissionPayRow">
        <div class="pay-hero" style="margin-bottom: 20px;">
          <div class="pay-hero-text">
            <div class="pay-hero-cap">绩效提成发放 ({{ commissionPayRow.name }})</div>
            <div class="pay-hero-amount">¥{{ commissionPayRow.finalAmount }}</div>
            <div class="pay-hero-sub">{{ commissionPayRow.dept }} · 提成比例 {{ commissionPayRow.rate }}%</div>
          </div>
          <div class="pay-hero-icon">
            <el-icon :size="40"><Money /></el-icon>
          </div>
        </div>
        <el-form label-position="top" class="pay-form">
          <el-form-item label="出款账户 (Account)">
            <el-select v-model="commissionPayForm.account" class="w-full" placeholder="选择出款账户">
              <el-option v-for="a in accounts" :key="a.no" :label="a.name" :value="a.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="财务付款项 (Item Class)">
            <el-select v-model="commissionPayForm.itemClass" class="w-full" placeholder="选择付款项分类">
              <el-option label="绩效提成" value="绩效提成" />
              <el-option label="销售提成" value="销售提成" />
              <el-option label="回收提成" value="回收提成" />
              <el-option label="月度奖金" value="月度奖金" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="commissionPayDialog = false">取消</el-button>
        <el-button type="primary" :loading="commissionPaying" @click="submitCommissionPay">确认发放</el-button>
      </template>
    </el-dialog>

    <!-- 提成审核确认 -->
    <el-dialog v-model="auditDialog" title="提成审核确认" width="520px" class="pro-dialog" @closed="resetAuditForm">
      <div v-if="auditRow">
        <div class="audit-hero">
          <div class="audit-hero-text">
            <div class="audit-hero-cap">待审核提成 ({{ auditRow.name }})</div>
            <div class="audit-hero-amount">¥{{ auditRow.finalAmount }}</div>
            <div class="audit-hero-sub">
              {{ auditRow.dept }} · 基数 ¥{{ auditRow.base }} × {{ auditRow.rate }}%
              <span class="audit-prior" v-if="auditRow.auditStatus !== '未审核'">
                · 当前 {{ auditRow.auditStatus }}{{ auditRow.auditor ? '（' + auditRow.auditor + '）' : '' }}
              </span>
            </div>
          </div>
          <div class="audit-hero-icon">
            <el-icon :size="40"><CircleCheck /></el-icon>
          </div>
        </div>

        <el-form label-position="top" class="pay-form">
          <el-form-item label="审核结果">
            <el-radio-group v-model="auditForm.decision" class="audit-decision">
              <el-radio-button value="approve">
                <el-icon class="mr-1"><CircleCheck /></el-icon>审核通过
              </el-radio-button>
              <el-radio-button value="reject">
                <el-icon class="mr-1"><CircleClose /></el-icon>驳回
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="auditForm.decision === 'reject' ? '驳回原因 (必填)' : '审核意见 (可选)'">
            <el-input
              v-model="auditForm.comment"
              type="textarea"
              :rows="3"
              :maxlength="200"
              show-word-limit
              :placeholder="auditForm.decision === 'reject' ? '请说明驳回原因，便于业务员调整后重新提交' : '可填写补充说明'"
            />
          </el-form-item>
        </el-form>

        <el-alert
          v-if="auditRow.auditStatus === '已驳回' && auditForm.decision === 'approve'"
          type="warning" :closable="false" show-icon class="audit-alert"
          title="重新审核通过将覆盖原驳回记录，建议填写补充意见说明本次复核结果"
        />
      </div>
      <template #footer>
        <el-button @click="auditDialog = false">取消</el-button>
        <el-button
          class="audit-confirm-btn"
          :class="{ 'audit-confirm-btn--reject': auditForm.decision === 'reject' }"
          :loading="auditing"
          :disabled="auditForm.decision === 'reject' && !auditForm.comment.trim()"
          @click="submitAudit"
        >
          {{ auditForm.decision === 'approve' ? '确认通过' : '确认驳回' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 新增收付款流水 -->
    <el-dialog v-model="newFlowDialog" title="新增收付款流水" width="480px" class="pro-dialog">
      <el-form label-position="top">
        <el-form-item label="流水类型">
          <el-select v-model="newFlow.type" class="w-full">
            <el-option label="支出" value="支出" />
            <el-option label="收入" value="收入" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联业务单号">
          <el-input v-model="newFlow.orderId" placeholder="如 PO-xxxxxx" />
        </el-form-item>
        <el-form-item label="金额">
          <el-input v-model="newFlow.amount" placeholder="0.00">
            <template #prefix><span class="pay-input-prefix">¥</span></template>
          </el-input>
        </el-form-item>
        <el-form-item label="支付账户">
          <el-input v-model="newFlow.account" placeholder="账户名称" />
        </el-form-item>
        <el-form-item label="资金项分类">
          <el-input v-model="newFlow.itemClass" placeholder="如 采购货款" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newFlowDialog = false">取消</el-button>
        <el-button class="pay-confirm-btn" :loading="creating" @click="createFlow">确认新增</el-button>
      </template>
    </el-dialog>

    <!-- 添加支付账户 -->
    <el-dialog v-model="accountDialog" title="添加支付账户" width="480px" class="pro-dialog">
      <el-form label-position="top">
        <el-form-item label="账户类型">
          <el-select v-model="newAccount.type" class="w-full">
            <el-option label="银行账户" value="bank" />
            <el-option label="微信支付" value="wechat" />
            <el-option label="支付宝" value="alipay" />
          </el-select>
        </el-form-item>
        <el-form-item label="账户名称">
          <el-input v-model="newAccount.name" placeholder="如：中国工商银行 (基本户)" />
        </el-form-item>
        <el-form-item label="账号/商户号">
          <el-input v-model="newAccount.no" placeholder="账号或商户ID" />
        </el-form-item>
        <el-form-item label="账户余额">
          <el-input v-model="newAccount.balance" placeholder="0.00">
            <template #prefix><span class="pay-input-prefix">¥</span></template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountDialog = false">取消</el-button>
        <el-button class="pay-confirm-btn" @click="addAccount">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Folder, CreditCard, Plus, Download, Money, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { rowsApi, txApi } from '@/api/rows'
import { useAuthStore } from '@/store/auth'
import { exportCsv, toNum, nowStamp } from '@/utils/export'

// ── 绩效参考数据（后端不可达时的兜底；正常从 commissions 表加载）──
const perf = ref([
  { id: null, month: '2026-08', name: '王五', dept: '销售一部', recycleVal: '245,000', salesVal: '428,000', base: '673,000', rate: 1.2, finalAmount: '8,076.00', status: '待发放', auditStatus: '未审核', auditor: '', auditTime: '', auditComment: '' },
  { id: null, month: '2026-08', name: '张三', dept: '销售二部', recycleVal: '120,000', salesVal: '524,000', base: '644,000', rate: 1.2, finalAmount: '7,728.00', status: '待发放', auditStatus: '未审核', auditor: '', auditTime: '', auditComment: '' },
  { id: null, month: '2026-08', name: '赵六', dept: '销售一部', recycleVal: '48,000', salesVal: '185,000', base: '233,000', rate: 1, finalAmount: '2,330.00', status: '已发放', auditStatus: '已审核', auditor: '张财务', auditTime: '2026-08-30 11:20:00', auditComment: '业绩校核无误' },
  { id: null, month: '2026-07', name: '王五', dept: '销售一部', recycleVal: '220,000', salesVal: '380,000', base: '600,000', rate: 1.2, finalAmount: '7,200.00', status: '已发放', auditStatus: '已审核', auditor: '张财务', auditTime: '2026-07-30 10:00:00', auditComment: '' },
  { id: null, month: '2026-07', name: '李四', dept: '销售二部', recycleVal: '90,000', salesVal: '410,000', base: '500,000', rate: 1.2, finalAmount: '6,000.00', status: '已发放', auditStatus: '已审核', auditor: '张财务', auditTime: '2026-07-30 10:05:00', auditComment: '' },
  { id: null, month: '2026-06', name: '王五', dept: '销售一部', recycleVal: '180,000', salesVal: '320,000', base: '500,000', rate: 1.0, finalAmount: '5,000.00', status: '已发放', auditStatus: '已审核', auditor: '张财务', auditTime: '2026-06-30 11:00:00', auditComment: '' },
])
// perfLoaded 标记后端是否成功返回过真实数据：
//  - false → 后端不可达，当前显示的是内存兜底「演示数据」（需明确提示）
//  - true 且 perf 为空 → 后端正常但暂无绩效记录（显示空状态，而非假数据）
const perfLoaded = ref(false)
const usingFallbackPerf = computed(() => !perfLoaded.value)
// 绩效表状态筛选：all / 待发放 / 已发放
const perfStatusFilter = ref('all')

// 后端 commissions 列(下划线) <-> 前端(驼峰) 映射
function mapCommission(c) {
  return {
    id: c.id,
    month: c.month || c.settle_month || '',
    name: c.staff_name,
    dept: c.dept || '',
    recycleVal: c.recycle_val || '0',
    salesVal: c.sales_val || '0',
    base: c.base || '0',
    rate: Number(c.rate) || 0,
    finalAmount: c.final_amount || '0',
    status: c.status || '待发放',
    // 审核字段（新加）：后端默认未审核，旧记录回填为「未审核」
    auditStatus: c.audit_status || '未审核',
    auditor: c.auditor || '',
    auditTime: c.audit_time || '',
    auditComment: c.audit_comment || '',
  }
}

// 从关系型后端加载绩效记录（真正持久化）
async function loadPerf(month) {
  try {
    const params = { size: 200 }
    if (month) params.month = month
    const r = await rowsApi.list('commissions', params)
    perfLoaded.value = true
    perf.value = r?.data?.list?.length ? r.data.list.map(mapCommission) : []
  } catch (e) {
    // 后端不可达时保留兜底演示数据（usingFallbackPerf 仍为真，会提示「演示数据」）
  }
}

// 删除单条绩效结算记录（已发放的记录不允许删除）
function removeCommission(row) {
  if (row.status === '已发放') {
    ElMessage.warning('已发放的绩效记录不可删除')
    return
  }
  ElMessageBox.confirm(
    `确定删除「${row.name}」的绩效结算记录吗？（应发绩效 ¥${row.finalAmount}）删除后不可恢复。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
  )
    .then(async () => {
      if (row.id) {
        await rowsApi.remove('commissions', row.id)
      }
      // 后端记录按 id 过滤；演示数据(id 为 null)按对象引用过滤，避免误删多条
      perf.value = perf.value.filter((p) => (row.id == null ? p !== row : p.id !== row.id))
      ElMessage.success(`已删除「${row.name}」的绩效记录`)
      loadPerf(selectedMonth.value)
    })
    .catch(() => {})
}

const accounts = ref([
  { id: null, name: '中国工商银行 (基本户)', no: '6222 **** **** 8891', type: 'bank', badge: '工', balance: '1,250,400.00' },
  { id: null, name: '微信支付商户号', no: 'MID: 15928300', type: 'wechat', badge: '微', balance: '42,500.00' },
  { id: null, name: '支付宝企业号', no: 'fin@antigravity.com', type: 'alipay', badge: '支', balance: '85,000.00' },
])

// 从 payment_accounts 表加载支付账户
async function loadAccounts() {
  try {
    const r = await rowsApi.list('payment_accounts', { size: 100 })
    if (r?.data?.list?.length) {
      accounts.value = r.data.list.map((a) => ({
        id: a.id,
        name: a.name,
        no: a.no,
        type: a.type,
        badge: a.type === 'bank' ? '银' : a.type === 'wechat' ? '微' : '支',
        balance: a.balance || '0.00',
      }))
    }
  } catch (e) {
    // 后端不可达时保留兜底数据
  }
}

const flows = ref([
  { time: '2024-04-25 14:20', type: '支出', orderId: 'PO-992837', amount: '52,400.00', account: '中国工商银行 (基本户)', itemClass: '采购货款', payee: '宁德时代新能源 (李总)', payeeNo: '6217 **** **** 3304', status: '待结算' },
  { time: '2024-04-25 11:30', type: '收入', orderId: 'SO-112028', amount: '17,600.00', account: '微信支付商户号', itemClass: '销售回款', payee: '某汽修连锁 (王经理)', payeeNo: '微信入账', status: '已结算' },
  { time: '2024-04-24 16:45', type: '支出', orderId: 'RC-882731', amount: '8,400.00', account: '支付宝企业号', itemClass: '回收预付款', payee: '顺风物流园 (张经理)', payeeNo: '6222 **** **** 8888', status: '待结算' },
  { time: '2024-04-24 10:10', type: '收入', orderId: 'SO-112027', amount: '4,200.00', account: '中国工商银行 (基本户)', itemClass: '售后服务费', payee: '深圳某售后客户', payeeNo: '工行入账', status: '已结算' },
])

// 后端列名(下划线) <-> 前端(驼峰) 映射
function mapFlow(f) {
  return {
    id: f.id,
    time: f.time,
    type: f.type,
    orderId: f.order_id,
    amount: f.amount,
    account: f.account,
    itemClass: f.item_class,
    payee: f.payee,
    payeeNo: f.payee_no,
    status: f.status,
  }
}

// 从关系型后端加载流水（真正持久化）
async function loadFlows() {
  try {
    const r = await rowsApi.list('settlement_flows', { size: 200 })
    if (r?.data?.list?.length) flows.value = r.data.list.map(mapFlow)
  } catch (e) {
    // 后端不可达时保留兜底数据
  }
}
onMounted(() => {
  // 初始化流水日期范围为当前月
  const [y, mon] = selectedMonth.value.split('-')
  const last = new Date(Number(y), Number(mon), 0)
  flowDateRange.value = [`${y}-${mon}-01`, `${y}-${mon}-${String(last.getDate()).padStart(2, '0')}`]
  loadFlows()
  loadPerf(selectedMonth.value)
  loadAccounts()
})

const flowFilter = ref('all')
const flowDateRange = ref(null)
const filteredFlows = computed(() => {
  let data = flows.value
  if (flowFilter.value === 'in') data = data.filter(f => f.type === '收入')
  if (flowFilter.value === 'out') data = data.filter(f => f.type === '支出')
  if (flowDateRange.value && flowDateRange.value.length === 2) {
    const [start, end] = flowDateRange.value
    data = data.filter(f => {
      const d = (f.time || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return data
})

// 分页：对筛选后的流水全集切片，类型/日期筛选仍作用于全部数据
const flowPage = ref(1)
const flowPageSize = ref(10)
const pagedFlows = computed(() => {
  const start = (flowPage.value - 1) * flowPageSize.value
  return filteredFlows.value.slice(start, start + flowPageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([flowFilter, flowDateRange, () => flows.value.length], () => {
  flowPage.value = 1
})

// ── 月份选择器：支持查看历史月份业绩 ──
function formatMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const selectedMonth = ref(formatMonth(new Date()))
const currentMonth = formatMonth(new Date())
// 当前选中的月份是否为本月（用于限制一键结算）
const isCurrentMonth = computed(() => selectedMonth.value === currentMonth)

watch(selectedMonth, (m) => {
  loadPerf(m)
  // 同步联动「收付款流水明细」tab 的日期范围，让全页都按所选月份展示
  const [y, mon] = m.split('-')
  const last = new Date(Number(y), Number(mon), 0)
  flowDateRange.value = [`${y}-${mon}-01`, `${y}-${mon}-${String(last.getDate()).padStart(2, '0')}`]
})

// 按月份过滤后的绩效（供 KPI 统计用，不随表格状态筛选变化）
const perfByMonth = computed(() => {
  return perf.value.filter(p => (p.month || currentMonth) === selectedMonth.value)
})
// 表格数据源：月份 + 状态双重筛选（all 显示全部，保证已发放记录可见）
const filteredPerf = computed(() => {
  const byMonth = perfByMonth.value
  if (perfStatusFilter.value === 'all') return byMonth
  return byMonth.filter(p => p.status === perfStatusFilter.value)
})

// 按月份过滤后的资金流水（供 KPI 统计用）
const filteredFlowsByMonth = computed(() => {
  return flows.value.filter(f => (f.time || '').slice(0, 7) === selectedMonth.value)
})

// ── 顶部 KPI：从 settlement_flows 真实统计（不再硬编码）──
function fmtMoney2(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const kpiPendingStr = computed(() => {
  // toNum() 返回的是字符串 '0.00'，必须 parseFloat 转回数字再求和，否则会字符串拼接
  // 待结算总额 = 财务侧 settlement_flows 待结算支出 + 业务侧 commissions 待发放提成
  const flowTotal = filteredFlowsByMonth.value
    .filter(f => f.status === '待结算' && f.type === '支出')
    .reduce((sum, f) => sum + parseFloat(toNum(f.amount)), 0)
  const commTotal = perfByMonth.value
    .filter(p => p.status === '待发放')
    .reduce((sum, p) => sum + parseFloat(toNum(p.finalAmount)), 0)
  return fmtMoney2(flowTotal + commTotal)
})
const kpiPaidStr = computed(() => {
  const total = filteredFlowsByMonth.value
    .filter(f => f.status === '已结算' && f.type === '支出')
    .reduce((sum, f) => sum + parseFloat(toNum(f.amount)), 0)
  return total >= 1000000 ? (total / 1000000).toFixed(2) + 'M' : fmtMoney2(total)
})
const kpiAbnormalStr = computed(() => {
  // 待付款笔数 = 财务侧待结算支出笔数 + 业务侧待发放提成笔数
  const flowCnt = filteredFlowsByMonth.value.filter(f => f.status === '待结算' && f.type === '支出').length
  const commCnt = perfByMonth.value.filter(p => p.status === '待发放').length
  return String(flowCnt + commCnt).padStart(2, '0')
})
// 流水状态分布（用于 stat-sub 文案拆分显示，让用户看清每种状态有几条）
const kpiPendingFlowCnt = computed(() => filteredFlowsByMonth.value.filter(f => f.status === '待结算').length)
const kpiSettledFlowCnt = computed(() => filteredFlowsByMonth.value.filter(f => f.status === '已结算').length)

// ── 资金池合计：支付账户余额求和（同源 toNum→parseFloat 防字符串拼接）──
const accountTotalStr = computed(() => {
  const total = accounts.value.reduce((s, a) => s + parseFloat(toNum(a.balance)), 0)
  return fmtMoney2(total)
})
// 净可用 = 资金池 - 待付款总额（flows 待结算支出 + commissions 待发放）
const accountNetStr = computed(() => {
  const pool = accounts.value.reduce((s, a) => s + parseFloat(toNum(a.balance)), 0)
  const flowOut = filteredFlowsByMonth.value
    .filter(f => f.status === '待结算' && f.type === '支出')
    .reduce((s, f) => s + parseFloat(toNum(f.amount)), 0)
  const commOut = perfByMonth.value
    .filter(p => p.status === '待发放')
    .reduce((s, p) => s + parseFloat(toNum(p.finalAmount || p.final_amount)), 0)
  return fmtMoney2(pool - flowOut - commOut)
})

// ── Export ──
function exportFlows() {
  const list = filteredFlows.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的资金流水')
    return
  }
  exportCsv(`资金流水_${nowStamp()}.csv`,
    ['发生时间', '流水类型', '关联业务单号', '金额(元)', '支付账户', '资金项分类', '收款方', '收款账号', '状态'],
    list.map(f => [
      f.time, f.type, f.orderId || '', toNum(f.amount), f.account || '',
      f.itemClass || '', f.payee || '', f.payeeNo || '', f.status || '',
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条资金流水`)
}

// ── Actions ──
function oneClickSettle() {
  if (!isCurrentMonth.value) {
    ElMessage.warning(`只能结算当前月份（${currentMonth}），请先将月份切回本月`)
    return
  }
  ElMessageBox.confirm(
    `确认执行 ${selectedMonth.value} 月度绩效结算吗？执行后将锁定业务订单状态并生成薪资发放流水。`,
    '月度绩效结算',
    { confirmButtonText: '立即执行', cancelButtonText: '再核对下', type: 'warning' },
  ).then(() => {
    txApi.commissionSettle({
      op: 'generate',
      month: selectedMonth.value,
      staffList: perfByMonth.value.map((s) => ({
        name: s.name,
        dept: s.dept,
        recycleVal: s.recycleVal,
        salesVal: s.salesVal,
        rate: Number(s.rate) || 0,
      })),
    })
      .then(() => {
        ElMessage.success('月度绩效结算任务已提交，绩效记录已生成')
        // 结算可能影响：绩效表、资金流水、账户余额，三处一起刷新
        return Promise.all([loadPerf(selectedMonth.value), loadFlows(), loadAccounts()])
      })
      .catch((e) => ElMessage.error(e?.response?.data?.message || '结算失败'))
  }).catch(() => {})
}
// ── 单笔提成发放弹窗 ──
const commissionPayDialog = ref(false)
const commissionPayRow = ref(null)
const commissionPayForm = ref({ account: '', itemClass: '绩效提成' })
const commissionPaying = ref(false)
function payOne(row) {
  if (!row.id) {
    ElMessage.warning('该记录尚未结算入库，请先执行「一键执行本月结算」')
    return
  }
  // 双保险：只有审核通过的提成才能发起发放（后端 pay 接口同样有校验）
  if (row.auditStatus !== '已审核') {
    ElMessage.warning('该提成尚未审核通过，请先在操作列点击「审核」完成审核')
    return
  }
  commissionPayRow.value = row
  commissionPayForm.value = {
    account: accounts.value[0]?.name || '',
    itemClass: '绩效提成',
  }
  commissionPayDialog.value = true
}
function submitCommissionPay() {
  const row = commissionPayRow.value
  if (!row?.id) {
    ElMessage.warning('该记录尚未结算入库，请先执行「一键执行本月结算」')
    return
  }
  if (!commissionPayForm.value.account) {
    ElMessage.warning('请选择出款账户')
    return
  }
  if (!commissionPayForm.value.itemClass) {
    ElMessage.warning('请选择财务付款项')
    return
  }
  commissionPaying.value = true
  txApi.commissionSettle({
    op: 'pay',
    id: row.id,
    account: commissionPayForm.value.account,
    itemClass: commissionPayForm.value.itemClass,
  })
    .then(() => {
      row.status = '已发放'
      ElMessage.success(`已通过「${commissionPayForm.value.account}」发放 ${row.name} 的提成 ¥${row.finalAmount}`)
      commissionPayDialog.value = false
      // 发放可能影响资金流水与账户余额
      return Promise.all([loadFlows(), loadAccounts()])
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '发放失败'))
    .finally(() => { commissionPaying.value = false })
}

// ── 单条提成审核弹窗 ──
// 仅对待发放 / 已驳回的提成进行审核；已发放禁止再审；驳回意见必填
const auditDialog = ref(false)
const auditRow = ref(null)
const auditForm = ref({ decision: 'approve', comment: '' })
const auditing = ref(false)
const auth = useAuthStore()

// 审核状态 → el-tag type 配色
function auditTagType(s) {
  if (s === '已审核') return 'success'   // 绿
  if (s === '已驳回') return 'danger'    // 红
  return 'info'                          // 未审核：灰
}

function openAudit(row) {
  if (!row?.id) {
    ElMessage.warning('该记录尚未结算入库，请先执行「一键执行本月结算」')
    return
  }
  if (row.status === '已发放') {
    ElMessage.warning('已发放的提成不可再审核')
    return
  }
  auditRow.value = row
  // 默认根据当前审核状态决定默认动作：已驳回→重新通过；其他→通过
  auditForm.value = {
    decision: row.auditStatus === '已驳回' ? 'approve' : 'approve',
    comment: '',
  }
  auditDialog.value = true
}

function resetAuditForm() {
  auditForm.value = { decision: 'approve', comment: '' }
  auditRow.value = null
}

function submitAudit() {
  const row = auditRow.value
  if (!row?.id) {
    ElMessage.warning('该记录尚未结算入库，请先执行「一键执行本月结算」')
    return
  }
  if (!['approve', 'reject'].includes(auditForm.value.decision)) {
    ElMessage.warning('请选择审核结果')
    return
  }
  if (auditForm.value.decision === 'reject' && !auditForm.value.comment.trim()) {
    ElMessage.warning('驳回时必须填写审核意见')
    return
  }
  auditing.value = true
  txApi.commissionSettle({
    op: 'audit',
    id: row.id,
    decision: auditForm.value.decision,
    comment: auditForm.value.comment,
  })
    .then((r) => {
      // 同步本地缓存，让弹窗关闭后能立即看到新状态（无需重拉列表）
      const nextStatus = r?.data?.auditStatus || (auditForm.value.decision === 'approve' ? '已审核' : '已驳回')
      row.auditStatus = nextStatus
      row.auditor = r?.data?.auditor || auth.user?.name || ''
      row.auditTime = r?.data?.auditTime || ''
      row.auditComment = auditForm.value.comment
      ElMessage.success(auditForm.value.decision === 'approve'
        ? `已审核通过「${row.name}」的提成，可继续发放`
        : `已驳回「${row.name}」的提成，备注已记录`)
      auditDialog.value = false
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '审核失败'))
    .finally(() => { auditing.value = false })
}
// ── 明细弹窗（月度绩效计算明细）──
const detailDialog = ref(false)
const detailRow = ref(null)
const relatedOrders = ref([])
async function openDetail(row) {
  detailRow.value = row
  detailDialog.value = true
  // 从 settlement_flows 查该员工关联的真实资金流水
  relatedOrders.value = []
  try {
    const r = await rowsApi.list('settlement_flows', { size: 100 })
    const list = r?.data?.list || []
    const matched = list
      .filter(f => f.payee === row.name)
      .map(f => ({
        id: f.order_id || '',
        type: f.item_class || f.type || '',
        amount: f.amount || '0',
      }))
    if (matched.length) {
      relatedOrders.value = matched
    } else {
      relatedOrders.value = [
        { id: row.id ? `COMM-${String(row.id).padStart(4, '0')}` : '--', type: '提成佣金', amount: row.finalAmount || '0' },
      ]
    }
  } catch (e) {
    relatedOrders.value = [
      { id: row.id ? `COMM-${String(row.id).padStart(4, '0')}` : '--', type: '提成佣金', amount: row.finalAmount || '0' },
    ]
  }
}

// ── 批量提成方案弹窗 ──
const batchDialog = ref(false)
const planRate = ref('1.2')
const customName = ref('')
const customRate = ref(1.5)
const applyScope = ref(['sales_dept_1', 'sales_dept_2'])
const applying = ref(false)
function applyPlan() {
  if (applyScope.value.length === 0) {
    ElMessage.warning('请至少选择一个应用范围')
    return
  }
  const isCustom = planRate.value === 'custom'
  const finalRate = isCustom ? Number(customRate.value) || 0 : Number(planRate.value) || 1.2
  if (isCustom && finalRate <= 0) {
    ElMessage.warning('请输入有效的自定义提成比例')
    return
  }
  if (isCustom && !customName.value.trim()) {
    ElMessage.warning('请输入方案名称')
    return
  }
  const planLabel = isCustom ? customName.value.trim() : (
    {
      '1.2': '标准销售提成',
      '0.8': '大客户特惠方案',
      '2.4': '激励季翻倍方案',
      '1.0': '新人工底提成',
    }[planRate.value] || '自定义比例'
  )
  applying.value = true
  txApi.commissionSettle({
    op: 'apply-plan',
    rate: finalRate,
    scope: applyScope.value,
    name: planLabel,
  })
    .then((r) => {
      batchDialog.value = false
      ElMessage.success(`「${planLabel}」已成功应用，${r?.data?.affected ?? 0} 条待发放记录已按 ${finalRate}% 重算`)
      return Promise.all([loadPerf(selectedMonth.value), loadFlows(), loadAccounts()])
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '方案应用失败'))
    .finally(() => { applying.value = false })
}

// ── 流水刷新 ──
function refreshFlow() {
  loadFlows().then(() => ElMessage.success('资金流水已同步'))
}

// ── 财务出纳支付执行弹窗 ──
const payDialog = ref(false)
const payRow = ref(null)
const paying = ref(false)
const payForm = ref({ amount: '', account: '', itemClass: '', method: 'alipay' })
function openPay(row) {
  payRow.value = row
  payForm.value = {
    amount: row.amount,
    account: row.account,
    itemClass: row.itemClass,
    method: 'alipay',
  }
  payDialog.value = true
}
// ── 新增流水（真实持久化到后端）──
const newFlowDialog = ref(false)
const creating = ref(false)
const newFlow = ref({ type: '支出', orderId: '', amount: '', account: '', itemClass: '' })
function createFlow() {
  if (!newFlow.value.orderId || !newFlow.value.amount) {
    ElMessage.warning('请填写单号与金额')
    return
  }
  creating.value = true
  rowsApi
    .create('settlement_flows', {
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      type: newFlow.value.type,
      order_id: newFlow.value.orderId,
      amount: newFlow.value.amount,
      account: newFlow.value.account,
      item_class: newFlow.value.itemClass,
      status: '待结算',
    })
    .then(() => {
      newFlowDialog.value = false
      newFlow.value = { type: '支出', orderId: '', amount: '', account: '', itemClass: '' }
      ElMessage.success('流水已新增并持久化至数据库')
      loadFlows()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '新增失败'))
    .finally(() => (creating.value = false))
}

// ── 添加支付账户 ──
const accountDialog = ref(false)
const newAccount = ref({ type: 'bank', name: '', no: '', balance: '' })
const badgeMap = { bank: '银', wechat: '微', alipay: '支' }
function openAccountDialog() {
  newAccount.value = { type: 'bank', name: '', no: '', balance: '' }
  accountDialog.value = true
}
function addAccount() {
  if (!newAccount.value.name || !newAccount.value.no) {
    ElMessage.warning('请填写账户名称和账号')
    return
  }
  txApi.accountSave({
    name: newAccount.value.name,
    no: newAccount.value.no,
    type: newAccount.value.type,
    balance: newAccount.value.balance || '0.00',
  })
    .then(() => {
      accountDialog.value = false
      ElMessage.success('支付账户已添加并持久化')
      loadAccounts()
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '添加失败'))
}

function submitPay() {
  if (!payForm.value.amount) {
    ElMessage.warning('请填写实付金额')
    return
  }
  if (!payForm.value.account) {
    ElMessage.warning('请选择出款账户')
    return
  }
  if (!payForm.value.itemClass) {
    ElMessage.warning('请选择财务付款项')
    return
  }
  if (!payRow.value?.id) {
    ElMessage.warning('支付单据缺失')
    return
  }
  paying.value = true
  const channel = payForm.value.method === 'wechat' ? '微信码' : '支付宝码'
  txApi
    .payExecute({
      flowId: payRow.value.id,
      paidAmount: payForm.value.amount,
      account: payForm.value.account,
      itemClass: payForm.value.itemClass,
      channel,
    })
    .then(() => {
      if (payRow.value) payRow.value.status = '已结算'
      payDialog.value = false
      ElMessage.success(`已通过「${channel}」支付 ¥${payForm.value.amount}`)
    })
    .catch((e) => {
      ElMessage.error(e?.response?.data?.message || '支付执行失败')
    })
    .finally(() => {
      paying.value = false
    })
}
</script>

<style scoped>
.settlement-page { display: flex; flex-direction: column; gap: 16px; }

/* 顶部概览卡 */
.top-card { border-radius: 28px; border: 1px solid #f0f2f5; }
.top-inner { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; }
.top-left { display: flex; align-items: center; gap: 40px; min-width: 0; flex: 1; }
.stat-main { min-width: 0; }
.stat-main .stat-label { font-size: 11px; font-weight: 800; color: #9ca3af; letter-spacing: .15em; text-transform: uppercase; margin: 0 0 8px; }
.stat-main .stat-value { font-size: 34px; font-weight: 900; color: #111827; margin: 0; line-height: 1; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-main .stat-sub { font-size: 11px; font-weight: 700; color: #10b981; margin: 8px 0 0; }
.stat-main .stat-sub .c-orange { color: #f97316; font-weight: 900; }
.stat-main .stat-sub .c-green  { color: #059669; font-weight: 900; }
.stat-main .stat-sub .c-mute   { color: #6b7280; font-weight: 700; }
.top-divider { width: 1px; height: 48px; background: #f3f4f6; flex-shrink: 0; }
.mini-list { display: flex; gap: 36px; min-width: 0; }
.mini { min-width: 0; }
.mini-label { font-size: 11px; font-weight: 700; color: #9ca3af; margin: 0 0 6px; }
.mini-value { font-size: 20px; font-weight: 900; color: #374151; margin: 0; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-value.orange { color: #f97316; }
.settle-btn { border-radius: 24px; height: 54px; padding: 0 48px; font-size: 15px; font-weight: 900; box-shadow: 0 12px 30px rgba(16,185,129,.25); }

/* Tabs */
.settlement-tabs { border-radius: 28px; border: none; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.settlement-tabs :deep(.el-tabs__header) { background: #fafbfc; border-bottom: 1px solid #f0f0f0; }
.settlement-tabs :deep(.el-tabs__item) { font-weight: 600; height: 52px; line-height: 52px; }
.settlement-tabs :deep(.el-tabs__item.is-active) { font-weight: 800; }

/* 区块头 */
.pane-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 12px; }
.pane-title { display: flex; align-items: center; gap: 10px; }
.pane-title h3 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.title-tag { border-radius: 8px; font-weight: 700; }
.title-radio { margin-left: 12px; }
.title-radio .el-radio-button__inner { padding: 0 10px; }
.big-title { margin: 0; font-size: 18px; font-weight: 900; color: #111827; }
.sub-title { margin: 4px 0 0; font-size: 12px; color: #9ca3af; }

/* 业绩表 */
.staff-cell { display: flex; align-items: center; gap: 12px; }
.staff-name { margin: 0; font-size: 14px; font-weight: 800; color: #111827; }
.staff-dept { margin: 2px 0 0; font-size: 10px; font-weight: 700; color: #9ca3af; letter-spacing: .05em; }
.c-blue { color: #2563eb; font-weight: 700; }
.c-emerald { color: #059669; font-weight: 700; }
.c-rose { color: #f43f5e; font-weight: 700; }
.base-cell { display: flex; align-items: center; gap: 8px; }
.base-val { font-size: 13px; font-weight: 700; color: #374151; }
.rate-tag { border-radius: 6px; font-size: 10px; font-weight: 800; }
.final-amt { font-size: 16px; font-weight: 900; color: #111827; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }

/* 账户卡 */
.account-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
.account-card { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 24px; padding: 20px; transition: all .2s; }
.account-card:hover { background: #fff; box-shadow: 0 12px 30px rgba(0,0,0,.08); }
.account-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.account-icon { width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 18px; }
.account-icon.bank { background: #2563eb; }
.account-icon.wechat { background: #07c160; }
.account-icon.alipay { background: #1677ff; }
.account-name { font-weight: 800; color: #111827; font-size: 14px; }
.account-no { font-size: 11px; color: #9ca3af; margin-top: 2px; font-family: ui-monospace, monospace; }
.account-balance { display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid #eef2f7; }
.bal-label { font-size: 11px; color: #9ca3af; font-weight: 700; }
.bal-value { font-size: 18px; font-weight: 900; color: #111827; }

/* 资金池合计条 */
.account-summary {
  display: flex; align-items: center; gap: 28px;
  background: linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 100%);
  border: 1px solid #dbeafe; border-radius: 20px;
  padding: 18px 28px; margin-top: 8px;
}
.as-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.as-label { font-size: 11px; font-weight: 800; color: #6b7280; letter-spacing: .08em; }
.as-value { font-size: 22px; font-weight: 900; color: #374151; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-value.primary { color: #1d4ed8; }
.as-value.warn { color: #f97316; }
.as-value.success { color: #059669; }
.as-divider { width: 1px; height: 36px; background: #dbeafe; flex-shrink: 0; }
@media (max-width: 1100px) {
  .account-grid { grid-template-columns: 1fr; }
  .account-summary { flex-wrap: wrap; gap: 16px 24px; }
  .as-divider { display: none; }
}
.flow-section { margin-top: 8px; }
.flow-amt { font-size: 16px; font-weight: 900; }
.pane-actions { display: flex; align-items: center; gap: 12px; }
.batch-plan-btn { padding-left: 24px; padding-right: 24px; }
.pay-btn {
  --el-button-bg-color: #2563eb;
  --el-button-border-color: #2563eb;
  --el-button-hover-bg-color: #1d4ed8;
  --el-button-hover-border-color: #1d4ed8;
  font-weight: 800;
  border-radius: 9999px;
  padding-left: 16px; padding-right: 16px;
}

/* 明细弹窗 */
.detail-formula-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.detail-cap { font-size: 10px; font-weight: 900; color: #9ca3af; text-transform: uppercase; letter-spacing: .1em; margin: 0; }
.detail-cap--mt { margin-top: 24px; }
.detail-model { font-size: 10px; background: #fff; padding: 4px 12px; border-radius: 9999px; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.detail-formula { font-size: 16px; font-weight: 800; color: #111827; background: #f8fafc; border: 1px solid #eef2f7; border-radius: 16px; padding: 16px 20px; margin: 0; }
.related-list { display: flex; flex-direction: column; gap: 8px; }
.related-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #f1f5f9; border-radius: 12px; }
.related-id { font-size: 13px; font-weight: 700; color: #374151; }
.related-amt { font-size: 14px; font-weight: 900; color: #059669; }

/* 批量提成方案弹窗 立即全量应用按钮(橙) */
.batch-apply-btn {
  --el-button-bg-color: #f97316;
  --el-button-border-color: #f97316;
  --el-button-hover-bg-color: #fb923c;
  --el-button-hover-border-color: #fb923c;
  --el-button-active-bg-color: #ea580c;
  --el-button-active-border-color: #ea580c;
  font-weight: 900;
  padding-left: 40px;
  padding-right: 40px;
}
.mb-6 { margin-bottom: 24px; }

/* 未审核通过时操作列的禁用态「待审核」提示（替代发放按钮） */
.pay-disabled-hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  cursor: not-allowed;
  user-select: none;
}

/* ── 审核弹窗 ── */
.audit-hero {
  background: linear-gradient(135deg, #1e293b 0%, #312e81 60%, #4338ca 100%);
  border-radius: 20px;
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  margin-bottom: 18px;
  box-shadow: 0 12px 28px rgba(67, 56, 202, .25);
  position: relative;
  overflow: hidden;
}
.audit-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 80% at 100% 0%, rgba(99, 102, 241, .45), transparent 60%);
  pointer-events: none;
}
.audit-hero-text { position: relative; z-index: 1; }
.audit-hero-cap { font-size: 11px; letter-spacing: .12em; opacity: .75; font-weight: 700; text-transform: uppercase; }
.audit-hero-amount { font-size: 36px; font-weight: 900; margin: 6px 0 4px; line-height: 1.05; letter-spacing: -.02em; }
.audit-hero-sub { font-size: 11px; opacity: .75; font-weight: 600; }
.audit-prior { color: #fde68a; font-weight: 700; }
.audit-hero-icon {
  width: 72px; height: 72px; border-radius: 18px;
  background: rgba(255, 255, 255, .12); display: grid; place-items: center;
  color: #fff; position: relative; z-index: 1;
  border: 1px solid rgba(255, 255, 255, .18);
}
.audit-decision { display: flex; gap: 12px; }
.audit-decision :deep(.el-radio-button__inner) {
  display: inline-flex; align-items: center; gap: 4px;
  padding-left: 18px; padding-right: 18px;
  font-weight: 800; border-radius: 9999px !important;
}
.audit-alert { margin-bottom: 6px; border-radius: 12px; }
.audit-confirm-btn {
  --el-button-bg-color: #10b981;
  --el-button-border-color: #10b981;
  --el-button-hover-bg-color: #059669;
  --el-button-hover-border-color: #059669;
  --el-button-active-bg-color: #047857;
  --el-button-active-border-color: #047857;
  font-weight: 900;
  padding-left: 28px; padding-right: 28px;
}
.audit-confirm-btn--reject {
  --el-button-bg-color: #ef4444;
  --el-button-border-color: #ef4444;
  --el-button-hover-bg-color: #dc2626;
  --el-button-hover-border-color: #dc2626;
  --el-button-active-bg-color: #b91c1c;
  --el-button-active-border-color: #b91c1c;
}
.audit-tip { font-size: 12px; line-height: 1.6; color: #374151; }
.audit-tip p { margin: 0; }

/* ── 表格内 badge cursor help ── */
.cursor-help { cursor: help; }

@media (max-width: 1100px) { .account-grid { grid-template-columns: 1fr; } }

/* 财务出纳支付执行弹窗 */
.pay-dialog :deep(.el-dialog__body) { padding: 18px 24px 8px; }
.pay-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%);
  border-radius: 20px;
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  margin-bottom: 18px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, .25);
  position: relative;
  overflow: hidden;
}
.pay-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 80% at 100% 0%, rgba(59,130,246,.45), transparent 60%);
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
.pay-input-prefix { color: #2563eb; font-weight: 800; }
.pay-payee {
  background: linear-gradient(180deg, #eff6ff 0%, #f0f9ff 100%);
  border: 1px solid #dbeafe;
  border-radius: 16px;
  padding: 16px 18px;
  margin-top: 6px;
}
.pay-payee-head {
  display: flex; align-items: center; gap: 8px;
  font-size: 10px; font-weight: 900; color: #1d4ed8;
  text-transform: uppercase; letter-spacing: .12em; margin-bottom: 12px;
}
.pay-payee-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0;
  border-top: 1px dashed #c7d2fe;
}
.pay-payee-row:first-of-type { border-top: none; }
.pay-payee-label { font-size: 12px; color: #6b7280; font-weight: 700; }
.pay-payee-value { font-size: 13px; color: #111827; font-weight: 800; }
.pay-method {
  display: flex; gap: 10px; margin-top: 14px;
}
.pay-method-btn {
  flex: 1; height: 42px; border-radius: 12px; border: 1px solid #dbeafe;
  background: #fff; cursor: pointer; transition: all .15s;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 800; color: #1e40af;
}
.pay-method-btn:hover { border-color: #3b82f6; box-shadow: 0 4px 10px rgba(59,130,246,.2); }
.pay-method-btn.active {
  border-color: #1d4ed8; background: linear-gradient(180deg, #dbeafe, #bfdbfe);
  box-shadow: inset 0 0 0 1px #1d4ed8;
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
.op-empty { color: #cbd5e1; font-size: 16px; }

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
