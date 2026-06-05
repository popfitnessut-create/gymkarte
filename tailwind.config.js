/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ライトテーマ（メインカラー=白）。navyトークンを明るい階調へ再マッピング
        navy: {
          900: '#ffffff', // アプリ背景・入力背景
          800: '#f4f6fa', // カード・ヘッダー
          700: '#e5e9f0', // 罫線・サブ背景
          600: '#d3d9e4'  // 罫線・チップ
        },
        accent: {
          DEFAULT: '#2f81f7', // 電気ブルー
          gold: '#e3b341'
        },
        // グレー階調を反転：小さい番号=濃い文字、大きい番号=淡い文字
        gray: {
          100: '#111827', // 主要テキスト
          200: '#1f2937',
          300: '#374151', // 準主要テキスト
          400: '#5b6472', // 補助テキスト
          500: '#8b93a1', // 淡色テキスト
          600: '#aeb6c2'  // 最淡色（アイコン等）
        }
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
