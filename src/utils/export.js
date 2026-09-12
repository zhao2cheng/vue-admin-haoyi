// export.js — 通用 CSV 导出工具
// 统一处理 UTF-8 BOM（保证 Excel 打开中文不乱码）、逗号/引号/换行转义
// 用法：
//   exportCsv('回收订单.csv', ['订单号','金额'], [[1, '21,000.00'], [2, '3,500.00']])
// 金额类字段建议先经 fmtMoney / toNum 转成纯数字，方便 Excel 直接求和。

// 转义单个单元格
function esc(v) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

// 导出 CSV（浏览器下载）
export function exportCsv(filename, headers, rows) {
  const lines = [headers.map(esc).join(',')]
  rows.forEach((r) => lines.push(r.map(esc).join(',')))
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 把 '21,000.00' / '¥3,500' / 1234 统一转成纯数字字符串（保留两位小数）
export function toNum(v) {
  const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/[¥,\s]/g, ''))
  return isNaN(n) ? '0.00' : n.toFixed(2)
}

// 千分位金额（导出时一般不用，供展示用）
export function fmtMoney(v) {
  const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/[¥,\s]/g, ''))
  if (isNaN(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 当前时间戳，用于导出文件名：YYYYMMDD_HHmmss
export function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
