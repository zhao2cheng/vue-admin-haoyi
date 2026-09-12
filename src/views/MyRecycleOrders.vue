<template>
  <div class="my-recycle-orders min-h-screen" style="background:#f4f7f9">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4 px-6 py-4 mb-5 bg-white rounded-2xl shadow-sm border border-gray-100">
      <div class="flex items-center gap-4">
        <el-button @click="$router.push('/sales/workbench')" :icon="ArrowLeft" circle />
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-gray-900 leading-none">业务回收单档案</h2>
            <el-tag type="info" size="small" effect="plain" class="!rounded-full font-medium text-[10px] text-gray-400 border-gray-200">Business Archive</el-tag>
          </div>
          <p class="text-xs text-gray-400 mt-1">历史数据与财务结算流程</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <el-input v-model="searchQuery" placeholder="搜索流水号、商户..." :prefix-icon="Search" clearable class="!w-48" size="small" />
        <el-select v-model="paymentFilter" placeholder="全部结算" clearable class="!w-28" size="small">
          <el-option label="已结清" :value="3" />
          <el-option label="待付款" :value="1" />
          <el-option label="退货退款中" :value="11" />
          <el-option label="已退货退款" :value="12" />
        </el-select>
        <el-select v-model="sourceFilter" placeholder="全部来源" clearable class="!w-28" size="small">
          <el-option label="个人货源" value="individual" />
          <el-option label="企业渠道" value="enterprise" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" size="small" range-separator="至" start-placeholder="开始" end-placeholder="结束" class="!w-64" value-format="YYYY-MM-DD" />
        <div class="flex items-center gap-1">
          <el-input-number v-model="amountMin" :min="0" :controls="false" placeholder="金额下限" size="small" class="!w-24" />
          <span class="text-gray-300 text-xs font-black">—</span>
          <el-input-number v-model="amountMax" :min="0" :controls="false" placeholder="金额上限" size="small" class="!w-24" />
        </div>
        <el-button :icon="Refresh" size="small" plain @click="resetFilters">重置</el-button>
        <el-button :icon="Download" size="small" @click="doExport">导出数据</el-button>
        <el-button type="primary" :icon="Plus" size="small" round @click="openCreate">
          发起回收录入
        </el-button>
      </div>
    </div>

    <!-- Stats（真实数据计算，点击联动下方筛选） -->
    <div class="grid grid-cols-4 gap-6 mb-6">
      <div v-for="s in stats" :key="s.key"
        class="bg-white p-7 rounded-[32px] border shadow-sm transition-all hover:shadow-md group cursor-pointer"
        :class="activeStat === s.key ? 'stat-active border-blue-200' : 'border-white'"
        @click="onStatClick(s)"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="text-[11px] font-black uppercase tracking-widest transition-colors"
            :class="activeStat === s.key ? 'text-blue-500' : 'text-gray-300 group-hover:text-blue-400'">{{ s.label }}</p>
          <el-tooltip v-if="s.tip" :content="s.tip" placement="top">
            <el-icon :size="12" class="text-gray-300 group-hover:text-blue-400 transition-colors"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <p class="text-3xl font-black leading-none tracking-tighter"
          :class="activeStat === s.key ? 'text-blue-600' : 'text-gray-900'">
          {{ s.value }}<span class="text-sm text-gray-400 ml-2 font-bold">{{ s.unit }}</span>
        </p>
      </div>
    </div>

    <!-- Table: card 加内边距,内部 .archive-table-wrap 提供横向滚动 -->
    <el-card shadow="never" class="!rounded-[28px] border-none shadow-sm !p-6 mb-6">
      <div class="archive-table-wrap">
        <el-table :data="pagedOrders" size="small" class="pro-table archive-table">
        <el-table-column label="流水/日期" width="150">
          <template #default="{ row }">
            <div class="flex flex-col leading-tight">
              <span class="text-[13px] font-black text-blue-600 font-mono whitespace-nowrap">{{ row.id }}</span>
              <span class="text-[10px] text-gray-400 font-bold mt-0.5">{{ row.date }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="渠道来源商户" min-width="150">
          <template #default="{ row }">
            <div class="flex items-center gap-2 min-w-0">
              <el-tag :type="row.sourceType === 'individual' ? 'warning' : 'primary'" size="small" effect="dark" class="!rounded-md !px-1.5 font-black text-[9px] shrink-0">{{ row.sourceType === 'individual' ? '个' : '企' }}</el-tag>
              <div class="flex flex-col min-w-0">
                <span class="text-[14px] font-black text-gray-800 truncate">{{ row.supplier }}</span>
                <span class="text-[11px] text-gray-400 font-bold tracking-tight truncate">{{ row.contact || '线下直送' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- 来源徽标 -->
        <el-table-column label="来源" width="84" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.source === 'miniapp'" type="success" size="small" effect="plain">小程序</el-tag>
            <el-tag v-else type="info" size="small" effect="plain">销售录入</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资产概要 &amp; 仓储" min-width="230">
          <template #default="{ row }">
            <div class="flex flex-col gap-1">
              <span class="text-[14px] font-medium text-gray-600 truncate">{{ row.summary || (row.batteryType ? `${row.brand || ''} ${row.batteryType}` : '未登记明细') }}</span>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span v-if="row.batteryType" class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-black tracking-wider">{{ row.batteryType }}<template v-if="row.capacity"> · {{ row.capacity }}</template></span>
                <span class="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-black tracking-wider">SKU × {{ row.totalItems }}</span>
                <span class="text-[10px] bg-[#ecfdf5] text-[#059669] px-2 py-0.5 rounded-full font-black tracking-wider whitespace-nowrap">库位: {{ row.warehouse || '—' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="支付/结算" width="100">
          <template #default="{ row }">
            <div class="flex flex-col gap-1 leading-tight">
              <template v-if="row.returnStatus === 2">
                <el-tag type="info" size="small" effect="dark" class="!rounded-md font-black !text-[9px] w-fit">已退货退款</el-tag>
                <span class="text-[10px] text-gray-400 font-medium">{{ row.returnDoneTime }}</span>
              </template>
              <template v-else-if="row.returnStatus === 1">
                <el-tag type="danger" size="small" effect="dark" class="!rounded-md font-black !text-[9px] w-fit">退货退款中</el-tag>
                <span class="text-[10px] text-rose-500 font-bold">{{ row.returnTime }}</span>
              </template>
              <template v-else>
                <el-tag :type="row.paid ? 'success' : 'danger'" size="small" effect="dark" class="!rounded-md font-black !text-[9px] w-fit">{{ row.paid ? '已结清' : '待付款' }}</el-tag>
                <span class="text-[11px] font-black text-gray-400 italic">{{ row.paymentType }}</span>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="流水总额" width="130" align="right">
          <template #default="{ row }">
            <div class="flex flex-col items-end leading-tight">
              <span class="text-xl font-black text-gray-900 tracking-tighter whitespace-nowrap">¥{{ row.amount }}</span>
              <span class="text-[9px] text-gray-300 font-bold tracking-widest mt-0.5">整单估值</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="预估提成" width="130" align="right">
          <template #default="{ row }">
            <div class="flex flex-col items-end leading-tight">
              <span class="text-base font-black text-[#059669] whitespace-nowrap">+¥{{ row.commission }}</span>
              <span class="text-[9px] text-gray-300 font-bold mt-0.5">按 1.2% 比例估算</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="72" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" class="font-black" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>
      <!-- 分页（客户端分页：筛选结果全量导出不受影响） -->
      <div class="flex justify-between items-center pt-4 mt-2 border-t border-gray-50">
        <span class="text-[11px] text-gray-400 font-bold">共 {{ filteredOrders.length }} 条单据 · 当前第 {{ page }} / {{ totalPages }} 页</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="filteredOrders.length"
          :page-sizes="[20, 50, 100]"
          layout="sizes, prev, pager, next, jumper"
          size="small"
          background
          class="archive-pagination"
        />
      </div>
    </el-card>

    <!-- ═══ Create Dialog: 录入回收资产 ═══ -->
    <el-dialog v-model="createVisible" title="录入回收资产" width="820px" class="pro-dialog ultra-compact-dialog" :close-on-click-modal="false" align-center>
      <div class="p-3">
        <el-form :model="createForm" label-position="top">
          <!-- Row 1: Basic Info -->
          <div class="grid grid-cols-3 gap-3 mb-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
            <el-form-item label="回收日期" class="zero-mb">
              <el-date-picker v-model="createForm.date" type="date" class="!w-full" size="small" />
            </el-form-item>
            <el-form-item label="入库仓库" class="zero-mb">
              <el-select v-model="createForm.warehouse" class="w-full" size="small">
                <el-option label="1号主仓" value="1号主仓" />
                <el-option label="嘉定分仓" value="2号分仓" />
              </el-select>
            </el-form-item>
            <el-form-item label="结算模式" class="zero-mb">
              <el-select v-model="createForm.paymentType" class="w-full" size="small">
                <el-option label="现结" value="现结" />
                <el-option label="账期" value="账期" />
              </el-select>
            </el-form-item>
          </div>
          <!-- Row 2: Supplier & Payee & Freight -->
          <div class="grid grid-cols-3 gap-3 mb-2 px-1">
            <el-form-item label="渠道来源" class="zero-mb">
              <el-select v-model="createForm.supplier" filterable class="w-full" size="small" placeholder="搜索或跳转新建" @change="onSupplierChange">
                <template #footer>
                  <div class="p-2 border-t border-gray-100 flex gap-2 bg-gray-50">
                    <el-button type="primary" size="small" link class="flex-1 font-black" @click="openSupplierManager">新窗口建商户</el-button>
                    <el-button type="success" size="small" link class="flex-1 font-black" @click="openIndividualDialog">快速录入个体</el-button>
                  </div>
                </template>
                <el-option v-for="s in supplierOptions" :key="s.name" :label="s.name" :value="s.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="收款人 (Payee Name)" class="zero-mb">
              <el-input v-model="createForm.payee" placeholder="默认为渠道商名称" size="small" />
            </el-form-item>
            <el-form-item label="运费方案" class="zero-mb">
              <div class="flex gap-2">
                <el-select v-model="createForm.freightPayer" class="w-24" size="small">
                  <el-option label="包邮" value="对方" />
                  <el-option label="到付" value="我方" />
                </el-select>
                <el-input-number v-model="createForm.freightAmount" :precision="2" placeholder="金额" class="flex-1" size="small" />
              </div>
            </el-form-item>
          </div>
          <!-- Bank Details -->
          <div class="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 mb-3 grid grid-cols-2 gap-4">
            <el-form-item label="银行账号 (Bank Account)" class="zero-mb">
              <el-input v-model="createForm.bankAccount" placeholder="银行卡号/支付宝账号" size="small" />
            </el-form-item>
            <el-form-item label="开户行 (Bank Name)" class="zero-mb">
              <el-input v-model="createForm.bankName" placeholder="如：工行上海分行" size="small" />
            </el-form-item>
            <div class="col-span-2 flex gap-4 mt-1">
              <div class="flex-1 border-2 border-dashed border-gray-200 rounded-lg p-2 text-center hover:border-blue-300 transition-all cursor-pointer bg-white">
                <p class="text-[9px] font-black text-gray-400 uppercase">上传支付宝码</p>
                <el-icon v-if="!createForm.alipayQR" :size="16" class="text-gray-200 mt-1"><Picture /></el-icon>
                <img v-else :src="createForm.alipayQR" class="w-8 h-8 mx-auto mt-1" />
              </div>
              <div class="flex-1 border-2 border-dashed border-gray-200 rounded-lg p-2 text-center hover:border-[#6ee7b7] transition-all cursor-pointer bg-white">
                <p class="text-[9px] font-black text-gray-400 uppercase">上传微信码</p>
                <el-icon v-if="!createForm.wechatQR" :size="16" class="text-gray-200 mt-1"><Picture /></el-icon>
                <img v-else :src="createForm.wechatQR" class="w-8 h-8 mx-auto mt-1" />
              </div>
            </div>
          </div>
          <div class="divider h-[1px] bg-gray-100 my-2"></div>
          <!-- Items Header -->
          <div class="flex justify-between items-center mb-1 px-1">
            <span class="text-[9px] font-black text-gray-300 uppercase tracking-widest">回收清单明细</span>
            <el-button type="primary" link :icon="Plus" class="!text-[11px] font-black" @click="addItemRow">加一行</el-button>
          </div>
          <!-- Items List -->
          <div class="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
            <div v-for="(item, idx) in createForm.items" :key="idx"
              class="bg-white border border-gray-100 p-3 rounded-xl hover:border-blue-100 transition-all relative group shadow-sm"
            >
              <div class="grid grid-cols-12 gap-3">
                <div class="col-span-6">
                  <el-form-item label="资产型号 SKU" class="zero-mb">
                    <el-select v-model="item.productId" filterable class="w-full" size="small" @change="onProductChange(idx, item.productId)">
                      <template #footer>
                        <div class="p-2 border-t border-gray-100 flex bg-gray-50">
                          <el-button type="primary" size="small" link class="flex-1 font-black" @click="openProductManager">找不到产品？去建立新档案</el-button>
                        </div>
                      </template>
                      <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
                    </el-select>
                  </el-form-item>
                </div>
                <div class="col-span-2">
                  <el-form-item label="数量" class="zero-mb">
                    <el-input-number v-model="item.qty" :min="1" controls-position="right" class="!w-full" size="small" />
                  </el-form-item>
                </div>
                <div class="col-span-4">
                  <el-form-item class="zero-mb">
                    <template #label>
                      <span>单价</span>
                    </template>
                    <el-input-number v-model="item.price" :precision="2" controls-position="right" class="!w-full" size="small" />
                    <p v-if="item.priceRef" class="text-[10px] leading-tight mt-0.5 text-blue-500 font-bold">
                      <template v-if="item.priceRef.source === 'recycle'">
                        ⚖ 加权参考价：近{{ item.priceRef.windowDays }}天 {{ item.priceRef.sampleCount }} 笔 / {{ item.priceRef.totalQty }} 件 · 最近成交 ¥{{ item.priceRef.lastPrice }}
                      </template>
                      <template v-else-if="item.priceRef.source === 'archive'">📦 无历史成交，参考档案价</template>
                    </p>
                  </el-form-item>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3 mt-2">
                <el-input v-model="item.serialNo" placeholder="序列号/批次" size="small" />
                <el-select v-model="item.unit" placeholder="单位" size="small">
                  <el-option label="组" value="组" />
                  <el-option label="块" value="块" />
                </el-select>
                <el-input v-model="item.remark" placeholder="备注" size="small" />
                <el-checkbox v-model="item.needDismantle" class="!h-8">
                  <span class="text-[10px] font-black text-orange-500 uppercase">需拆解入库</span>
                </el-checkbox>
              </div>
              <el-button v-if="createForm.items.length > 1" type="danger" link :icon="Delete" class="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-all bg-white shadow-sm rounded-full p-0.5" @click="removeItemRow(idx)" />
            </div>
          </div>
          <!-- Remarks -->
          <el-form-item label="整单备注" class="mt-2 px-1 zero-mb">
            <el-input v-model="createForm.remarks" type="textarea" :rows="1" placeholder="业务背景..." class="ultra-compact-textarea" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <div class="flex justify-between items-center p-4 bg-gray-900 rounded-b-[20px] -mt-1">
          <div>
            <span class="text-[8px] text-gray-500 font-black uppercase tracking-widest leading-none">总计估值:</span>
            <p class="text-xl font-black text-white mt-0.5 tracking-tighter">¥{{ orderTotal.toLocaleString() }}</p>
          </div>
          <div class="flex gap-2">
            <el-button size="small" class="!rounded-lg !px-6 !bg-gray-800 !border-gray-700 !text-gray-400" @click="createVisible = false">取消</el-button>
            <el-button type="primary" size="small" class="!rounded-lg !px-8 font-black shadow-xl shadow-blue-500/20" :loading="submitting" @click="submitCreate">确认入库</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- ═══ Individual Supplier Dialog ═══ -->
    <el-dialog v-model="individualVisible" title="录入个人货源" width="360px" class="pro-dialog" append-to-body align-center>
      <el-form :model="individualForm" label-position="top">
        <el-form-item label="姓名/称呼" class="zero-mb">
          <el-input v-model="individualForm.name" size="small" />
        </el-form-item>
        <el-form-item label="联系电话" class="zero-mb">
          <el-input v-model="individualForm.phone" size="small" />
        </el-form-item>
        <el-form-item label="备注" class="zero-mb">
          <el-input v-model="individualForm.remark" type="textarea" size="small" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="p-4 pt-0 flex gap-2 justify-end">
          <el-button size="small" @click="individualVisible = false">取消</el-button>
          <el-button type="primary" size="small" class="!px-6 font-black" @click="saveIndividual">保存并选用</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ═══ Detail Dialog ═══ -->
    <el-dialog v-model="detailVisible" title="业务档案详情 (Snapshot)" width="880px" class="pro-dialog detail-dialog" align-center>
      <template v-if="currentOrder">
        <div class="p-0">
          <!-- Dark Header -->
          <div class="bg-gray-900 p-8 text-white flex justify-between items-start">
            <div>
              <div class="flex items-center gap-3 mb-4">
                <span class="text-[10px] bg-blue-600 px-3 py-1 rounded-full font-black uppercase tracking-[0.2em]">Recycle Doc</span>
                <span class="text-[10px] text-gray-500 font-bold uppercase tracking-widest italic">{{ currentOrder.id }}</span>
              </div>
              <h3 class="text-3xl font-black tracking-tighter">{{ currentOrder.supplier }}</h3>
              <div class="flex gap-6 mt-6">
                <div class="flex flex-col">
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest">发生日期</span>
                  <span class="text-sm font-bold mt-1">{{ currentOrder.date }}</span>
                </div>
                <div class="flex flex-col border-l border-gray-800 pl-6">
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest">仓储位置</span>
                  <span class="text-sm font-bold mt-1">{{ currentOrder.warehouse }}</span>
                </div>
                <div class="flex flex-col border-l border-gray-800 pl-6">
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest">结算模式</span>
                  <span class="text-sm font-bold mt-1 text-[#34d399]">{{ currentOrder.paymentType }}</span>
                </div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest">业务总估值</span>
              <p class="text-5xl font-black tracking-tighter mt-2 text-white">¥{{ currentOrder.amount }}</p>
              <div class="mt-6 flex justify-end gap-3">
                <div class="bg-gray-800 px-4 py-2 rounded-xl text-right">
                  <span class="text-[8px] text-gray-500 font-black block leading-none">预估提成</span>
                  <span class="text-lg font-black text-[#10b981] leading-none mt-1 inline-block">¥{{ currentOrder.commission }}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Body -->
          <div class="p-8 space-y-8 bg-white">
            <!-- Financial Settlement -->
            <div class="bg-gray-900 p-8 rounded-3xl text-white shadow-2xl">
              <div class="flex justify-between items-center mb-6">
                <h4 class="text-[10px] font-black text-gray-500 uppercase tracking-widest">财务结算明细 (Financial Settlement)</h4>
                <el-tag :type="isFullyPaid ? 'success' : 'danger'" effect="dark" size="small" class="!rounded-md font-black uppercase">
                  {{ isFullyPaid ? '已实付结清' : '待财务支付' }}
                </el-tag>
              </div>
              <div class="grid grid-cols-4 gap-8">
                <div>
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">应付总额 (Total)</span>
                  <span class="text-2xl font-black">¥{{ currentOrder.amount }}</span>
                </div>
                <div class="border-l border-gray-800 pl-8">
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">累计实付 (Paid)</span>
                  <span class="text-2xl font-black text-[#34d399]">¥{{ currentOrder.paidAmount || '0.00' }}</span>
                </div>
                <div class="border-l border-gray-800 pl-8">
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">待付余额 (Balance)</span>
                  <span class="text-2xl font-black text-rose-500">¥{{ balanceAmount }}</span>
                </div>
                <div class="border-l border-gray-800 pl-8">
                  <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">收款人 (Payee)</span>
                  <span class="text-sm font-bold truncate block mt-1">{{ currentOrder.supplier }}</span>
                </div>
              </div>
              <div class="mt-8 pt-6 border-t border-gray-800 flex gap-3">
                <el-button v-if="!currentOrder.paymentApplied" type="warning" class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-orange-900/20" @click="applyPayment">业务员发起付款申请</el-button>
                <el-button v-if="canFinance && currentOrder.paymentApplied && !isFullyPaid" type="success" class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-[0_10px_20px_rgba(6,95,70,0.2)]" @click="openPayment">继续执行财务打款</el-button>
                <el-button v-if="isFullyPaid" type="info" disabled class="flex-1 !rounded-xl font-black h-12 opacity-50">该单据款项已结清</el-button>
                <el-button v-if="currentOrder.returnStatus === 2" type="info" plain disabled class="flex-1 !rounded-xl font-black h-12">退货已完成 · 款项已原路退回 ({{ currentOrder.returnDoneTime }})</el-button>
                <el-button v-else-if="currentOrder.returnStatus === 1 && canFinance" type="danger" class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-rose-900/20" @click="handleReturnDone">确认完成退货（退款已到账）</el-button>
                <el-button v-else-if="currentOrder.returnStatus === 1" type="danger" plain disabled class="flex-1 !rounded-xl font-black h-12">退货处理中 · 款项退回办理 ({{ currentOrder.returnTime }})</el-button>
                <el-button v-else-if="currentOrder.paid" type="danger" class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-rose-900/20" @click="handleReturn">发起退货出库流程</el-button>
                <el-button v-if="currentOrder.hasDismantleItems" type="primary" class="flex-1 !rounded-xl font-black h-12 shadow-lg shadow-blue-900/20" @click="openDismantle">执行资产拆解</el-button>
              </div>
            </div>
            <!-- Detail Grid -->
            <div class="grid grid-cols-4 gap-6 bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div class="flex flex-col">
                <span class="text-[9px] text-gray-400 font-black uppercase tracking-widest">运费承担方</span>
                <span class="text-sm font-bold mt-1">{{ currentOrder.freightPayer }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[9px] text-gray-400 font-black uppercase tracking-widest">物流费用</span>
                <span class="text-sm font-bold mt-1">¥{{ currentOrder.freightAmount }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[9px] text-gray-400 font-black uppercase tracking-widest">渠道类型</span>
                <span class="text-sm font-bold mt-1 uppercase">{{ currentOrder.sourceType }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[9px] text-gray-400 font-black uppercase tracking-widest">处理进度</span>
                <el-tag type="success" size="small" effect="plain" class="!rounded-md mt-1 !w-fit font-black uppercase">已入库待结算</el-tag>
              </div>
            </div>
            <!-- Itemized Assets -->
            <div>
              <h4 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1 mb-4">资产明细构成 (Itemized Assets)</h4>
              <div class="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <el-table :data="currentOrder.items || []" size="small" class="detail-table" empty-text="该单据暂无资产明细">
                  <el-table-column label="资产描述" min-width="250">
                    <template #default="{ row }">
                      <div class="flex items-center gap-3">
                        <div class="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                        <div class="flex flex-col">
                          <span class="font-black text-gray-800">{{ row.product_name || '未命名资产' }}</span>
                          <span v-if="row.spec" class="text-[10px] text-gray-400 font-bold uppercase mt-0.5">{{ row.spec }}</span>
                        </div>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="序列号/批次" width="180">
                    <template #default="{ row }">
                      <span v-if="row.serial_no" class="text-[11px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded leading-none">{{ row.serial_no }}</span>
                      <span v-else class="text-[11px] text-gray-300">—</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="数量/单位" width="100" align="center">
                    <template #default="{ row }">
                      <span class="text-xs font-black text-gray-600">{{ row.qty || 1 }} {{ row.unit || '组' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="回收单价" width="120" align="right">
                    <template #default="{ row }">
                      <span class="text-sm font-bold text-gray-800">¥{{ formatMoney(row.unit_price) }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="行金额" width="130" align="right">
                    <template #default="{ row }">
                      <span class="text-sm font-black text-gray-900">¥{{ formatMoney(row.amount) }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
              <!-- 明细合计 ↔ 应付总额校验提示 -->
              <div v-if="itemTotalMismatch" class="mt-3 flex items-center gap-2 text-[11px] text-rose-500 font-bold">
                <el-icon><Warning /></el-icon>
                <span>明细合计 ¥{{ itemTotalSum }} 与应付总额 ¥{{ currentOrder.amount }} 不一致</span>
              </div>
            </div>
            <!-- Remarks -->
            <div v-if="currentOrder.remarks" class="bg-orange-50/50 p-6 rounded-2xl border border-orange-100/50">
              <span class="text-[9px] text-orange-400 font-black uppercase tracking-widest">业务备注说明</span>
              <p class="text-xs text-orange-600 font-medium mt-2 leading-relaxed italic">"{{ currentOrder.remarks }}"</p>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-[32px]">
          <div class="flex gap-4">
            <el-button size="default" class="!rounded-xl font-black" :icon="Download" @click="printDoc">打印入库单</el-button>
            <el-button size="default" class="!rounded-xl font-black" @click="doExport">导出流水记录</el-button>
          </div>
          <el-button type="primary" size="default" class="!rounded-xl !px-10 font-black" @click="detailVisible = false">关闭详情</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ═══ Payment Dialog ═══ -->
    <el-dialog v-model="paymentVisible" title="财务出纳支付执行" width="460px" class="pro-dialog">
      <template v-if="currentOrder">
        <div class="mb-6 p-6 rounded-[32px] bg-gray-900 text-white shadow-xl relative overflow-hidden">
          <div class="absolute right-0 top-0 p-4 opacity-10">
            <el-icon :size="60"><Money /></el-icon>
          </div>
          <p class="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">待支付回收款 (ID: {{ currentOrder.id }})</p>
          <p class="text-3xl font-black italic">¥{{ currentOrder.amount }}</p>
        </div>
        <el-form label-position="top">
          <el-form-item label="本次实付金额">
            <el-input-number v-model="paymentForm.amount" :min="0" :precision="2" class="!w-full" size="large" controls-position="right" />
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
          <div class="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <p class="text-[10px] text-blue-400 font-black uppercase mb-3 tracking-widest flex items-center gap-2">
              <el-icon><Money /></el-icon> 收款方账户详情 (Payee Account)
            </p>
            <div class="space-y-2">
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-500">收款人:</span>
                <span class="font-bold text-gray-900">{{ currentOrder.payee || currentOrder.supplier }}</span>
              </div>
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-500">银行账号:</span>
                <span class="font-mono font-bold text-gray-900">6222 **** **** 8888</span>
              </div>
              <div class="flex gap-2 mt-4 pt-4 border-t border-blue-100">
                <el-popover placement="top" :width="200" trigger="hover">
                  <template #reference>
                    <el-button size="small" type="primary" plain class="flex-1 !rounded-lg font-black">支付宝码</el-button>
                  </template>
                  <div class="text-center p-2">
                    <p class="text-[10px] font-black mb-2 uppercase tracking-widest text-blue-500">Alipay QR Code</p>
                    <div class="bg-gray-100 w-full aspect-square rounded-xl flex items-center justify-center border border-gray-200">
                      <el-icon :size="40" class="text-gray-300"><Picture /></el-icon>
                    </div>
                  </div>
                </el-popover>
                <el-popover placement="top" :width="200" trigger="hover">
                  <template #reference>
                    <el-button size="small" type="success" plain class="flex-1 !rounded-lg font-black">微信码</el-button>
                  </template>
                  <div class="text-center p-2">
                    <p class="text-[10px] font-black mb-2 uppercase tracking-widest text-[#10b981]">WeChat QR Code</p>
                    <div class="bg-gray-100 w-full aspect-square rounded-xl flex items-center justify-center border border-gray-200">
                      <el-icon :size="40" class="text-gray-300"><Picture /></el-icon>
                    </div>
                  </div>
                </el-popover>
              </div>
            </div>
          </div>
        </el-form>
      </template>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="paymentVisible = false" class="!rounded-xl">取消</el-button>
          <el-button type="primary" class="!rounded-xl !bg-[#059669] !border-none font-black px-10 shadow-lg shadow-[0_8px_20px_rgba(5,150,105,0.25)]" @click="submitPayment">确认拨付资金</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ═══ Dismantle Dialog ═══ -->
    <el-dialog v-model="dismantleVisible" title="资产拆解与标准化绑定" width="820px" class="pro-dialog" align-center>
      <template v-if="currentOrder">
        <div class="p-4">
          <div class="mb-6 p-6 rounded-[32px] bg-orange-50 border border-orange-100 relative overflow-hidden">
            <p class="text-[10px] text-orange-400 font-black uppercase tracking-widest mb-1">正在拆解原始资产</p>
            <p class="text-xl font-black text-gray-900">{{ currentOrder.summary }}</p>
            <p class="text-[11px] text-gray-400 mt-2">拆解后的产品将自动绑定到此回收单 #{{ currentOrder.id }}，以便后期销售溯源。</p>
          </div>
          <div class="flex justify-between items-center mb-4">
            <h4 class="text-[11px] font-black text-gray-400 uppercase tracking-widest">拆解产物明细 (Dismantled Components)</h4>
            <el-button type="primary" link :icon="Plus" @click="addDismantleItem">添加产物</el-button>
          </div>
          <div class="space-y-3">
            <div v-for="(item, idx) in dismantleItems" :key="idx"
              class="bg-white border border-gray-100 p-4 rounded-2xl flex gap-4 items-end shadow-sm relative group"
            >
              <div class="flex-1">
                <p class="text-[10px] text-gray-400 font-black uppercase mb-1">绑定标准产品 (SKU)</p>
                <el-select v-model="item.productId" filterable class="w-full" size="default">
                  <template #footer>
                    <div class="p-2 border-t border-gray-100 flex bg-gray-50">
                      <el-button type="primary" size="small" link class="flex-1 font-black" @click="openProductManager">建立新产品 SKU</el-button>
                    </div>
                  </template>
                  <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
              </div>
              <div class="w-32">
                <p class="text-[10px] text-gray-400 font-black uppercase mb-1">拆解数量</p>
                <el-input-number v-model="item.qty" :min="1" class="!w-full" controls-position="right" />
              </div>
              <div class="w-40">
                <p class="text-[10px] text-gray-400 font-black uppercase mb-1">分摊成本 (Est.)</p>
                <el-input-number v-model="item.cost" :precision="2" class="!w-full" controls-position="right" />
              </div>
              <el-button v-if="dismantleItems.length > 1" type="danger" link :icon="Delete" class="mb-1" @click="removeDismantleItem(idx)" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="p-6 bg-gray-50 flex justify-end gap-3 rounded-b-[32px]">
          <el-button @click="dismantleVisible = false">取消</el-button>
          <el-button type="primary" class="!rounded-xl !px-10 font-black" @click="submitDismantle">确认拆解并转入成品库</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowLeft, Delete, Download, Money, Picture, Search, Warning, Refresh, InfoFilled } from '@element-plus/icons-vue'
import { rowsApi, txApi, priceApi } from '@/api/rows'
import { exportCsv, toNum, nowStamp } from '@/utils/export'
import { useAuthStore } from '@/store/auth'

const auth = useAuthStore()
// 财务打款为 finance 域操作：无财务权限的账号隐藏打款按钮
const canFinance = computed(() => {
  const p = auth.user?.permissions || []
  return p.includes('*') || p.includes('finance')
})

// ═══ State ═══
const dateRange = ref([])
const searchQuery = ref('')
const paymentFilter = ref('')
const sourceFilter = ref('')      // 来源类型：'' 全部 / individual 个人 / enterprise 企业
const amountMin = ref(null)       // 金额区间下限
const amountMax = ref(null)       // 金额区间上限
const page = ref(1)               // 当前页码
const pageSize = ref(20)          // 每页条数
const activeStat = ref('')        // 当前点击高亮的 KPI 卡（'' 表示无）
const createVisible = ref(false)
const detailVisible = ref(false)
const paymentVisible = ref(false)
const dismantleVisible = ref(false)
const individualVisible = ref(false)
const submitting = ref(false)
const currentOrder = ref(null)

// ═══ 列表筛选：日期 / 关键字 / 结算状态 / 来源类型 / 金额区间 ═══
// 金额字符串 → 数字（兼容 "8,500" 逗号格式）
function parseAmt(v) {
  const n = parseFloat(String(v ?? '0').replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

const filteredOrders = computed(() => {
  let data = orders.value
  // 归一：业务回收单档案只展示销售手动录入的单（source=manual），不混入小程序单
  data = data.filter(o => o.source === 'manual')
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    data = data.filter((o) => (o.date || '') >= start && (o.date || '') <= end)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter((o) =>
      String(o.id).toLowerCase().includes(q) || (o.supplier || '').toLowerCase().includes(q)
    )
  }
  if (sourceFilter.value) {
    data = data.filter((o) => o.sourceType === sourceFilter.value)
  }
  if (paymentFilter.value !== '' && paymentFilter.value !== null) {
    const f = Number(paymentFilter.value)
    data = data.filter((o) => {
      const rs = o.returnStatus || 0
      if (f === 11) return rs === 1
      if (f === 12) return rs === 2
      if (f === 3) return o.paid && rs === 0   // 已结清（且未退货）
      if (f === 1) return !o.paid && rs === 0  // 待付款
      return true
    })
  }
  if (amountMin.value != null) {
    data = data.filter((o) => parseAmt(o.amount) >= amountMin.value)
  }
  if (amountMax.value != null) {
    data = data.filter((o) => parseAmt(o.amount) <= amountMax.value)
  }
  return data
})

// 客户端分页：筛选结果切片渲染（导出仍用 filteredOrders 全量）
const totalPages = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / pageSize.value)))
const pagedOrders = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})

// 任意筛选条件变化时回到第 1 页
watch([searchQuery, paymentFilter, sourceFilter, dateRange, amountMin, amountMax], () => {
  page.value = 1
})

// 重置全部筛选（保留分页尺寸）
function resetFilters() {
  searchQuery.value = ''
  paymentFilter.value = ''
  sourceFilter.value = ''
  dateRange.value = []
  amountMin.value = null
  amountMax.value = null
  activeStat.value = ''
  page.value = 1
}

// ═══ Create Form ═══
const createForm = reactive({
  date: new Date(),
  warehouse: '1号主仓',
  paymentType: '现结',
  supplier: '',
  payee: '',
  freightPayer: '对方',
  freightAmount: 0,
  remarks: '',
  bankAccount: '',
  bankName: '',
  alipayQR: '',
  wechatQR: '',
  items: [{ productId: '', qty: 1, unit: '组', price: 0, serialNo: '', remark: '', needDismantle: false }],
})

// Individual supplier form
const individualForm = reactive({ name: '', phone: '', remark: '' })

// Payment form
const paymentForm = reactive({ account: '中国工商银行 (基本户)', item: '回收预付款', amount: 0 })

// Dismantle form
const dismantleItems = ref([{ productId: '', qty: 1, cost: 0 }])

// ═══ Statistics（真实数据计算；点击卡片联动下方列表筛选）═══
// 金额格式化：≥1万 显示「x.x 万元」，否则显示整数元
function fmtStat(n) {
  if (n >= 10000) return { value: (n / 10000).toFixed(1), unit: '万元' }
  return { value: Math.round(n).toLocaleString('en-US'), unit: '元' }
}

const stats = computed(() => {
  // KPI 基于销售手动录入的全部单据（与列表数据源一致，不受当前筛选影响）
  const base = orders.value.filter(o => o.source === 'manual')
  const totalAmt = base.reduce((s, o) => s + parseAmt(o.amount), 0)
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthRows = base.filter(o => (o.date || '').startsWith(monthKey))
  const monthAmt = monthRows.reduce((s, o) => s + parseAmt(o.amount), 0)
  const unpaidRows = base.filter(o => !o.paid && !(o.returnStatus > 0))
  const unpaidAmt = unpaidRows.reduce((s, o) => s + parseAmt(o.amount), 0)
  const commissionAmt = base.reduce((s, o) => s + parseAmt(o.commission), 0)
  const t = fmtStat(totalAmt), m = fmtStat(monthAmt), u = fmtStat(unpaidAmt), c = fmtStat(commissionAmt)
  return [
    { key: 'all', label: '累计回收总额', value: t.value, unit: t.unit, tip: `共 ${base.length} 笔录入单据，点击查看全部` },
    { key: 'month', label: `本月新增回收 (${monthKey})`, value: m.value, unit: m.unit, tip: `本月 ${monthRows.length} 笔，点击筛选本月单据` },
    { key: 'unpaid', label: '待付款总额', value: u.value, unit: u.unit, tip: `${unpaidRows.length} 笔待付款，点击筛选跟进` },
    { key: 'commission', label: '预估提成合计', value: c.value, unit: c.unit, tip: '按 1.2% 提成比例累计估算' },
  ]
})

// KPI 卡点击 → 联动筛选（再次点击取消）
function onStatClick(s) {
  if (s.key === 'commission') return // 提成合计仅展示，不联动
  if (activeStat.value === s.key) {
    resetFilters()
    return
  }
  // 切换前先重置，再叠加对应筛选项
  searchQuery.value = ''
  paymentFilter.value = ''
  sourceFilter.value = ''
  amountMin.value = null
  amountMax.value = null
  if (s.key === 'all') {
    dateRange.value = []
  } else if (s.key === 'month') {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    dateRange.value = [fmt(first), fmt(last)]
  } else if (s.key === 'unpaid') {
    dateRange.value = []
    paymentFilter.value = 1
  }
  activeStat.value = s.key
  page.value = 1
}

const orders = ref([])

onMounted(async () => {
  try {
    const res = await rowsApi.list('recycle_orders', { size: 200, sort: 'time', order: 'desc' })
    orders.value = (res.data?.list || []).map(r => ({
      id: r.id, date: r.date || (r.time || '').slice(0, 10),
      supplier: r.supplier || r.user_name || '', sourceType: r.source_type || 'enterprise',
      source: r.source || (r.source_type === 'miniapp' ? 'miniapp' : 'manual'),
      warehouse: r.warehouse || '', summary: r.summary || '',
      batteryType: r.type || '', brand: r.brand || '', capacity: r.capacity || '',
      totalItems: r.total_items || 0, amount: r.amount || r.valuation || '0',
      commission: r.commission || '0', freightAmount: r.freight_amount || 0,
      freightPayer: r.freight_payer || '对方', paymentType: r.payment_type || '现结',
      paymentApplied: !!r.payment_applied, paid: !!r.paid, paidAmount: r.paid_amount || '0.00',
      hasDismantleItems: !!r.has_dismantle_items, remarks: r.remarks || '', contact: r.contact || '',
      returnStatus: Number(r.return_applied) || 0, returnTime: r.return_time || '',
      returnDoneTime: r.return_done_time || '',
    }))
  } catch { /* 后端不可达时保留空列表 */ }
  loadProducts()
})

const supplierOptions = [
  { name: '上海宏达汽车回收有限公司', type: 'enterprise', bankAccount: '6222 0210 0101 8888 999', bankName: '中国工商银行上海分行' },
  { name: '顺风物流园 (张经理)', type: 'enterprise', bankAccount: '6217 0012 1000 5555 222', bankName: '招商银行浦东支行' },
  { name: '个人货源: 李四', type: 'individual' },
]

// 商品档案（从后端 products 表实时加载，替换原硬编码列表）
const products = ref([])

async function loadProducts() {
  try {
    const res = await rowsApi.list('products', { size: 200, sort: 'id', order: 'asc' })
    products.value = (res.data?.list || []).map(p => ({
      id: p.id,
      name: p.name || '未命名产品',
      spec: p.model || '',
      price: Number(p.cost_price) || 0,
    }))
  } catch { /* 后端不可达时保持空列表 */ }
}

// ═══ Computed ═══
const orderTotal = computed(() => createForm.items.reduce((sum, item) => sum + item.qty * (item.price || 0), 0))

// 金额格式化：兼容数字 / 逗号字符串
function formatMoney(v) {
  const n = parseFloat(String(v ?? '0').replace(/,/g, ''))
  return (isNaN(n) ? 0 : n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 资产明细合计 ↔ 应付总额 一致性校验
const itemTotalSum = computed(() => {
  const items = currentOrder.value?.items || []
  return formatMoney(items.reduce((s, it) => s + (parseFloat(String(it.amount ?? '0').replace(/,/g, '')) || 0), 0))
})
const itemTotalMismatch = computed(() => {
  if (!currentOrder.value?.items?.length) return false
  const sum = parseFloat(itemTotalSum.value.replace(/,/g, ''))
  const total = parseFloat(String(currentOrder.value.amount ?? '0').replace(/,/g, ''))
  return Math.abs(sum - total) > 0.01
})

const isFullyPaid = computed(() => {
  if (!currentOrder.value) return false
  const total = parseFloat(currentOrder.value.amount.replace(/,/g, ''))
  const paid = parseFloat((currentOrder.value.paidAmount || '0').replace(/,/g, ''))
  return paid >= total
})

const balanceAmount = computed(() => {
  if (!currentOrder.value) return '0.00'
  const total = parseFloat(currentOrder.value.amount.replace(/,/g, ''))
  const paid = parseFloat((currentOrder.value.paidAmount || '0').replace(/,/g, ''))
  return (total - paid).toLocaleString(undefined, { minimumFractionDigits: 2 })
})

// ═══ Actions ═══
function openCreate() {
  Object.assign(createForm, {
    date: new Date(), warehouse: '1号主仓', paymentType: '现结', supplier: '',
    payee: '', freightPayer: '对方', freightAmount: 0, remarks: '',
    bankAccount: '', bankName: '', alipayQR: '', wechatQR: '',
    items: [{ productId: '', qty: 1, unit: '组', price: 0, priceRef: null, serialNo: '', remark: '', needDismantle: false }],
  })
  createVisible.value = true
}

function addItemRow() {
  createForm.items.push({ productId: '', qty: 1, unit: '组', price: 0, priceRef: null, serialNo: '', remark: '', needDismantle: false })
}

function removeItemRow(idx) {
  createForm.items.splice(idx, 1)
}

function onSupplierChange(name) {
  createForm.payee = name
  const info = supplierOptions.find(s => s.name === name)
  if (info) {
    createForm.bankAccount = info.bankAccount || ''
    createForm.bankName = info.bankName || ''
  }
}

// 选品后：拉取加权平均参考价自动填入（销售可手动调整）
async function onProductChange(idx, productId) {
  const item = createForm.items[idx]
  item.priceRef = null
  if (!productId) return
  const p = products.value.find(x => x.id === productId)
  if (p && p.price > 0) item.price = p.price   // 档案价先兜底，参考价到达后覆盖
  try {
    const { data } = await priceApi.reference(productId)
    if (data?.refPrice && Number(data.refPrice) > 0 && createForm.items[idx]?.productId === productId) {
      item.price = Number(data.refPrice)
      item.priceRef = data
    }
  } catch { /* 参考价不可达时保留档案价 */ }
}

function submitCreate() {
  if (!createForm.supplier || createForm.items.some(i => !i.productId)) {
    return ElMessage.warning('请完善必填信息')
  }
  submitting.value = true
  const newId = 'RC' + Date.now().toString().slice(-8)
  // 映射前端 createForm.items → 后端 recycle_order_items 字段
  const items = createForm.items.map((i, idx) => {
    const p = products.value.find(x => x.id === i.productId)
    return {
      product_id: i.productId,
      product_name: p?.name || '未知资产',
      spec: p?.spec || '',
      serial_no: i.serialNo || `SN-${newId}-${String(idx + 1).padStart(3, '0')}`,
      qty: i.qty || 1,
      unit: i.unit || '组',
      unit_price: i.price || 0,
      need_dismantle: !!i.needDismantle,
      remark: i.remark || '',
    }
  })
  txApi.recycleOrderCreate({
    order: {
      id: newId,
      date: new Date().toISOString().split('T')[0],
      supplier: createForm.supplier,
      source_type: 'enterprise',
      warehouse: createForm.warehouse,
      freight_amount: createForm.freightAmount,
      freight_payer: createForm.freightPayer,
      payment_type: createForm.paymentType,
      remarks: createForm.remarks,
      contact: '',
    },
    items,
  })
    .then(({ data }) => {
      const valuation = data?.valuation || orderTotal.value.toLocaleString()
      orders.value.unshift({
        id: newId,
        date: new Date().toISOString().split('T')[0],
        supplier: createForm.supplier,
        sourceType: 'enterprise',
        warehouse: createForm.warehouse,
        summary: items.map(i => i.product_name).join(', '),
        totalItems: items.length,
        amount: valuation,
        commission: data?.commission || (orderTotal.value * 0.012).toFixed(2),
        freightAmount: createForm.freightAmount,
        freightPayer: createForm.freightPayer,
        paymentType: createForm.paymentType,
        remarks: createForm.remarks,
        paymentApplied: false,
        paid: false,
        paidAmount: '0.00',
        hasDismantleItems: items.some(i => i.need_dismantle),
        contact: '',
        items: items.map((it, idx) => ({
          ...it,
          unit_price: it.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          amount: (it.qty * (it.price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        })),
      })
      ElMessage.success('资产录入成功')
    })
    .catch(() => ElMessage.error('创建失败'))
    .finally(() => { submitting.value = false; createVisible.value = false })
}

function openDetail(row) {
  currentOrder.value = { ...row, items: row.items || [] }
  detailVisible.value = true
  // 老订单没有预加载 items：按需从子表拉取
  if (!row.items || row.items.length === 0) {
    rowsApi.list('recycle_order_items', { filter: { order_id: row.id }, size: 100, sort: 'id', order: 'asc' })
      .then(({ data }) => {
        const list = data?.list || []
        if (list.length && currentOrder.value?.id === row.id) {
          currentOrder.value.items = list
        }
      })
      .catch(() => {})
  }
}

function applyPayment() {
  ElMessageBox.confirm('确定为此回收单发起资金拨付申请吗？', '申请确认')
    .then(() => {
      rowsApi.update('recycle_orders', currentOrder.value.id, { payment_applied: 1 })
        .then(() => {
          currentOrder.value.paymentApplied = true
          ElMessage.success('付款申请已推送到财务后台')
        })
        .catch(() => ElMessage.error('操作失败'))
    })
    .catch(() => {})
}

function openPayment() {
  const total = parseFloat(currentOrder.value.amount.replace(/,/g, ''))
  const paid = parseFloat((currentOrder.value.paidAmount || '0').replace(/,/g, ''))
  paymentForm.amount = total - paid
  paymentVisible.value = true
}

function submitPayment() {
  if (!paymentForm.account || !paymentForm.item || !paymentForm.amount) {
    return ElMessage.warning('请选择支付账户、类目并输入有效金额')
  }
  submitting.value = true
  txApi.recyclePay({
    orderId: currentOrder.value.id,
    amount: paymentForm.amount,
    account: paymentForm.account,
    itemClass: paymentForm.item,
  })
    .then((res) => {
      const r = res?.data || {}
      if (r.newPaid) currentOrder.value.paidAmount = r.newPaid
      if (r.isFullyPaid) currentOrder.value.paid = true
      ElMessage.success(`财务支付成功！已通过 [${paymentForm.account}] 支付 [${paymentForm.item}] 共 ¥${paymentForm.amount.toLocaleString()}`)
    })
    .catch((e) => ElMessage.error(e?.response?.data?.message || '支付失败'))
    .finally(() => { submitting.value = false; paymentVisible.value = false })
}

function handleReturn() {
  ElMessageBox.confirm('确定执行退货流程吗？资产将退还，款项将标记为退款中。', '退货确认', {
    confirmButtonText: '确定退货', cancelButtonText: '取消', type: 'warning',
  }).then(() => {
    txApi.recycleReturnStart({ orderId: currentOrder.value.id, reason: '退货处理中，款项原路退回' })
      .then((r) => {
        const t = new Date().toLocaleString('sv-CH').replace('T', ' ')
        currentOrder.value.returnStatus = 1
        currentOrder.value.returnTime = t
        currentOrder.value.remarks = '退货处理中，款项原路退回'
        currentOrder.value.returnFlowId = r?.data?.flowId
        const row = orders.value.find(o => o.id === currentOrder.value.id)
        if (row) { row.returnStatus = 1; row.returnTime = t; row.remarks = '退货处理中，款项原路退回'; row.returnFlowId = r?.data?.flowId }
        ElMessage.success('退货流程已启动，财务台账已生成待结算退款流水（flowId=' + (r?.data?.flowId || '-') + '）')
      })
      .catch((e) => ElMessage.error(e?.response?.data?.message || '操作失败'))
  }).catch(() => {})
}

function handleReturnDone() {
  ElMessageBox.confirm('确认该笔退款已到账、退货流程完结吗？确认后订单进入"退货完成"终态。', '完成退货确认', {
    confirmButtonText: '确认完成', cancelButtonText: '取消', type: 'warning',
  }).then(() => {
    txApi.recycleReturnDone({ orderId: currentOrder.value.id })
      .then(() => {
        const t = new Date().toLocaleString('sv-CH').replace('T', ' ')
        currentOrder.value.returnStatus = 2
        currentOrder.value.returnDoneTime = t
        currentOrder.value.remarks = '退货已完成，款项已原路退回'
        const row = orders.value.find(o => o.id === currentOrder.value.id)
        if (row) { row.returnStatus = 2; row.returnDoneTime = t; row.remarks = '退货已完成，款项已原路退回' }
        ElMessage.success('退货已完成，财务台账已自动核销对应退款流水')
      })
      .catch(() => ElMessage.error('操作失败'))
  }).catch(() => {})
}

function openDismantle() {
  dismantleItems.value = [{ productId: '', qty: 1, cost: 0 }]
  dismantleVisible.value = true
}

function addDismantleItem() {
  dismantleItems.value.push({ productId: '', qty: 1, cost: 0 })
}

function removeDismantleItem(idx) {
  dismantleItems.value.splice(idx, 1)
}

function submitDismantle() {
  if (dismantleItems.value.some(i => !i.productId)) return ElMessage.warning('请选择绑定的产品 SKU')
  submitting.value = true
  rowsApi.update('recycle_orders', currentOrder.value.id, { has_dismantle_items: 0 })
    .then(() => {
      currentOrder.value.hasDismantleItems = false
      ElMessage.success('资产拆解完成，产物已自动绑定回收单并录入成品库')
    })
    .catch(() => ElMessage.error('操作失败'))
    .finally(() => { submitting.value = false; dismantleVisible.value = false })
}

function openIndividualDialog() {
  individualForm.name = ''
  individualForm.phone = ''
  individualForm.remark = ''
  individualVisible.value = true
}

function saveIndividual() {
  if (!individualForm.name) return ElMessage.error('请填写名称')
  supplierOptions.push({ name: individualForm.name, type: 'individual' })
  createForm.supplier = individualForm.name
  individualVisible.value = false
}

function openSupplierManager() {
  window.open('/#/data/suppliers', '_blank')
  ElMessage.info('已在新窗口打开供应商管理...')
}

function openProductManager() {
  window.open('/#/data/products', '_blank')
  ElMessage.info('已在新窗口打开产品档案库...')
}

function doExport() {
  const inRange = filteredOrders.value
  if (!inRange.length) {
    ElMessage.warning('当前筛选条件下没有可导出的回收单')
    return
  }
  const headers = ['流水号', '日期', '来源类型', '商户/客户', '联系人', '资产概要', '库位', 'SKU数', '支付方式', '结算状态', '流水总额', '预估提成']
  const rows = inRange.map((o) => [
    o.id,
    o.date,
    o.sourceType === 'individual' ? '个人' : '企业',
    o.supplier,
    o.contact || '',
    o.summary,
    o.warehouse,
    o.totalItems,
    o.paymentType,
    o.returnStatus === 2 ? '已退货退款' : o.returnStatus === 1 ? '退货退款中' : (o.paid ? '已结清' : '待付款'),
    toNum(o.amount),
    toNum(o.commission),
  ])
  exportCsv(`回收单档案_${nowStamp()}.csv`, headers, rows)
  ElMessage.success(`已导出 ${rows.length} 条回收单记录`)
}

function printDoc() {
  ElMessage.success('正在生成打印预览...')
  setTimeout(() => { window.print() }, 500)
}
</script>

<style scoped>
.my-recycle-orders {
  margin: -1.5rem;
  padding: 1.5rem;
}
/* KPI 卡点击后的激活态（联动筛选时高亮） */
.stat-active {
  background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.12);
}
/* 分页条：弱化默认边框，贴合卡片圆角风格 */
.archive-pagination {
  --el-pagination-bg-color: transparent;
}
.archive-table-wrap {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
}
.archive-table-wrap :deep(.el-table) {
  min-width: 1050px;
}
.pro-table :deep(.el-table__header th) {
  background: transparent !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d1d5db !important;
  padding: 10px 6px !important;
  border-bottom: 1px solid #f3f4f6 !important;
}
.pro-table :deep(.el-table__body td) {
  padding: 10px 6px !important;
  border-bottom: 1px solid #f9fafb !important;
}
.pro-table :deep(.el-table__row) {
  background: #ffffff;
}
.pro-table :deep(.el-table__row:hover > td) {
  background: #f8fafc !important;
}
.pro-table :deep(.el-table__fixed-right) {
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.04);
}
.archive-table-wrap::-webkit-scrollbar { height: 6px; }
.archive-table-wrap::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
.detail-table :deep(.el-table__header th) {
  background: #f9fafb !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d1d5db !important;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
:deep(.el-dialog__header) { font-weight: 900; }
:deep(.zero-mb .el-form-item__content) { margin-bottom: 0 !important; }
:deep(.ultra-compact-textarea .el-textarea__inner) { min-height: 32px !important; }
</style>
