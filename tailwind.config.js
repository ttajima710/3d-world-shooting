/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        neon: '#39f6ff',
        hot: '#ff3b6b',
        gold: '#ffd23f',
        ink: '#03060f',
      },
      fontFamily: {
        mono: ['"Courier New"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
