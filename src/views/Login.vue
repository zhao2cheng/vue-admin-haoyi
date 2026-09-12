<template>
  <div class="login-container">
    <div class="login-card animate__animated animate__fadeIn">
      <div class="login-header">
        <div class="logo-box">
          <el-icon :size="32" color="#fff"><Lightning /></el-icon>
        </div>
        <h2>后台管理系统</h2>
        <p>ADMIN CONTROL CENTER</p>
      </div>

      <el-form :model="form" size="large" class="login-form" @keyup.enter="handleLogin">
        <el-form-item>
          <el-input v-model="form.username" placeholder="请输入管理员账号" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="请输入登录密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <div class="form-options">
          <el-checkbox v-model="form.remember">记住登录状态</el-checkbox>
          <el-link type="primary" :underline="false">忘记密码?</el-link>
        </div>
        <el-button type="primary" class="submit-btn" :loading="loading" @click="handleLogin">
          立即登录
          <el-icon class="el-icon--right"><Right /></el-icon>
        </el-button>
      </el-form>

      <div class="login-footer">
        <el-icon :size="14"><Lock /></el-icon>
        <span>安全加密访问控制</span>
      </div>
    </div>

    <!-- 首次登录强制修改初始密码 -->
    <el-dialog
      v-model="changePwdVisible"
      title="首次登录需修改密码"
      width="420px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      align-center
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="出于安全考虑，请先修改初始密码后再使用系统"
        class="mb-4"
      />
      <el-form :model="chgForm" label-width="90px" @submit.prevent>
        <el-form-item label="当前密码">
          <el-input v-model="chgForm.oldPassword" type="password" show-password placeholder="请输入当前登录密码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="chgForm.newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="chgForm.confirm" type="password" show-password placeholder="再次输入新密码" @keyup.enter="doChangePwd" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="chgLoading" class="w-full" @click="doChangePwd">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { ElMessage } from 'element-plus'
import { User, Lock, Lightning, Right } from '@element-plus/icons-vue'
import api from '@/api'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const form = reactive({ username: '', password: '', remember: true })

// 首次登录强制改密
const changePwdVisible = ref(false)
const chgLoading = ref(false)
const chgForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })

async function handleLogin() {
  if (!form.username || !form.password) return ElMessage.warning('请输入用户名和密码')
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    if (auth.mustChangePwd) {
      ElMessage.warning('请先修改初始密码')
      changePwdVisible.value = true
    } else {
      ElMessage.success('登录成功')
      router.push('/dashboard')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || e.message || '登录失败')
  } finally {
    loading.value = false
  }
}

async function doChangePwd() {
  const { oldPassword, newPassword, confirm } = chgForm
  if (!oldPassword) return ElMessage.warning('请输入当前密码')
  if (!newPassword || newPassword.length < 6) return ElMessage.warning('新密码至少 6 位')
  if (newPassword !== confirm) return ElMessage.warning('两次输入的新密码不一致')
  chgLoading.value = true
  try {
    await api.post('/tx/password-change', { oldPassword, newPassword })
    ElMessage.success('密码修改成功')
    auth.mustChangePwd = false
    changePwdVisible.value = false
    router.push('/dashboard')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || e.message || '修改失败')
  } finally {
    chgLoading.value = false
  }
}
</script>

<style scoped>
.login-container {
  width: 100vw;
  height: 100vh;
  background: radial-gradient(circle at 0% 0%, #f0fdf4, #fff, #f0fdf4);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 1rem;
}
.login-container:before {
  content: "";
  position: absolute;
  top: -10%;
  left: -10%;
  height: 40%;
  width: 40%;
  border-radius: 9999px;
  background-color: #d1fae5;
  filter: blur(120px);
}
.login-container:after {
  content: "";
  position: absolute;
  bottom: -10%;
  right: -10%;
  height: 40%;
  width: 40%;
  border-radius: 9999px;
  background-color: #ecfdf5;
  filter: blur(120px);
}

.login-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 420px;
  overflow: hidden;
  border-radius: 32px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 3rem;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.05), 0 0 1px rgba(0, 0, 0, 0.1);
}

.login-header {
  margin-bottom: 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo-box {
  margin-bottom: 1.5rem;
  display: flex;
  height: 4rem;
  width: 4rem;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  background-color: #059669;
  color: #fff;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 0 #a7f3d0;
  --tw-shadow-color: #a7f3d0;
}

.login-header h2 {
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: #111827;
}

.login-header p {
  margin-top: 0.75rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #9ca3af;
}

.login-form > :not([hidden]) ~ :not([hidden]) {
  margin-top: 1.25rem;
}

.form-options {
  margin-top: 0.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.submit-btn {
  display: flex;
  height: 3.5rem;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.75rem;
  border-color: #059669 !important;
  background-color: #059669 !important;
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: 700;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1), 0 0 0 0 #d1fae5 !important;
  --tw-shadow-color: #d1fae5;
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 0.15s;
}
.submit-btn:hover {
  background-color: #047857 !important;
}
.submit-btn:active {
  transform: scale(0.98);
}

.login-footer {
  margin-top: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-top-width: 1px;
  border-color: #f3f4f6;
  padding-top: 2rem;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #9ca3af;
}

:deep(.el-input__wrapper) {
  height: 3rem;
  border-radius: 0.75rem;
  border-style: none;
  background-color: rgba(243, 244, 246, 0.5);
  padding-left: 1rem;
  padding-right: 1rem;
  box-shadow: 0 0 #0000;
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 0.15s;
}
:deep(.el-input__wrapper.is-focus) {
  background-color: #fff !important;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.125), 0 4px 12px -4px rgba(0, 0, 0, 0.05) !important;
}
:deep(.el-form-item) { margin-bottom: 0; }
:deep(.el-checkbox__label) { font-size: 0.75rem; line-height: 1rem; color: #6b7280; }
:deep(.el-link) { font-size: 0.75rem; line-height: 1rem; font-weight: 500; }
</style>
