<template>
  <slot v-if="!err" />
  <div v-else class="page-error">
    <el-result
      icon="error"
      title="页面渲染出错"
      :sub-title="(err && err.message) || '未知错误'"
    >
      <template #extra>
        <el-button type="primary" @click="reset">刷新重试</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'

const err = ref(null)

// 捕获子页面（router-view 渲染的页面）在 setup / 渲染阶段的异常，
// 显示明确错误卡片而非整页白屏，且不向上冒泡连累全站。
onErrorCaptured((e) => {
  err.value = e
  console.error('[PageErrorBoundary]', e)
  return false
})

function reset() {
  err.value = null
  location.reload()
}
</script>

<style scoped>
.page-error {
  padding: 48px 24px;
}
</style>
