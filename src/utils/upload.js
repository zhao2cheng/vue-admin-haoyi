// utils/upload.js — 通用图片上传
// 前端 FileReader 转 base64 → POST /api/open/upload（免鉴权）→ 返回完整图片 URL
import api from '@/api/index'

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function uploadImage(file) {
  if (!file) throw new Error('未选择文件')
  const data = await fileToBase64(file)
  const res = await api.post('/open/upload', { data, fileName: file.name || 'image.jpg' })
  return res?.data?.url
}
