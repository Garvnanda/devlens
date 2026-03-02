/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        primary: '#06B6D4',
        secondary: '#6366F1',
        text: '#E2E8F0',
      },
    },
  },
  plugins: [],
}
