/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0b1120',
          800: '#111a2e',
          700: '#1a2440',
          600: '#243154'
        },
        accent: {
          DEFAULT: '#2f81f7', // 電気ブルー
          gold: '#e3b341'
        }
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
