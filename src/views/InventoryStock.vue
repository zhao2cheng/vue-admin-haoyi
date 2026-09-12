<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="header-content" style="display:flex;align-items:center;justify-content:space-between">
        <div class="title-section">
          <h3>库存查询</h3>
          <p>实时监控库存资产与批次明细</p>
        </div>
        <el-button size="small" @click="openFlowLogGlobal">出入库流水</el-button>
      </div>
    </template>
    <!-- ==================== Summary Ribbon ==================== -->
    <div class="stock-ribbon">
      <div class="ribbon-item">
        <div class="ribbon-icon bg-[#d1fae5] text-[#059669]">
          <el-icon :size="18"><Money /></el-icon>
        </div>
        <div class="ribbon-data">
          <span class="ribbon-label">库存资产估值</span>
          <span class="ribbon-value">¥{{ stockSummary.totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
          <span class="ribbon-trend">—</span>
        </div>
      </div>

      <div class="ribbon-item">
        <div class="ribbon-icon bg-blue-100 text-blue-600">
          <el-icon :size="18"><Box /></el-icon>
        </div>
        <div class="ribbon-data">
          <span class="ribbon-label">SKU 在库总数</span>
          <span class="ribbon-value">{{ stockSummary.totalSku.toLocaleString() }}</span>
          <span class="ribbon-sub">活跃 SKU: {{ stockSummary.totalSku }}</span>
        </div>
      </div>

      <div class="ribbon-item">
        <div class="ribbon-icon bg-orange-100 text-orange-600">
          <el-icon :size="18"><WarningFilled /></el-icon>
        </div>
        <div class="ribbon-data">
          <span class="ribbon-label">库存风险预警</span>
          <span class="ribbon-value text-orange-500">{{ stockSummary.riskCount }}</span>
          <span class="ribbon-sub">低于安全水位</span>
        </div>
      </div>

      <div class="ribbon-item">
        <div class="ribbon-icon bg-purple-100 text-purple-600">
          <el-icon :size="18"><Odometer /></el-icon>
        </div>
        <div class="ribbon-data">
          <span class="ribbon-label">月度周转率</span>
          <span class="ribbon-value">{{ stockSummary.turnoverRate }}%</span>
          <div class="mini-progress">
            <div class="bar" :style="{ width: stockSummary.turnoverRate + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== Main Card with Tabs ==================== -->
    <el-card shadow="never" class="table-card !p-0 overflow-hidden">
      <el-tabs v-model="activeTab" class="stock-tabs">
        <!-- ==================== TAB 1: 实时在库查询 ==================== -->
        <el-tab-pane label="实时在库查询" name="inventory">
          <div class="tab-toolbar">
            <div class="toolbar-left">
              <el-input
                v-model="invSearch"
                placeholder="快速定位 SKU/批次/供应商..."
                class="compact-search"
                clearable
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-select
                v-model="invWarehouse"
                placeholder="全部仓库"
                class="warehouse-select"
                size="small"
                clearable
              >
                <el-option
                  v-for="wh in warehouseOptions"
                  :key="wh"
                  :label="wh"
                  :value="wh"
                />
              </el-select>
            </div>
            <div class="toolbar-right">
              <el-button
                type="primary"
                plain
                size="small"
                @click="auditByFilter"
                :disabled="!filteredInventory.length"
              >
                <el-icon><Odometer /></el-icon>
                按筛选发起盘点
              </el-button>
              <el-dropdown trigger="click" @command="handleWriteoffCommand">
                <el-button type="warning" size="small" class="!px-6">
                  发起资产核销
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="loss">
                      <el-icon><WarningFilled /></el-icon>
                      实物报损销账
                    </el-dropdown-item>
                    <el-dropdown-item command="reimburse">
                      <el-icon><Box /></el-icon>
                      内部领用/报销销账
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button type="primary" size="small" @click="syncInventory" :loading="syncing">
                同步库存
              </el-button>
              <el-button size="small" @click="exportInventory">
                <el-icon><Download /></el-icon>
                导出库存
              </el-button>
            </div>
          </div>

          <el-table v-loading="loading" :data="pagedInventory" style="width:100%" class="dense-table">
            <!-- Icon Box -->
            <el-table-column width="60">
              <template #default="{ row }">
                <div :class="['product-icon-box', row.category]">
                  <el-icon v-if="row.category === '动力电池'" :size="20"><BatteryCharging /></el-icon>
                  <el-icon v-else :size="20"><Box /></el-icon>
                </div>
              </template>
            </el-table-column>

            <!-- 产品基础资料 -->
            <el-table-column label="产品基础资料" min-width="240">
              <template #default="{ row }">
                <div class="product-info-cell">
                  <p class="product-name">{{ row.name }}</p>
                  <div class="product-meta">
                    <span>#{{ row.sku }}</span>
                    <el-divider direction="vertical" />
                    <span>{{ row.category }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>

            <!-- 实时在库 -->
            <el-table-column label="实时在库" width="160" align="center">
              <template #default="{ row }">
                <div class="stock-cell">
                  <div class="stock-quantity">
                    <span :class="['val', { warning: row.amount < row.minStock }]">{{ row.amount }}</span>
                    <span class="unit">{{ row.unit }}</span>
                  </div>
                  <div v-if="row.locked > 0" class="lock-info">
                    待出库锁定: {{ row.locked }}
                  </div>
                </div>
              </template>
            </el-table-column>

            <!-- 所属仓库 -->
            <el-table-column label="所属仓库" width="180">
              <template #default="{ row }">
                <div class="warehouse-cell">
                  <p>{{ row.warehouse }}</p>
                  <p class="text-xs text-gray-400 mt-1">当前资产归属地</p>
                </div>
              </template>
            </el-table-column>

            <!-- 最近盘点（关联 InventoryAudit 的 audit_results） -->
            <el-table-column label="最近盘点" width="150">
              <template #default="{ row }">
                <div v-if="lastAuditMap[row.id]" class="audit-cell">
                  <p class="audit-time">{{ (lastAuditMap[row.id].time || '').slice(0, 10) }}</p>
                  <el-tag
                    size="small"
                    effect="plain"
                    :type="lastAuditMap[row.id].diff > 0 ? 'success' : lastAuditMap[row.id].diff < 0 ? 'danger' : 'info'"
                  >
                    {{ lastAuditMap[row.id].diff > 0 ? '盘盈 +' + lastAuditMap[row.id].diff : lastAuditMap[row.id].diff < 0 ? '盘亏 ' + lastAuditMap[row.id].diff : '账实相符' }}
                  </el-tag>
                </div>
                <span v-else class="text-gray-400 text-xs">未盘点</span>
              </template>
            </el-table-column>

            <!-- 资产价值 -->
            <el-table-column label="资产价值" width="180">
              <template #default="{ row }">
                <div class="value-cell">
                  <p class="total-value">¥{{ row.totalValue }}</p>
                  <p class="unit-price">成本单价: ¥{{ row.avgPrice }}</p>
                </div>
              </template>
            </el-table-column>

            <!-- 操作 -->
            <el-table-column label="操作" width="120" fixed="right" align="right">
              <template #default="{ row }">
                <div class="action-cell">
                  <el-button link type="primary" @click="openDetail(row)">查看明细</el-button>
                  <el-dropdown trigger="click">
                    <el-button link type="primary">
                      <el-icon><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click="openAudit(row)">
                          <el-icon><Odometer /></el-icon>
                          发起盘点
                        </el-dropdown-item>
                        <el-dropdown-item divided @click="openManualAdjust(row)">手动修正</el-dropdown-item>
                        <el-dropdown-item @click="openTransfer(row)">库间调拨</el-dropdown-item>
                        <el-dropdown-item type="danger" @click="openLoss(row)">报损销账</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页：对筛选后的库存全集切片，搜索/仓库筛选仍作用于全部数据 -->
          <div v-if="filteredInventory.length" class="pagination-wrap">
            <el-pagination
              background
              layout="total, sizes, prev, pager, next, jumper"
              :total="filteredInventory.length"
              :page-sizes="[10, 20, 50, 100, 200]"
              v-model:current-page="invPage"
              v-model:page-size="invPageSize"
            />
          </div>
        </el-tab-pane>

        <!-- ==================== TAB 2: 核销订单查询 ==================== -->
        <el-tab-pane label="核销订单查询" name="writeoff">
          <div class="tab-toolbar">
            <div class="toolbar-left">
              <el-input
                v-model="woSearch"
                placeholder="搜索单号、产品、备注..."
                class="compact-search"
                clearable
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-select
                v-model="woTypeFilter"
                placeholder="核销类型"
                class="!w-32"
                size="small"
                clearable
              >
                <el-option label="报损销账" value="loss" />
                <el-option label="报销销账" value="reimburse" />
              </el-select>
              <el-date-picker
                v-model="woDateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
                size="small"
                clearable
              />
            </div>
            <div class="toolbar-right">
              <el-button size="small" @click="exportWriteoffs">
                <el-icon><Download /></el-icon>
                导出核销
              </el-button>
            </div>
          </div>

          <el-table v-loading="loading" :data="filteredWriteoffs" style="width:100%" class="dense-table">
            <el-table-column prop="id" label="核销单号" width="150">
              <template #default="{ row }">
                <span>{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="核销类型" width="120">
              <template #default="{ row }">
                <el-tag
                  :type="row.type === 'loss' ? 'danger' : row.type === 'audit' ? (row.isGain ? 'success' : 'warning') : 'warning'"
                  size="small"
                  effect="plain"
                  class="font-bold"
                >
                  {{ row.type === 'audit' ? (row.isGain ? '盘点盘盈' : '盘点盘亏') : row.type === 'loss' ? '报损销账' : '报销销账' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="核销资产" min-width="200">
              <template #default="{ row }">
                <p>{{ row.productName }}</p>
                <p class="batch-id-text">批次: {{ row.batchNo }}</p>
              </template>
            </el-table-column>
            <el-table-column label="数量" width="100" align="center">
              <template #default="{ row }">
                <span class="deduct-num">-{{ row.amount }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="原因/用途" min-width="180" />
            <el-table-column label="操作人/时间" width="180">
              <template #default="{ row }">
                <p>{{ row.operator }}</p>
                <p class="op-time">{{ row.time }}</p>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="showWriteoffDetail(row)">凭证</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- ==================== Dialog: 手动库存修正 ==================== -->
    <el-dialog
      v-model="dlgManualAdjust"
      title="手动库存修正"
      width="440px"
      class="custom-dialog"
    >
      <div v-if="selectedItem" class="adjust-info">
        <p class="text-xs text-gray-400">正在调整产品:</p>
        <p class="adjust-name">{{ selectedItem.name }} ({{ selectedItem.sku }})</p>
      </div>
      <el-form :model="adjustForm" label-width="90px">
        <el-form-item label="调整批次">
          <el-select v-model="adjustForm.batchNo" class="w-full">
            <el-option
              v-for="b in selectedItem?.batches"
              :key="b.batchNo"
              :label="b.batchNo"
              :value="b.batchNo"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="变动数量">
          <el-input-number v-model="adjustForm.delta" class="!w-full" />
          <p class="text-[10px] text-gray-400 mt-1">正数为盘盈入库，负数为盘亏出库</p>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-select v-model="adjustForm.reason" class="w-full">
            <el-option label="定期盘点误差" value="盘点" />
            <el-option label="货物破损/遗失" value="破损" />
            <el-option label="录入错误修正" value="修正" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgManualAdjust = false">取消</el-button>
          <el-button type="primary" @click="submitManualAdjust" :loading="submitting">确认提交</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 跨仓库调拨 ==================== -->
    <el-dialog
      v-model="dlgTransfer"
      title="跨仓库调拨"
      width="440px"
      class="custom-dialog"
    >
      <el-form :model="transferForm" label-width="90px">
        <el-form-item label="调出仓库">
          <el-input :model-value="selectedItem?.warehouse" disabled />
        </el-form-item>
        <el-form-item label="调入仓库">
          <el-select v-model="transferForm.toWarehouse" class="w-full">
            <el-option
              v-for="wh in transferTargetWarehouses"
              :key="wh"
              :label="wh"
              :value="wh"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="调拨数量">
          <el-input-number
            v-if="(selectedItem?.amount || 0) >= 1"
            v-model="transferForm.amount"
            :min="1"
            :max="selectedItem?.amount"
            class="!w-full"
          />
          <span v-else class="text-xs text-red-500">当前库存可用数量为 0，无法发起调拨。</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="transferForm.remark"
            type="textarea"
            placeholder="调拨原因或关联单号"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgTransfer = false">取消</el-button>
          <el-button type="primary" @click="submitTransfer" :loading="submitting" :disabled="(selectedItem?.amount || 0) < 1">发起调拨任务</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 批次质量检测报告 ==================== -->
    <el-dialog
      v-model="dlgQcReport"
      title="批次质量检测报告"
      width="650px"
      class="pro-dialog"
    >
      <div v-if="selectedBatch && currentQcTemplate" class="qc-report-content">
        <div class="qc-header">
          <div class="qc-header-left">
            <div>
              <h4>{{ selectedItem?.name }}</h4>
              <p class="qc-batch-info">批次: {{ selectedBatch.batchNo }} | 品类: {{ selectedItem?.category }}</p>
            </div>
            <el-tag
              size="large"
              :type="isQcPass(selectedBatch) === 'pass' ? 'success' : isQcPass(selectedBatch) === 'fail' ? 'danger' : 'info'"
              effect="dark"
              class="font-bold"
            >
              <template v-if="isQcPass(selectedBatch) === 'pass'">合格 (PASS)</template>
              <template v-else-if="isQcPass(selectedBatch) === 'fail'">不合格 (FAIL)</template>
              <template v-else>未检测 (PENDING)</template>
            </el-tag>
          </div>
        </div>

        <el-empty
          v-if="isQcPass(selectedBatch) === 'pending'"
          description="该批次尚未进行任何质量检测"
          :image-size="80"
          class="py-2"
        >
          <el-button type="primary" plain @click="openQcEntry(selectedBatch)">
            <el-icon class="mr-1"><VideoPlay /></el-icon>
            开始检测 · 录入数据
          </el-button>
        </el-empty>

        <div class="qc-metrics" v-else>
          <div
            v-for="metric in currentQcTemplate.template"
            :key="metric.label"
            class="metric-card-dynamic"
            :class="{ 'metric-missing': selectedBatch[metric.label] == null }"
          >
            <div class="metric-header">
              <span>{{ metric.label }}</span>
              <el-tag
                :type="selectedBatch[metric.label] == null ? 'warning' : gradeQcMetric(metric, selectedBatch[metric.label]).level"
                size="small"
                effect="plain"
                class="font-bold"
              >
                {{ selectedBatch[metric.label] == null ? '待录入' : gradeQcMetric(metric, selectedBatch[metric.label]).label }}
              </el-tag>
            </div>
            <div class="metric-value-row">
              <span class="metric-val">{{ selectedBatch[metric.label] ?? '—' }}</span>
              <span v-if="metric.unit && selectedBatch[metric.label] != null" class="metric-unit">{{ metric.unit }}</span>
            </div>
            <div class="metric-standard">
              标准:
              <span v-if="metric.type === 'number'">{{ metric.min }} ~ {{ metric.max }}</span>
              <span v-else-if="metric.type === 'boolean'">{{ metric.expected ? '合格' : 'NG' }}</span>
              <span v-else-if="metric.type === 'select'">{{ metric.options }}</span>
            </div>
          </div>
        </div>

        <div class="qc-footer">
          <div class="qc-remark">
            <span class="text-[10px] text-gray-400 font-bold uppercase">检测备注</span>
            <span>{{ selectedBatch.remark || '无' }}</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-[10px] text-gray-400 font-bold uppercase">最后质检人 / 时间</span>
            <span class="text-xs text-gray-500">
              <template v-if="isQcPass(selectedBatch) === 'pending'">待检测</template>
              <template v-else>
                {{ authStore.user?.name || authStore.user?.username || '当前用户' }} | {{ selectedBatch.updated_at || todayStr }}
              </template>
            </span>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgQcReport = false">关闭窗口</el-button>
          <el-button
            :type="isQcPass(selectedBatch) === 'pending' ? 'primary' : 'primary'"
            :plain="isQcPass(selectedBatch) === 'pending'"
            @click="openQcEntry(selectedBatch)"
          >
            <el-icon class="mr-1"><VideoPlay v-if="isQcPass(selectedBatch) === 'pending'" /><EditPen v-else /></el-icon>
            {{ isQcPass(selectedBatch) === 'pending' ? '开始检测 · 录入数据' : '重新录入检测数据' }}
          </el-button>
          <el-button type="primary">
            <el-icon><Download /></el-icon>
            导出 PDF 报告
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 录入批次质检记录 ==================== -->
    <el-dialog
      v-model="dlgQcEntry"
      title="录入批次质检记录"
      width="540px"
      class="pro-dialog"
    >
      <div v-if="currentQcTemplate" class="qc-entry-content">
        <div class="qc-entry-header">
          <div>
            <p class="text-[10px] uppercase font-bold tracking-wider text-gray-400">正在录入产品品类</p>
            <p class="text-sm font-bold">{{ selectedItem?.category }}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase font-bold tracking-wider text-gray-400">批次编号</p>
            <p class="text-sm font-bold">{{ qcEntryForm.batchNo }}</p>
          </div>
        </div>
        <el-form :model="qcEntryForm" label-width="120px" label-position="left">
          <div
            v-for="metric in currentQcTemplate.template"
            :key="metric.label"
            class="dynamic-field-row mb-4 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm"
          >
            <div class="field-label-row">
              <span>
                {{ metric.label }}
                <small v-if="metric.unit">({{ metric.unit }})</small>
              </span>
              <el-tag
                v-if="metric.type === 'number'"
                :type="gradeQcMetric(metric, qcEntryForm.values[metric.label]).level"
                size="small"
                effect="dark"
                class="font-black"
              >
                {{ gradeQcMetric(metric, qcEntryForm.values[metric.label]).label }}
              </el-tag>
            </div>
            <el-input-number
              v-if="metric.type === 'number'"
              v-model="qcEntryForm.values[metric.label]"
              :precision="2"
              class="!w-full"
              placeholder="请输入检测数值"
            />
            <el-radio-group
              v-else-if="metric.type === 'boolean'"
              v-model="qcEntryForm.values[metric.label]"
            >
              <el-radio-button :label="true">合格 (OK)</el-radio-button>
              <el-radio-button :label="false">待定/NG</el-radio-button>
            </el-radio-group>
            <el-select
              v-else-if="metric.type === 'select'"
              v-model="qcEntryForm.values[metric.label]"
              class="w-full"
            >
              <el-option
                v-for="opt in (metric.options || '').split(',')"
                :key="opt"
                :label="opt"
                :value="opt"
              />
            </el-select>
          </div>
          <el-form-item label="综合判定备注" class="mt-6">
            <el-input
              v-model="qcEntryForm.remark"
              type="textarea"
              :rows="2"
              placeholder="输入最终质检结论或后续处置建议..."
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgQcEntry = false">取消</el-button>
          <el-button type="primary" @click="submitQcEntry" :loading="submitting">保存并同步质检结果</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 资产报损销账 ==================== -->
    <el-dialog
      v-model="dlgLoss"
      title="资产报损销账"
      width="460px"
      class="pro-dialog"
    >
      <div v-if="selectedItem" class="loss-warning-banner">
        <el-icon class="text-red-500 mt-0.5"><WarningFilled /></el-icon>
        <div class="text-xs text-red-700 leading-relaxed font-medium">
          注意：报损操作将直接从库存结存中扣除资产数量，并计入财务损耗。请务必确认实物状态并上传核销证据。
        </div>
      </div>
      <el-form :model="lossForm" label-width="90px" label-position="left">
        <el-form-item label="核销批次">
          <el-select v-model="lossForm.batchNo" class="w-full">
            <el-option
              v-for="b in selectedItem.batches"
              :key="b.batchNo"
              :label="`${b.batchNo} (可用: ${b.amount})`"
              :value="b.batchNo"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="报损数量">
          <el-input-number
            v-if="lossMax >= 1"
            v-model="lossForm.amount"
            :min="1"
            :max="lossMax"
            class="!w-full"
          />
          <span v-else class="text-xs text-red-500">该批次当前可用数量为 0，无法发起报损。</span>
        </el-form-item>
        <el-form-item label="损耗原因">
          <el-select v-model="lossForm.reason" class="w-full">
            <el-option label="实物破损 (不可修复)" value="破损" />
            <el-option label="技术淘汰 / 报废" value="报废" />
            <el-option label="盘点缺失 (查无实物)" value="缺失" />
            <el-option label="检测不合格 (退港/销毁)" value="检测失败" />
          </el-select>
        </el-form-item>
        <el-form-item label="证据上传">
          <el-upload action="#" list-type="picture-card" :limit="1" class="mini-upload">
            <el-icon><Plus /></el-icon>
          </el-upload>
          <p class="text-[10px] text-gray-400 mt-2">请上传现场破损照片或报废审批单盖章扫描件</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgLoss = false">取消</el-button>
          <el-button type="danger" @click="submitLoss" :loading="submitting" :disabled="lossMax < 1">确认销账</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 资产报销销账 (内部领用) ==================== -->
    <el-dialog
      v-model="dlgReimburse"
      title="资产报销销账 (内部领用)"
      width="460px"
      class="pro-dialog"
    >
      <div v-if="selectedItem" class="reimburse-info-banner">
        <el-icon class="text-blue-500 mt-0.5"><InfoFilled /></el-icon>
        <div class="text-xs text-blue-700 leading-relaxed font-medium">
          提示：此操作用于记录公司内部领用或报销性质的库存扣减。领用人及用途将记入核销流水。
        </div>
      </div>
      <el-form :model="reimburseForm" label-width="90px" label-position="left">
        <el-form-item label="核销批次">
          <el-select v-model="reimburseForm.batchNo" class="w-full">
            <el-option
              v-for="b in selectedItem.batches"
              :key="b.batchNo"
              :label="`${b.batchNo} (可用: ${b.amount})`"
              :value="b.batchNo"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="领用数量">
          <el-input-number
            v-if="reimburseMax >= 1"
            v-model="reimburseForm.amount"
            :min="1"
            :max="reimburseMax"
            class="!w-full"
          />
          <span v-else class="text-xs text-red-500">该批次当前可用数量为 0，无法发起领用。</span>
        </el-form-item>
        <el-form-item label="领用用途">
          <el-select v-model="reimburseForm.reason" class="w-full">
            <el-option label="研发部门领用" value="研发领用" />
            <el-option label="展厅样机演示" value="样机演示" />
            <el-option label="售后服务备件" value="售后备件" />
            <el-option label="行政/日常消耗" value="行政领用" />
          </el-select>
        </el-form-item>
        <el-form-item label="领用备注">
          <el-input
            v-model="reimburseForm.remark"
            type="textarea"
            :rows="2"
            placeholder="备注领用人及具体事项..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgReimburse = false">取消</el-button>
          <el-button type="primary" @click="submitReimburse" :loading="submitting" :disabled="reimburseMax < 1">确认出库</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Drawer: 出入库流水明细 ==================== -->
    <el-drawer
      v-model="dlgFlowLog"
      :title="selectedItem ? `出入库流水明细 - ${selectedItem.name}` : '全局出入库流水明细'"
      size="500px"
    >
      <div class="flow-log-content">
        <div class="flow-header">
          <p v-if="selectedItem" class="flow-product-name">{{ selectedItem.name }}</p>
          <p v-else class="flow-product-name">全部库存流水</p>
          <div class="flow-stats">
            <div class="stat">
              <span>总入库</span>
              <span class="v in">{{ currentFlowStats.inbound }}</span>
            </div>
            <div class="stat">
              <span>总出库</span>
              <span class="v out">{{ currentFlowStats.outbound }}</span>
            </div>
            <div v-if="selectedItem" class="stat balance">
              <span>结存</span>
              <span class="balance-val">{{ selectedItem.amount }}</span>
            </div>
            <div v-else class="stat balance">
              <span>当前库存总量</span>
              <span class="balance-val">{{ stockSummary.totalSku }}</span>
            </div>
          </div>
        </div>
        <el-divider />
        <div class="flow-timeline">
          <el-timeline v-if="currentFlowLogs.length">
            <el-timeline-item
              v-for="(log, idx) in currentFlowLogs"
              :key="idx"
              :timestamp="log.time"
              :type="log.type"
            >
              <div class="timeline-item-content">
                <div class="timeline-row">
                  <span class="timeline-action">{{ log.action }}</span>
                  <span :class="['num', log.type === 'success' ? 'in' : 'out']">
                    {{ log.type === 'success' ? '+' : '-' }}{{ log.amount }}
                  </span>
                </div>
                <p v-if="log.productName" class="timeline-product">{{ log.productName }}</p>
                <p class="timeline-remark">{{ log.remark }}</p>
                <div v-if="log.operator" class="timeline-operator">
                  操作员: {{ log.operator }}
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无流水记录" />
        </div>
      </div>
    </el-drawer>

    <!-- ==================== Dialog: 库存资产明细 ==================== -->
    <el-dialog
      v-model="dlgDetail"
      :title="`库存资产明细: ${selectedItem?.name || ''}`"
      width="920px"
      class="pro-dialog inventory-detail-dialog"
      align-center
    >
      <div v-if="selectedItem" class="detail-content">
        <div class="detail-top-bar">
          <div>
            <p class="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Inventory Management</p>
            <h3>{{ selectedItem.name }}</h3>
            <p class="detail-summary">SKU: {{ selectedItem.sku }} | 总结存: {{ selectedItem.amount }} {{ selectedItem.unit }}<template v-if="lastAuditMap[selectedItem.id]"> | 最近盘点: {{ (lastAuditMap[selectedItem.id].time || '').slice(0, 10) }}（{{ lastAuditMap[selectedItem.id].planNo }}，{{ lastAuditMap[selectedItem.id].diff > 0 ? '盘盈 +' + lastAuditMap[selectedItem.id].diff : lastAuditMap[selectedItem.id].diff < 0 ? '盘亏 ' + lastAuditMap[selectedItem.id].diff : '账实相符' }}）</template></p>
          </div>
          <div class="locked-badge">
            <div class="locked-stat">
              <span class="text-[9px] text-gray-500 font-black block leading-none">锁定库位</span>
              <span class="locked-count">{{ selectedItem.locked }}</span>
            </div>
          </div>
        </div>

        <div class="batch-section">
          <div class="batch-toolbar">
            <h4 class="text-[11px] font-black text-gray-400 uppercase tracking-widest">单体资产/批次列表 (Individual Items)</h4>
            <div class="batch-actions">
              <el-input
                v-model="batchSearch"
                placeholder="搜索唯一识别码..."
                size="small"
                class="!w-48"
                clearable
              />
              <el-button type="primary" size="small" @click="openManualIn">
                <el-icon><Plus /></el-icon>
                手动入库
              </el-button>
            </div>
          </div>

          <el-table
            :data="paginatedBatches"
            style="width:100%"
            class="dense-table border rounded-2xl overflow-hidden shadow-sm"
          >
            <el-table-column label="唯一识别码/批次" min-width="180">
              <template #default="{ row }">
                <div class="batch-id-cell">
                  <span class="batch-id">{{ row.id || row.batchNo }}</span>
                  <span class="batch-date">入库日期: {{ row.mfd }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="来源回收单" width="160">
              <template #default="{ row }">
                <el-button
                  v-if="row.recycleOrderId"
                  link
                  type="primary"
                  size="small"
                  class="!p-0 h-auto font-black text-[11px]"
                  @click="openTrace(row.recycleOrderId)"
                >
                  #{{ row.recycleOrderId }}
                </el-button>
                <span v-else class="text-gray-400 text-xs">手动录入/采购</span>
              </template>
            </el-table-column>
            <el-table-column label="当前结存" width="100" align="center">
              <template #default="{ row }">
                <span>{{ row.amount }} {{ selectedItem.unit }}</span>
              </template>
            </el-table-column>
            <el-table-column label="健康度 (SOH)" width="150">
              <template #default="{ row }">
                <div class="health-bar">
                  <div
                    class="fill"
                    :style="{ width: row.health + '%', background: row.health > 90 ? '#10b981' : '#f59e0b' }"
                  ></div>
                  <span class="health-text">{{ row.health }}%</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="220" align="right">
              <template #default="{ row }">
                <div class="batch-ops">
                  <el-button link type="primary" @click="openQcReport(selectedItem, row)" class="font-bold op-btn">
                    质检报告
                  </el-button>
                  <el-button
                    v-if="row.recycleOrderId"
                    link
                    type="warning"
                    @click="openTrace(row.recycleOrderId)"
                    class="font-bold op-btn"
                  >
                    全链溯源
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div class="batch-pagination">
            <el-pagination
              v-model:current-page="batchCurrentPage"
              v-model:page-size="batchPageSize"
              :total="filteredBatches.length"
              layout="prev, pager, next"
              background
              small
            />
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgDetail = false">关闭明细列表</el-button>
          <el-button type="primary" class="!rounded-xl px-8 font-black" @click="exportDetail">导出单体资产明细</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 手动资产入库 (非回收/拆解) ==================== -->
    <el-dialog
      v-model="dlgManualIn"
      title="手动资产入库 (非回收/拆解)"
      width="460px"
      class="pro-dialog"
    >
      <div v-if="selectedItem">
        <el-form :model="manualInForm" label-width="90px" label-position="left">
          <el-form-item label="入库仓库">
            <el-select v-model="manualInForm.warehouse" class="w-full">
              <el-option
                v-for="wh in warehouseOptions"
                :key="wh"
                :label="wh"
                :value="wh"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="入库数量">
            <el-input-number v-model="manualInForm.amount" :min="1" class="!w-full" />
          </el-form-item>
          <el-form-item label="健康度 SOH">
            <el-slider v-model="manualInForm.health" :min="0" :max="100" />
          </el-form-item>
          <el-form-item label="入库备注">
            <el-input
              v-model="manualInForm.remark"
              type="textarea"
              placeholder="填写采购批次或入库原因"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgManualIn = false">取消</el-button>
          <el-button type="primary" @click="submitManualIn" :loading="submitting">确认入库</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ==================== Dialog: 全链路资产溯源看板 ==================== -->
    <el-dialog
      v-model="dlgTrace"
      title="全链路资产溯源看板"
      width="720px"
      class="pro-dialog enterprise-dark"
    >
      <div v-if="traceData" class="trace-content">
        <div class="trace-card">
          <div class="trace-card-header">
            <div>
              <p class="text-[10px] text-[#34d399] font-black uppercase tracking-[0.2em] mb-2">Original Sourcing Document</p>
              <h3>回收单 #{{ traceData.id }}</h3>
              <div class="trace-meta-row">
                <div class="trace-meta-item">
                  <p class="text-[9px] text-gray-500 uppercase font-bold">回收日期</p>
                  <p>{{ traceData.date }}</p>
                </div>
                <div class="trace-meta-item">
                  <p class="text-[9px] text-gray-500 uppercase font-bold">供应商</p>
                  <p>{{ traceData.supplier }}</p>
                </div>
              </div>
            </div>
            <div class="trace-amount-section">
              <el-tag :type="traceData.paid ? 'success' : 'warning'" effect="dark" class="font-black">
                {{ traceData.paid ? '已结算' : '待结算' }}
              </el-tag>
              <p class="trace-amount">¥ {{ traceData.amount }}</p>
            </div>
          </div>
        </div>

        <div class="trace-items-table">
          <el-table :data="traceData.items" border class="dense-table rounded-xl overflow-hidden">
            <el-table-column prop="name" label="回收项名称" min-width="180" />
            <el-table-column prop="qty" label="数量" width="80" align="center" />
            <el-table-column prop="price" label="回收估价" width="120" align="right" />
          </el-table>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dlgTrace = false">关闭溯源视图</el-button>
        </div>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { rowsApi, txApi } from '@/api/rows'
import { exportCsv, toNum, nowStamp } from '@/utils/export'
import { useAuthStore } from '@/store/auth'
const authStore = useAuthStore()
const todayStr = new Date().toISOString().split('T')[0]

// ==================== Reactive State: UI Toggles ====================
const activeTab = ref('inventory')
const invSearch = ref('')
const invWarehouse = ref('')
const syncing = ref(false)
const woSearch = ref('')
const woTypeFilter = ref('')
const woDateRange = ref(null)
const dlgManualAdjust = ref(false)
const dlgTransfer = ref(false)
const dlgFlowLog = ref(false)
const dlgQcReport = ref(false)
const dlgQcEntry = ref(false)
const dlgLoss = ref(false)
const dlgReimburse = ref(false)
const dlgTrace = ref(false)
const dlgDetail = ref(false)
const dlgManualIn = ref(false)
const batchSearch = ref('')
const batchCurrentPage = ref(1)
const batchPageSize = ref(10)
const selectedItem = ref(null)
const traceData = ref(null)
const selectedBatch = ref(null)
const submitting = ref(false)
const loading = ref(false)

// ==================== Reactive State: Forms ====================
const manualInForm = reactive({ warehouse: '1号主仓 (上海)', amount: 1, health: 100, remark: '' })
const adjustForm = reactive({ batchNo: '', delta: 0, reason: '盘点' })
const transferForm = reactive({ toWarehouse: '', amount: 1, remark: '' })
const lossForm = reactive({ batchNo: '', amount: 1, reason: '破损', remark: '' })
const reimburseForm = reactive({ batchNo: '', amount: 1, reason: '研发领用', remark: '' })
const qcEntryForm = reactive({ batchNo: '', values: {}, remark: '' })

// ==================== QC Templates ====================
const qcTemplates = {
  '动力电池': {
    template: [
      { label: '当前电压', unit: 'V', type: 'number', min: 3.2, max: 4.2 },
      { label: '内阻系数', unit: 'mΩ', type: 'number', min: 10, max: 20 },
      { label: '电芯温差', unit: '℃', type: 'number', min: 0, max: 5 },
      {
        label: 'SOH健康度',
        unit: '%',
        type: 'number',
        grades: [
          { min: 95, max: 100, label: '优', level: 'success' },
          { min: 85, max: 95, label: '良', level: 'primary' },
          { min: 70, max: 85, label: '中', level: 'warning' },
          { min: 0, max: 70, label: '差', level: 'danger' }
        ]
      }
    ]
  },
  '充电配件': {
    template: [
      { label: '绝缘阻抗', unit: 'MΩ', type: 'number', min: 500, max: 9999 },
      { label: '通断性能', unit: '', type: 'boolean', expected: true },
      { label: '外观质量', unit: '', type: 'select', options: 'A级,B级,C级' }
    ]
  }
}

// ==================== Computed: QC ====================
const currentQcTemplate = computed(() => {
  return selectedItem.value && qcTemplates[selectedItem.value.category] || null
})

const gradeQcMetric = (metric, value) => {
  if (value == null) return { label: '待测', level: 'info' }
  if (metric.grades && metric.grades.length) {
    const matched = metric.grades.find(g => value >= g.min && value <= g.max)
    return matched || { label: '不合格', level: 'danger' }
  }
  if (metric.min !== undefined && metric.max !== undefined) {
    return value >= metric.min && value <= metric.max
      ? { label: '合格', level: 'success' }
      : { label: '不合格', level: 'danger' }
  }
  return { label: '已录入', level: 'success' }
}

const isQcPass = (batch) => {
  if (!currentQcTemplate.value) return 'pass'
  let allHasValue = true
  let allOk = true
  for (const metric of currentQcTemplate.value.template) {
    const val = batch[metric.label]
    if (val == null) {
      allHasValue = false
      continue
    }
    if (gradeQcMetric(metric, val).level === 'danger') {
      allOk = false
    }
  }
  if (!allHasValue) return 'pending'
  return allOk ? 'pass' : 'fail'
}

// ==================== Inventory Data ====================
// 初始为空，onMounted 从后端真实 stockItems 加载并做字段映射
const inventoryItems = ref([])
// 顶部汇总条数据
const stockSummary = ref({ totalValue: 0, totalSku: 0, riskCount: 0, turnoverRate: 0 })

// 将后端 stockItems 字段映射为页面展示所需结构
function mapStockItem(raw) {
  return {
    id: raw.id,
    sku: raw.sku,
    name: raw.name,
    brand: raw.brand || '',
    category: raw.category,
    amount: raw.qty ?? 0,
    locked: raw.locked || 0,
    minStock: raw.min_stock || raw.minStock || 5,
    unit: raw.unit,
    warehouse: raw.warehouse,
    avgPrice: (raw.cost_price ?? raw.costPrice) != null ? Number(raw.cost_price ?? raw.costPrice).toLocaleString() : '0',
    totalValue: (raw.value != null) ? Number(raw.value).toLocaleString() : '0',
    batches: raw.batches || []
  }
}

// D4：从后端真实批次表加载，关联到每个库存项（批次下拉不再恒空）
async function loadBatches() {
  try {
    const res = await rowsApi.list('stock_batches', { size: 1000 })
    const batches = res?.data?.list || []
    const batchMap = {}
    for (const b of batches) {
      if (!batchMap[b.stock_item_id]) batchMap[b.stock_item_id] = []
      // 解析动态质检指标 JSON，把指标值平铺到批次对象上供报告页读取
      let qcValues = {}
      try {
        qcValues = b.qc_values ? JSON.parse(b.qc_values) : {}
      } catch { qcValues = {} }
      batchMap[b.stock_item_id].push({
        id: b.id,
        batchNo: b.batch_no || b.id,
        mfd: b.mfd || '',
        amount: b.amount ?? 0,
        health: b.health ?? 100,
        remark: b.remark || '',
        recycleOrderId: b.recycle_order_id || '',
        purchaseOrderId: b.purchase_order_id || '',
        ...qcValues,
      })
    }
    return batchMap
  } catch {
    return {}
  }
}

async function loadData() {
  loading.value = true
  try {
    await loadWarehouses()
    const [res, batchMap] = await Promise.all([
      rowsApi.list('stock_items', { size: 200 }),
      loadBatches(),
    ])
    const list = res?.data?.list || []
    inventoryItems.value = list.map(raw => mapStockItem({ ...raw, batches: batchMap[raw.id] || [] }))
    const totalValue = list.reduce((s, i) => s + (Number(i.value) || (Number(i.cost_price) || 0) * (Number(i.qty) || 0)), 0)
    stockSummary.value = {
      totalValue,
      totalSku: list.length,
      riskCount: list.filter(i => (Number(i.qty) || 0) <= (Number(i.min_stock) || 5)).length,
      turnoverRate: stockSummary.value.turnoverRate,
    }
  } catch (e) {
    ElMessage.error('库存数据加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadData()
  await Promise.all([loadWriteoffs(), loadInboundOrders(), loadSalesOrders(), loadLastAudit()])
  calcTurnover()
})

// 月度周转率 = 已发货销售单商品总量 / 当前库存总量 × 100（无数据为 0）
function calcTurnover() {
  const totalQty = inventoryItems.value.reduce((s, i) => s + (i.amount || 0), 0)
  const shippedStatuses = ['shipping', 'shipped', 'delivered', 'completed', '已发货', '已签收', '已完成']
  const sold = salesOrders.value
    .filter(so => shippedStatuses.includes(so.status))
    .reduce((s, so) => s + (so.qty || 0), 0)
  stockSummary.value.turnoverRate = totalQty > 0 ? Math.round((sold / totalQty) * 100) : 0
}

// ==================== Flow Logs（真实 stock_writeoffs + purchase_orders）====================
const inboundOrders = ref([])
const salesOrders = ref([])
const warehouseOptions = ref([])

async function loadWarehouses() {
  try {
    const [wRes, listRes] = await Promise.all([
      rowsApi.list('warehouses', { size: 200 }),
      rowsApi.list('stock_items', { size: 1000 }),
    ])
    const dict = new Set((wRes?.data?.list || []).map(w => w.name).filter(Boolean))
    // 合并库存中实际出现的仓库（有些老数据可能不在字典里）
    for (const i of (listRes?.data?.list || [])) {
      if (i.warehouse) dict.add(i.warehouse)
    }
    warehouseOptions.value = Array.from(dict)
  } catch { /* 保持空 */ }
}

async function loadInboundOrders() {
  try {
    const res = await rowsApi.list('purchase_orders', { size: 200 })
    inboundOrders.value = (res?.data?.list || [])
      .filter(p => ['completed', 'arrived', '已入库', '已到货'].includes(p.status) || (p.step || 0) >= 6)
      .map(p => ({ poNo: p.po_no || '#PO' + p.id, qty: p.qty || p.amount || 0, time: p.delivery_date || '' }))
  } catch { /* 保持空 */ }
}

async function loadSalesOrders() {
  try {
    const res = await rowsApi.list('sales_orders', { size: 200, sort: 'time', order: 'desc' })
    salesOrders.value = (res?.data?.list || []).map(so => {
      let items = []
      try { items = JSON.parse(so.items_json || '[]') } catch { }
      const qty = items.reduce((s, it) => s + (it.amount || 0), 0)
      return {
        id: so.id,
        time: so.time || '',
        status: so.status,
        productSummary: so.product_summary || '',
        qty,
        items,
      }
    })
  } catch { /* 保持空 */ }
}

const flowLogs = computed(() => {
  const logs = []
  for (const w of writeoffOrders.value) {
    const productName = w.productName || itemNameOf(w.stockItemId)
    if (w.isAudit) {
      // 盘点调整：盘盈走入库方向（+），盘亏走出库方向（-）
      logs.push({
        time: w.time || '',
        action: w.isGain ? '盘点盘盈入库' : '盘点盘亏出库',
        amount: w.amount || 0,
        type: w.isGain ? 'success' : 'warning',
        remark: `${w.reason}${w.planNo ? '' : ''}`,
        operator: w.operator,
        productName,
        stockItemId: w.stockItemId,
        sort: w.time || '',
      })
      continue
    }
    logs.push({
      time: w.time || '',
      action: w.type === 'reimburse' ? '核销出库' : '报损出库',
      amount: w.amount || 0,
      type: 'warning',
      remark: `${w.reason}（批次 ${w.batchNo}）`,
      operator: w.operator,
      productName,
      stockItemId: w.stockItemId,
      sort: w.time || '',
    })
  }
  for (const p of inboundOrders.value) {
    logs.push({
      time: p.time || '',
      action: '采购入库',
      amount: p.qty,
      type: 'success',
      remark: `采购单: ${p.poNo}`,
      operator: 'admin',
      productName: '',
      sort: p.time || '',
    })
  }
  return logs.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 50)
})

const currentFlowLogs = computed(() => {
  if (!selectedItem.value) return flowLogs.value
  return flowLogs.value.filter(log => log.stockItemId === selectedItem.value.id)
})

const currentFlowStats = computed(() => {
  let inbound = 0, outbound = 0
  for (const log of currentFlowLogs.value) {
    if (log.type === 'success') inbound += log.amount
    else outbound += log.amount
  }
  return { inbound, outbound }
})

// ==================== Writeoff Orders ====================
// D4：报损/报销记录从真实 stock_writeoffs 表读取
const writeoffOrders = ref([])

const itemNameOf = (id) => inventoryItems.value.find(i => i.id === id)?.name || '库存项#' + id

async function loadWriteoffs() {
  try {
    const res = await rowsApi.list('stock_writeoffs', { size: 200, sort: 'id', order: 'desc' })
    writeoffOrders.value = (res?.data?.list || []).map(w => {
      const reason = w.reason || ''
      const isAudit = /盘点/.test(reason)
      return {
        id: 'WO-' + String(w.id).padStart(4, '0'),
        type: isAudit ? 'audit' : (/报销|领用|出库/.test(reason) ? 'reimburse' : 'loss'),
        isAudit,
        isGain: /盘盈/.test(reason),
        stockItemId: w.stock_item_id,
        productName: itemNameOf(w.stock_item_id),
        batchNo: w.batch_id || '--',
        amount: w.qty,
        reason,
        operator: w.operator || 'system',
        time: w.created_at || '',
      }
    })
  } catch { /* 保持空 */ }
}

// ==================== 最近盘点（关联 InventoryAudit 的 audit_results）====================
const lastAuditMap = ref({})

async function loadLastAudit() {
  try {
    const [rr, pp] = await Promise.all([
      rowsApi.list('audit_results', { size: 500, sort: 'id', order: 'desc' }),
      rowsApi.list('audit_plans', { size: 200 }),
    ])
    const planNoMap = {}
    for (const p of (pp?.data?.list || [])) planNoMap[p.id] = p.plan_no || ('#' + p.id)
    const map = {}
    for (const r of (rr?.data?.list || [])) {
      const k = r.stock_item_id
      // 已按 id 倒序，首条即最新盘点结果
      if (!map[k]) map[k] = { time: r.created_at || '', diff: r.diff || 0, planNo: planNoMap[r.plan_id] || ('#' + r.plan_id) }
    }
    lastAuditMap.value = map
  } catch { /* 保持空 */ }
}

// ==================== Computed: Filtering & Pagination ====================
const filteredInventory = computed(() =>
  inventoryItems.value.filter(item => {
    const kw = invSearch.value.trim().toLowerCase()
    const matchSearch = !kw ||
      item.name.toLowerCase().includes(kw) ||
      item.sku.toLowerCase().includes(kw) ||
      item.warehouse.toLowerCase().includes(kw) ||
      (item.batches || []).some(b => (b.batchNo || b.id || '').toLowerCase().includes(kw))
    const matchWarehouse = !invWarehouse.value || item.warehouse === invWarehouse.value
    return matchSearch && matchWarehouse
  })
)

// 分页：对筛选后的库存全集切片，搜索/仓库筛选仍作用于全部数据
const invPage = ref(1)
const invPageSize = ref(10)
const pagedInventory = computed(() => {
  const start = (invPage.value - 1) * invPageSize.value
  return filteredInventory.value.slice(start, start + invPageSize.value)
})

// 任一筛选变化时回到第 1 页
watch([invSearch, invWarehouse, () => inventoryItems.value.length], () => {
  invPage.value = 1
})

const transferTargetWarehouses = computed(() =>
  warehouseOptions.value.filter(wh => wh !== selectedItem.value?.warehouse)
)

const filteredWriteoffs = computed(() =>
  writeoffOrders.value.filter(wo => {
    const matchSearch = wo.productName.includes(woSearch.value) || wo.id.includes(woSearch.value) || wo.reason.includes(woSearch.value)
    const matchType = !woTypeFilter.value || wo.type === woTypeFilter.value
    let matchDate = true
    if (woDateRange.value && woDateRange.value.length === 2) {
      const [start, end] = woDateRange.value
      const d = (wo.time || '').slice(0, 10)
      matchDate = d >= start && d <= end
    }
    return matchSearch && matchType && matchDate
  })
)

const allBatches = computed(() => selectedItem.value ? selectedItem.value.batches || [] : [])

const filteredBatches = computed(() =>
  allBatches.value.filter(b =>
    !batchSearch.value || (b.id || b.batchNo).toLowerCase().includes(batchSearch.value.toLowerCase())
  )
)

const paginatedBatches = computed(() => {
  const start = (batchCurrentPage.value - 1) * batchPageSize.value
  return filteredBatches.value.slice(start, start + batchPageSize.value)
})

// ==================== Actions: Sync & Export ====================
const syncInventory = async () => {
  syncing.value = true
  try {
    await loadData()
    await Promise.all([loadWriteoffs(), loadInboundOrders(), loadSalesOrders(), loadLastAudit()])
    calcTurnover()
    ElMessage.success('库存数据已同步')
  } catch {
    ElMessage.error('同步失败')
  } finally {
    syncing.value = false
  }
}

// ==================== Actions: 跳转库存盘点 ====================
// 入口一：单行「发起盘点」——带上该行的仓库与物料，跳到盘点页预填
const openAudit = (row) => {
  const params = new URLSearchParams({ from: 'stockquery' })
  if (row.warehouse) params.set('wh', row.warehouse)
  params.set('focus', row.sku + ' · ' + row.name)
  window.location.hash = '#/inventory/audit?' + params.toString()
}

// 入口二：顶部「按筛选发起盘点」——带上当前筛选条件与命中数
const auditByFilter = () => {
  const n = filteredInventory.value.length
  if (!n) {
    ElMessage.warning('当前筛选条件下没有可盘点物料')
    return
  }
  const params = new URLSearchParams({ from: 'stockquery' })
  if (invWarehouse.value) params.set('wh', invWarehouse.value)
  if (invSearch.value) params.set('keyword', invSearch.value)
  params.set('count', n)
  window.location.hash = '#/inventory/audit?' + params.toString()
}

// 导出当前筛选后的实时库存
const exportInventory = () => {
  const list = filteredInventory.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的库存数据')
    return
  }
  exportCsv(`库存明细_${nowStamp()}.csv`,
    ['SKU', '产品名称', '分类', '实时在库', '单位', '待出库锁定', '最低库存', '所属仓库', '成本单价(元)', '资产价值(元)'],
    list.map(i => [
      i.sku, i.name, i.category, i.amount, i.unit, i.locked, i.minStock,
      i.warehouse, toNum(i.avgPrice), toNum(i.totalValue),
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条库存记录`)
}

// 导出当前筛选后的核销订单
const exportWriteoffs = () => {
  const list = filteredWriteoffs.value
  if (!list.length) {
    ElMessage.warning('当前没有可导出的核销记录')
    return
  }
  exportCsv(`核销订单_${nowStamp()}.csv`,
    ['核销单号', '核销类型', '产品', '批次', '数量', '原因/用途', '操作人', '时间'],
    list.map(w => [
      w.id, w.type === 'loss' ? '报损销账' : '报销销账', w.productName, w.batchNo,
      w.amount, w.reason, w.operator, w.time,
    ])
  )
  ElMessage.success(`已导出 ${list.length} 条核销记录`)
}

// 导出当前产品的全部批次/单体资产明细
const exportDetail = () => {
  const item = selectedItem.value
  const list = filteredBatches.value
  if (!item || !list.length) {
    ElMessage.warning('当前没有可导出的批次明细')
    return
  }
  exportCsv(`库存批次明细_${item.name}_${nowStamp()}.csv`,
    ['唯一识别码/批次', '入库日期', '来源回收单', '当前结存', '健康度SOH(%)'],
    list.map(b => [b.id || b.batchNo, b.mfd, b.recycleOrderId || '手动录入/采购', `${b.amount} ${item.unit}`, b.health])
  )
  ElMessage.success(`已导出 ${list.length} 条批次明细`)
}

// ==================== Actions: Writeoff Detail ====================
const showWriteoffDetail = (row) => {
  ElMessageBox.alert(
    `<div style="line-height:1.8">
      <p><b>核销单号：</b>${row.id}</p>
      <p><b>核销类型：</b>${row.type === 'loss' ? '报损销账' : row.type === 'reimburse' ? '报销销账' : '盘点调整'}</p>
      <p><b>资产名称：</b>${row.productName}</p>
      <p><b>批次号：</b>${row.batchNo}</p>
      <p><b>数量：</b>${row.amount}</p>
      <p><b>原因/用途：</b>${row.reason}</p>
      <p><b>操作人：</b>${row.operator}</p>
      <p><b>时间：</b>${row.time}</p>
    </div>`,
    '核销凭证',
    { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
  )
}

// ==================== Actions: Writeoff Dropdown ====================
const handleWriteoffCommand = (type) => {
  if (inventoryItems.value.length === 0) return
  const item = inventoryItems.value[0]
  if (type === 'reimburse') {
    openReimburse(item)
  } else if (type === 'loss') {
    openLoss(item)
  }
}

// ==================== Actions: Trace ====================
const openTrace = (orderId) => {
  traceData.value = {
    id: orderId,
    date: '2024-04-23',
    supplier: orderId === 'RC24042601' ? '顺风物流园 (张经理)' : '上海宏达汽车回收有限公司',
    amount: orderId === 'RC24042601' ? '21,000.00' : '52,400.00',
    paid: orderId !== 'RC24042601',
    warehouse: '1号主仓 (上海)',
    items: [
      { name: '待拆解动力电池组', qty: 1, price: '21,000.00' },
      { name: '宁德模组 (备选)', qty: 4, price: '1,200.00' }
    ]
  }
  dlgTrace.value = true
}

// ==================== Actions: Manual Adjust ====================
const openManualAdjust = (item) => {
  selectedItem.value = item
  adjustForm.batchNo = item.batches?.[0]?.batchNo || ''
  adjustForm.delta = 0
  dlgManualAdjust.value = true
}

const submitManualAdjust = () => {
  submitting.value = true
  const item = selectedItem.value
  const delta = Number(adjustForm.delta) || 0
  const newQty = item.amount + delta
  if (newQty < 0) {
    ElMessage.error('修正后库存不能为负数')
    submitting.value = false
    return
  }
  if (delta < 0 && !item.batches?.length) {
    ElMessage.error('该物料没有批次记录，无法直接扣减')
    submitting.value = false
    return
  }

  const batch = item.batches?.[0]
  const updates = []
  updates.push(rowsApi.update('stock_items', item.id, { qty: newQty }))

  if (delta > 0) {
    // 盘盈：新增一个手动批次
    const newBatchId = 'ADJ-' + Date.now()
    const newBatch = {
      id: newBatchId,
      stock_item_id: item.id,
      batch_no: newBatchId,
      amount: delta,
      mfd: new Date().toISOString().split('T')[0],
      health: 100,
    }
    updates.push(rowsApi.create('stock_batches', newBatch))
  } else if (delta < 0 && batch) {
    // 盘亏：从首个批次扣减
    const newBatchAmt = Math.max(0, batch.amount + delta)
    updates.push(rowsApi.update('stock_batches', batch.id, { amount: newBatchAmt }))
  }

  Promise.all(updates)
    .then(async () => {
      await loadData()
      ElMessage.success('库存修正已生效')
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
    .finally(() => { submitting.value = false; dlgManualAdjust.value = false })
}

// ==================== Actions: Transfer ====================
const openTransfer = (item) => {
  selectedItem.value = item
  transferForm.toWarehouse = ''
  transferForm.amount = 1
  dlgTransfer.value = true
}

const submitTransfer = () => {
  if (!transferForm.toWarehouse) {
    ElMessage.error('请选择调入仓库')
    return
  }
  if (!selectedItem.value?.id) {
    ElMessage.error('库存项缺失')
    return
  }
  submitting.value = true
  txApi.stockTransfer({
    stockItemId: selectedItem.value.id,
    fromWarehouse: selectedItem.value.warehouse,
    toWarehouse: transferForm.toWarehouse,
    qty: Number(transferForm.amount) || 1,
    remark: transferForm.remark || '',
  })
    .then(async () => {
      await loadData()
      await loadWriteoffs()
      ElMessage.success(`已发起从 ${selectedItem.value.warehouse} 到 ${transferForm.toWarehouse} 的调拨任务`)
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '调拨失败'))
    .finally(() => { submitting.value = false; dlgTransfer.value = false })
}

// ==================== Actions: Flow Log ====================
const openFlowLogGlobal = () => {
  selectedItem.value = null
  dlgFlowLog.value = true
}

// ==================== Actions: Detail ====================
const openDetail = (item) => {
  selectedItem.value = item
  batchCurrentPage.value = 1
  dlgDetail.value = true
}

// ==================== Actions: Manual In ====================
const openManualIn = () => {
  Object.assign(manualInForm, {
    warehouse: selectedItem.value?.warehouse || warehouseOptions.value[0] || '',
    amount: 1,
    health: 100,
    remark: ''
  })
  dlgManualIn.value = true
}

const submitManualIn = () => {
  submitting.value = true
  const item = selectedItem.value
  const newQty = item.amount + manualInForm.amount
  const newBatch = {
    id: `MANUAL-${Date.now()}`,
    stock_item_id: item.id,
    batch_no: 'MANUAL-BATCH',
    mfd: new Date().toISOString().split('T')[0],
    amount: manualInForm.amount,
    health: manualInForm.health,
  }
  // 1) 更新库存数量与仓库 2) 写批次持久化（D4：批次真正落库）
  rowsApi.update('stock_items', item.id, { qty: newQty, warehouse: manualInForm.warehouse || item.warehouse })
    .then(() => rowsApi.create('stock_batches', newBatch))
    .then(async () => {
      await loadData()
      ElMessage.success('手动入库成功，批次已入库')
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
    .finally(() => { submitting.value = false; dlgManualIn.value = false })
}

// ==================== Actions: QC Report ====================
const openQcReport = (item, batch) => {
  selectedItem.value = item
  selectedBatch.value = batch
  dlgQcReport.value = true
}

// ==================== Actions: QC Entry ====================
const openQcEntry = (batch) => {
  qcEntryForm.batchNo = batch.batchNo
  qcEntryForm.remark = batch.remark || ''
  qcEntryForm.values = {}
  if (currentQcTemplate.value) {
    currentQcTemplate.value.template.forEach(metric => {
      qcEntryForm.values[metric.label] = batch[metric.label] !== undefined
        ? batch[metric.label]
        : metric.type === 'number' ? (metric.min || 0) : metric.type === 'boolean' ? true : ''
    })
  }
  dlgQcEntry.value = true
}

const submitQcEntry = () => {
  if (!selectedBatch.value?.id) {
    ElMessage.error('缺少批次记录，无法提交质检')
    return
  }
  submitting.value = true
  const healthVal = qcEntryForm.values['SOH健康度']
  txApi.qcRecord({
    batchId: selectedBatch.value.id,
    health: healthVal !== undefined && healthVal !== '' ? Number(healthVal) : undefined,
    remark: qcEntryForm.remark || '',
    values: qcEntryForm.values,
  })
    .then(async () => {
      await loadData()
      // 刷新报告弹窗中的批次对象，避免提交后仍展示旧数据
      const batchId = selectedBatch.value?.id
      if (batchId) {
        const refreshedItem = inventoryItems.value.find(it => it.id === selectedItem.value?.id)
        const refreshedBatch = refreshedItem?.batches.find(b => b.id === batchId)
        if (refreshedItem) selectedItem.value = refreshedItem
        if (refreshedBatch) selectedBatch.value = refreshedBatch
      }
      ElMessage.success(`[${selectedItem.value?.category}] 自动质检判定已完成`)
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '质检提交失败'))
    .finally(() => { submitting.value = false; dlgQcEntry.value = false })
}

// ==================== Actions: Loss (报损销账) ====================
const openLoss = (item) => {
  selectedItem.value = item
  lossForm.batchNo = item.batches[0]?.batchNo || ''
  lossForm.amount = 1
  lossForm.reason = '破损'
  dlgLoss.value = true
}

const lossMax = computed(() => {
  const batch = selectedItem.value?.batches.find(b => b.batchNo === lossForm.batchNo)
  return batch ? Number(batch.amount) : 0
})

const submitLoss = () => {
  if (!lossForm.batchNo) {
    ElMessage.error('请选择核销批次')
    return
  }
  const batch = selectedItem.value.batches.find(b => b.batchNo === lossForm.batchNo)
  if (!batch) {
    ElMessage.error('所选批次不存在')
    return
  }
  submitting.value = true
  txApi.stockWriteoff({
    stockItemId: selectedItem.value.id,
    batchId: batch.id,
    qty: lossForm.amount,
    reason: '报损 ' + lossForm.reason,
  })
    .then(async () => {
      await loadData()
      await loadWriteoffs()
      ElMessage.success(`已完成报损：${selectedItem.value.name} (${lossForm.batchNo}) 销毁 ${lossForm.amount} 单位`)
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
    .finally(() => { submitting.value = false; dlgLoss.value = false })
}

// ==================== Actions: Reimburse (报销销账) ====================
const openReimburse = (item) => {
  selectedItem.value = item
  reimburseForm.batchNo = item.batches[0]?.batchNo || ''
  reimburseForm.amount = 1
  reimburseForm.reason = '研发领用'
  dlgReimburse.value = true
}

const reimburseMax = computed(() => {
  const batch = selectedItem.value?.batches.find(b => b.batchNo === reimburseForm.batchNo)
  return batch ? Number(batch.amount) : 0
})

const submitReimburse = () => {
  if (!reimburseForm.batchNo) {
    ElMessage.error('请选择核销批次')
    return
  }
  const batch = selectedItem.value.batches.find(b => b.batchNo === reimburseForm.batchNo)
  if (!batch) {
    ElMessage.error('所选批次不存在')
    return
  }
  submitting.value = true
  txApi.stockWriteoff({
    stockItemId: selectedItem.value.id,
    batchId: batch.id,
    qty: reimburseForm.amount,
    reason: '报销 ' + reimburseForm.reason,
  })
    .then(async () => {
      await loadData()
      await loadWriteoffs()
      ElMessage.success(`已完成报销销账：${selectedItem.value.name} 出库 ${reimburseForm.amount} 单位`)
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
    .finally(() => { submitting.value = false; dlgReimburse.value = false })
}
</script>

<style scoped>
/* ==================== Summary Ribbon ==================== */
.stock-ribbon {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.ribbon-item {
  background: #fff;
  border-radius: 24px;
  padding: 20px 24px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  box-shadow: 0 1px 2px 0 rgba(0,0,0,.04);
  border: 1px solid #f3f4f6;
  transition: box-shadow 0.15s;
}

.ribbon-item:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,.06);
}

.ribbon-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ribbon-data {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.ribbon-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}

.ribbon-value {
  font-size: 22px;
  font-weight: 900;
  color: #111827;
  line-height: 1.2;
}

.ribbon-trend {
  font-size: 11px;
  font-weight: 600;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 2px;
}

.ribbon-sub {
  font-size: 11px;
  color: #9ca3af;
}

.mini-progress {
  height: 4px;
  background: #f3f4f6;
  border-radius: 2px;
  margin-top: 4px;
  overflow: hidden;
}

.mini-progress .bar {
  height: 100%;
  background: #8b5cf6;
  border-radius: 2px;
  transition: width 0.6s ease;
}

/* ==================== Card & Tabs ==================== */
.table-card {
  border-radius: 32px !important;
}

.stock-tabs :deep(.el-tabs__header) {
  padding: 0 24px;
  margin: 0;
}

.stock-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

/* ==================== Tab Toolbar ==================== */
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-search {
  width: 280px;
}

.warehouse-select {
  width: 180px;
}

/* ==================== Dense Table ==================== */
.dense-table {
  --el-table-border-color: transparent;
}

.dense-table :deep(.el-table__cell) {
  padding: 10px 0 !important;
}

.dense-table :deep(.el-table th.el-table__cell) {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af !important;
  background: #fafafa !important;
}

.dense-table :deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid #f5f5f5;
  font-size: 13px;
}

/* ==================== Product Icon Box ==================== */
.product-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #9ca3af, #6b7280);
}

.product-icon-box.动力电池 {
  background: linear-gradient(135deg, #f59e0b, #f97316);
}

.product-icon-box.充电配件 {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}

.product-icon-box.待分类 {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
}

/* ==================== Product Info Cell ==================== */
.product-info-cell .product-name {
  font-weight: 700;
  color: #111827;
  font-size: 13px;
  margin-bottom: 4px;
}

.product-info-cell .product-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #9ca3af;
}

/* ==================== Stock Cell ==================== */
.stock-cell {
  text-align: center;
}

.stock-quantity {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}

.stock-quantity .val {
  font-size: 20px;
  font-weight: 900;
  color: #111827;
}

.stock-quantity .val.warning {
  color: #f59e0b;
}

.stock-quantity .unit {
  font-size: 12px;
  color: #9ca3af;
}

.lock-info {
  font-size: 11px;
  color: #f59e0b;
  margin-top: 2px;
}

/* ==================== Warehouse Cell ==================== */
.warehouse-cell p:first-child {
  font-weight: 600;
  color: #374151;
  font-size: 13px;
}

/* ==================== Audit Cell (最近盘点) ==================== */
.audit-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.audit-cell .audit-time {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

/* ==================== Value Cell ==================== */
.value-cell .total-value {
  font-size: 16px;
  font-weight: 900;
  color: #10b981;
}

.value-cell .unit-price {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

/* ==================== Action Cell ==================== */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

/* ==================== Batch ID text ==================== */
.batch-id-text {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

/* ==================== Deduct Num ==================== */
.deduct-num {
  font-size: 16px;
  font-weight: 900;
  color: #ef4444;
}

/* ==================== Op Time ==================== */
.op-time {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

/* ==================== Dialog Common ==================== */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.custom-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 16px;
  margin-bottom: 0;
}

.pro-dialog :deep(.el-dialog__body) {
  padding: 20px 24px;
}

.pro-dialog :deep(.el-dialog__header) {
  padding: 20px 24px 16px;
}

/* ==================== Adjust Info ==================== */
.adjust-info {
  margin-bottom: 16px;
}

.adjust-name {
  font-weight: 700;
  color: #111827;
  font-size: 14px;
  margin-top: 2px;
}

/* ==================== QC Report ==================== */
.qc-report-content {
  padding: 8px;
}

.qc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.qc-header-left {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.qc-header-left h4 {
  font-size: 16px;
  font-weight: 900;
  color: #111827;
}

.qc-batch-info {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.qc-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.metric-card-dynamic {
  background: #f9fafb;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid #f3f4f6;
}

.metric-card-dynamic.metric-missing {
  background: #fffbeb;
  border-color: #fde68a;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.metric-header span {
  font-weight: 700;
  color: #374151;
  font-size: 13px;
}

.metric-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 6px;
}

.metric-val {
  font-size: 20px;
  font-weight: 900;
  color: #111827;
}

.metric-unit {
  font-size: 11px;
  color: #9ca3af;
}

.metric-standard {
  font-size: 11px;
  color: #9ca3af;
}

.qc-footer {
  border-top: 1px solid #f3f4f6;
  padding-top: 12px;
}

.qc-remark {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}

/* ==================== QC Entry ==================== */
.qc-entry-content {
  padding: 8px;
}

.qc-entry-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dynamic-field-row {
  transition: box-shadow 0.15s;
}

.dynamic-field-row:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
}

.field-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.field-label-row span {
  font-weight: 700;
  font-size: 13px;
  color: #374151;
}

.field-label-row small {
  font-size: 11px;
  color: #9ca3af;
}

/* ==================== Loss Warning ==================== */
.loss-warning-banner {
  display: flex;
  gap: 10px;
  background: #fef2f2;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid #fee2e2;
  margin-bottom: 20px;
  margin-top: 8px;
}

/* ==================== Reimburse Info ==================== */
.reimburse-info-banner {
  display: flex;
  gap: 10px;
  background: #eff6ff;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid #dbeafe;
  margin-bottom: 20px;
  margin-top: 8px;
}

/* ==================== Flow Log Drawer ==================== */
.flow-log-content {
  padding: 4px 0;
}

.flow-header {
  margin-bottom: 8px;
}

.flow-product-name {
  font-size: 18px;
  font-weight: 900;
  color: #111827;
  margin-bottom: 16px;
}

.flow-stats {
  display: flex;
  gap: 24px;
}

.flow-stats .stat {
  text-align: center;
}

.flow-stats .stat span:first-child {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.flow-stats .stat .v {
  font-size: 22px;
  font-weight: 900;
}

.flow-stats .stat .v.in {
  color: #10b981;
}

.flow-stats .stat .v.out {
  color: #ef4444;
}

.flow-stats .stat.balance {
  background: #f9fafb;
  padding: 8px 20px;
  border-radius: 12px;
}

.flow-stats .stat .balance-val {
  font-size: 22px;
  font-weight: 900;
  color: #111827;
}

.timeline-item-content {
  padding-bottom: 4px;
}

.timeline-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timeline-action {
  font-weight: 700;
  font-size: 13px;
  color: #374151;
}

.timeline-row .num {
  font-weight: 900;
  font-size: 14px;
}

.timeline-row .num.in {
  color: #10b981;
}

.timeline-row .num.out {
  color: #ef4444;
}

.timeline-product {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-top: 2px;
}

.timeline-remark {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}

.timeline-operator {
  font-size: 11px;
  color: #d1d5db;
  margin-top: 4px;
}

/* ==================== Detail Dialog ==================== */
.detail-content {
  padding: 4px;
}

.detail-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.detail-top-bar h3 {
  font-size: 20px;
  font-weight: 900;
  color: #111827;
}

.detail-summary {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.locked-stat {
  background: #fefce8;
  border: 1px solid #fef08a;
  padding: 12px 20px;
  border-radius: 16px;
  text-align: center;
}

.locked-count {
  font-size: 24px;
  font-weight: 900;
  color: #f59e0b;
  display: block;
}

/* ==================== Batch Section ==================== */
.batch-section {
  margin-top: 8px;
}

.batch-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-id-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.batch-id {
  font-weight: 700;
  font-size: 13px;
  color: #111827;
}

.batch-date {
  font-size: 11px;
  color: #9ca3af;
}

/* ==================== Health Bar ==================== */
.health-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.health-bar .fill {
  height: 6px;
  border-radius: 3px;
  transition: width 0.5s ease;
  flex: 1;
}

.health-text {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  min-width: 36px;
}

/* ==================== Batch Ops ==================== */
.batch-ops {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}
.batch-ops :deep(.op-btn) {
  padding: 0 !important;
  white-space: nowrap;
}

/* ==================== Batch Pagination ==================== */
.batch-pagination {
  display: flex;
  justify-content: center;
  padding: 16px 0 4px;
}

/* ==================== Trace Dialog ==================== */
.trace-content {
  padding: 8px;
}

.trace-card {
  background: #111827;
  padding: 32px;
  border-radius: 32px;
  color: #fff;
  margin-bottom: 20px;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,.1);
}

.trace-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.trace-card-header h3 {
  font-size: 22px;
  font-weight: 900;
  color: #10b981;
  font-style: italic;
}

.trace-meta-row {
  display: flex;
  gap: 24px;
  margin-top: 16px;
}

.trace-meta-item p:last-child {
  font-size: 14px;
  color: #d1d5db;
  margin-top: 2px;
}

.trace-amount-section {
  text-align: right;
}

.trace-amount {
  font-size: 28px;
  font-weight: 900;
  color: #10b981;
  font-style: italic;
  margin-top: 8px;
}

.trace-items-table {
  margin-top: 12px;
}

/* ==================== Enterprise Dark Dialog ==================== */
.enterprise-dark :deep(.el-dialog) {
  background: #0f172a;
}

.enterprise-dark :deep(.el-dialog__header) {
  background: #0f172a;
}

.enterprise-dark :deep(.el-dialog__title) {
  color: #e2e8f0;
}

/* ==================== Mini Upload ==================== */
.mini-upload :deep(.el-upload--picture-card) {
  width: 80px;
  height: 80px;
  border-radius: 12px;
}

/* ==================== Responsive ==================== */
@media (max-width: 1200px) {
  .stock-ribbon {
    grid-template-columns: repeat(2, 1fr);
  }
  .qc-metrics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .stock-ribbon {
    grid-template-columns: 1fr;
  }
  .tab-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
  .toolbar-left {
    flex-wrap: wrap;
  }
  .toolbar-right {
    flex-wrap: wrap;
  }
  .compact-search {
    width: 100%;
  }
}

/* 分页容器：表格底部右侧 */
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 0 8px;
}
</style>
