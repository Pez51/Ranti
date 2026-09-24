/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ranti: {
          primary: '#0B4A22', // Verde institucional (puedes ajustarlo)
          secondary: '#1A7A3A',
        }
      }
    },
  },
  plugins: [],
}

