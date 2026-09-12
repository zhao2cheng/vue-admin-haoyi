import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 10000 })

// 最近一次登录成功的凭据（仅存内存，不落盘），用于 401 静默续期
// 后端 token 有效期 2 小时且无刷新机制；到期后首个请求返回 401，
// 这里自动重新登录一次并重放原请求，用户无感知，避免被踢回登录页。
let loginCreds = null
// 并发 401 去重：多个请求同时过期时，只发一次重登，其余等待同一结果
let refreshing = null

// Request interceptor — add token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor — handle errors
api.interceptors.response.use(
  res => {
    // 登录成功 → 记住凭据（内存），供 401 静默续期；密码错误(401)不会走到这里
    if (res.config?.url === '/auth/login' && res.config.method === 'post' && res.data?.code === 0) {
      try {
        loginCreds = JSON.parse(res.config.data)
      } catch { /* 非 JSON body（少见），忽略 */ }
    }
    return res.data
  },
  async err => {
    const { config, response } = err
    const isLoginReq = config?.url === '/auth/login'
    const status401 = response?.status === 401

    // 401 静默续期：业务请求 + 有凭据 + 未重试过
    if (status401 && !isLoginReq && !config?._retry && loginCreds) {
      config._retry = true
      try {
        if (!refreshing) {
          refreshing = api
            .post('/auth/login', loginCreds)
            .then(r => {
              localStorage.setItem('token', r.data.token)
              return r.data.token
            })
            .finally(() => { refreshing = null })
        }
        await refreshing
        return api(config) // 用新 token 重放原请求（请求拦截器会自动带上新 token）
      } catch (e) {
        // 续期失败（账号被禁用 / 密码已改等）→ 落到下方正常登出
      }
    }

    // 无法续期（无凭据 / 重登失败 / 登录接口本身的 401）→ 清登录态回登录页
    if (status401 && !isLoginReq) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  }
)

export default api
