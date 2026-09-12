// pm2 守护后端 server.js（.cjs 扩展名：项目根 package.json 为 type:module，
// 用 .cjs 确保本文件始终按 CommonJS 解析，pm2 稳定加载）
// 用法（在服务器上）：pm2 start deploy/ecosystem.config.cjs && pm2 save
// 注意：SQLite 单写，instances 必须为 1，切勿开 cluster 多实例（会 database is locked）
module.exports = {
  apps: [
    {
      name: 'vue-admin-backend',
      cwd: '/var/www/vue-admin/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // 把 your.domain.com 换成你的真实域名（必须与 nginx 一致）
        PUBLIC_BASE_URL: 'https://your.domain.com'
      },
      error_file: '/var/www/vue-admin/backend/logs/err.log',
      out_file: '/var/www/vue-admin/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
