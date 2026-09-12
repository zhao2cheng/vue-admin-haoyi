import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const mustChangePwd = ref(false)

  const loggedIn = computed(() => !!token.value)

  // 调用真实后端 /api/auth/login（账号 admin / 123456）
  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password })
    token.value = res.data.token
    user.value = res.data.user
    mustChangePwd.value = !!res.data.mustChangePwd
    localStorage.setItem('token', token.value)
    localStorage.setItem('user', JSON.stringify(user.value))
    return user.value
  }

  function logout() {
    token.value = ''
    user.value = null
    mustChangePwd.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return { token, user, loggedIn, mustChangePwd, login, logout }
})
