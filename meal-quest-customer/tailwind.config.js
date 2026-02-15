/** @type {import('tailwindcss').Config} */
module.exports = {
  // 这里的 content 需要包含所有的源码文件，这样 Tailwind 才能按需生成 CSS。
  content: ['./public/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    // 兼容小程序不支持的特性
    preflight: false,
    divideColor: false,
    divideWidth: false,
    divideStyle: false,
    divideOpacity: false,
    space: false,
    placeholderColor: false,
    placeholderOpacity: false,
  },
}
