/** @type {import('tailwindcss').Config} */
module.exports = {
  // 这里的 content 需要包含所有的源码文件，这样 Tailwind 才能按需生成 CSS。
  content: ['./public/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
    },
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
