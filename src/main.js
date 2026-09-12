import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import * as Icons from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './assets/tailwind.css'
import './assets/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
for (const [key, comp] of Object.entries(Icons)) app.component(key, comp)

// 全局错误兜底：单页渲染/逻辑异常只限本组件，绝不让整站空白
app.config.errorHandler = (err, instance, info) => {
  console.error('[render error]', info, err)
}

app.mount('#app')
