/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fredoka', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
      },
      colors: {
        ranti: {
          light: '#E8F5E9',      // Fondo crema/verde muy claro
          primary: '#4ADE80',    // Verde vibrante para gradientes
          secondary: '#22C55E',  // Verde medio
          dark: '#0B4A22',       // Verde institucional oscuro (UCSM)
          ink: '#062912',        // Casi negro para bordes gruesos y textos
        }
      },
      boxShadow: {
        'solid': '4px 4px 0px 0px #062912',
        'solid-hover': '6px 6px 0px 0px #062912',
        'solid-sm': '2px 2px 0px 0px #062912',
      },
      backgroundImage: {
        'green-gradient': 'linear-gradient(135deg, #4ADE80 0%, #22C55E 100%)',
      }
    },
  },
  plugins: [],
}