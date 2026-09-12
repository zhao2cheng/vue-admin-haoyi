/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 品牌主色 — 对齐原型站 Element 蓝 (#409eff)
        primary: {
          50: '#ecf5ff',
          100: '#d9ecff',
          200: '#c6e2ff',
          300: '#a0cfff',
          400: '#79bbff',
          500: '#409eff',
          600: '#337ecc',
          700: '#2b6cb0',
          800: '#1f4e80',
          900: '#143055',
        },
        // 覆盖 tailwind 默认 emerald 为同款蓝，保证全站主色统一（不再绿蓝混搭）
        emerald: {
          50: '#ecf5ff',
          100: '#d9ecff',
          200: '#c6e2ff',
          300: '#a0cfff',
          400: '#79bbff',
          500: '#409eff',
          600: '#337ecc',
          700: '#2b6cb0',
          800: '#1f4e80',
          900: '#143055',
        },
        // 参考站背景色
        page: '#f4f7f9',
        'page-alt': '#f4f7f6',
        // 语义成功绿（Element success），与品牌蓝区分，用于"已结清/已支付"等状态
        success: {
          50: '#f0f9eb',
          100: '#e1f3d8',
          200: '#d1edc4',
          300: '#b3e19d',
          400: '#95d475',
          500: '#67c23a',
          600: '#529b2e',
          700: '#3d7a23',
          800: '#2c5a19',
          900: '#1d3d10',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
        '5xl': '40px',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.2' }],
      },
      fontWeight: {
        black: '900',
      },
    },
  },
  plugins: [],
  // 不干扰 Element Plus 的样式
  corePlugins: {
    preflight: false,
  },
}
