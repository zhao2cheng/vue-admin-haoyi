<template>
  <div class="settings-page">
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- ── Tab: 基础设置 ── -->
      <el-tab-pane label="基础设置" name="basic">
        <el-card shadow="never" class="settings-card">
          <el-form :model="basicForm" label-width="120px" label-position="left">
            <h4 class="section-title">站点信息</h4>
            <el-form-item label="系统名称">
              <el-input v-model="basicForm.systemName" />
            </el-form-item>
            <el-form-item label="管理后台域名">
              <el-input v-model="basicForm.domain" placeholder="https://admin.example.com" />
            </el-form-item>
            <el-form-item label="客服电话">
              <el-input v-model="basicForm.supportPhone" />
            </el-form-item>

            <el-divider />

            <h4 class="section-title">小程序配置</h4>
            <el-form-item label="AppID">
              <el-input v-model="basicForm.appId" />
            </el-form-item>
            <el-form-item label="AppSecret">
              <el-input v-model="basicForm.appSecret" type="password" show-password />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="saveConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- ── Tab: 运营设置 ── -->
      <el-tab-pane label="运营设置" name="ops">
        <el-card shadow="never" class="settings-card">
          <el-form :model="opsForm" label-width="140px" label-position="left">
            <h4 class="section-title">回收业务</h4>
            <el-form-item label="回收估价系数">
              <el-input-number v-model="opsForm.recycleRatio" :precision="2" :step="0.05" />
            </el-form-item>
            <el-form-item label="上门服务费">
              <el-input-number v-model="opsForm.serviceFee" :precision="2" />
              <span class="ml-3 text-gray-400 text-xs">元</span>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="saveConfig">更新参数</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { rowsApi } from '@/api/rows'

const activeTab = ref('basic')
const submitting = ref(false)

const basicForm = reactive({
  systemName: '智充回收管理系统',
  domain: 'admin.zhichong.com',
  supportPhone: '400-888-9999',
  appId: 'wx888888888888',
  appSecret: '**************************',
})

const opsForm = reactive({
  recycleRatio: 0.85,
  serviceFee: 50,
})

// key → 是否已存在于库（保存时决定 update / create）
const exists = {}

function parseVal(v) {
  try { return JSON.parse(v) } catch { return v }
}

// 从真实 app_meta 键值表加载配置
async function loadConfig() {
  try {
    const res = await rowsApi.list('app_meta', { size: 200 })
    const list = res?.data?.list || []
    for (const row of list) {
      exists[row.key] = true
      const v = parseVal(row.value)
      if (row.key in basicForm) basicForm[row.key] = v
      else if (row.key in opsForm) opsForm[row.key] = v
    }
  } catch (e) {
    /* 加载失败保持默认值 */
  }
}

// 真实保存到 app_meta（key 不存在则 create，否则 update）
async function saveConfig() {
  submitting.value = true
  try {
    const entries = [...Object.entries(basicForm), ...Object.entries(opsForm)]
    for (const [key, val] of entries) {
      const value = JSON.stringify(val)
      if (exists[key]) {
        await rowsApi.update('app_meta', key, { value })
      } else {
        await rowsApi.create('app_meta', { key, value })
        exists[key] = true
      }
    }
    ElMessage.success('配置更新成功')
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.response?.data?.message || e.message))
  } finally {
    submitting.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.settings-page {
  padding: 0;
}

.settings-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

.settings-tabs :deep(.el-tabs__item) {
  font-weight: 900;
  font-size: 15px;
}

.settings-card {
  border-radius: 24px;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.settings-card :deep(.el-card__body) {
  padding: 28px 32px;
}

.section-title {
  font-size: 14px;
  font-weight: 900;
  color: #111827;
  margin: 4px 0 18px;
  padding-left: 10px;
  border-left: 4px solid #409eff;
}

.settings-card :deep(.el-form-item) {
  margin-bottom: 20px;
}
</style>
