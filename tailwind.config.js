/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          purple: '#a855f7',
          cyan: '#22d3ee',
          pink: '#f472b6',
          lime: '#a3e635',
          amber: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
