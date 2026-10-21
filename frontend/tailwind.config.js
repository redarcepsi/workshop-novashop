/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fredoka', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Fonds : bleu nuit profond
        night: {
          50: '#f3f2ff',
          100: '#e6e4fb',
          200: '#cbc7f2',
          300: '#a7a1e0',
          400: '#7e77c2',
          500: '#5c559f',
          600: '#433d80',
          700: '#2e2962',
          800: '#1d1944',
          850: '#16132f',
          900: '#100d24',
          950: '#09071a',
        },
        // L'or « bling » : actions principales, PokéDollars
        gold: {
          50: '#fffbea',
          100: '#fff2c4',
          200: '#ffe485',
          300: '#ffd246',
          400: '#ffc21c',
          500: '#f5a300',
          600: '#d97e00',
          700: '#b45a04',
          800: '#92450a',
          900: '#78390d',
        },
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shake: {
          '0%, 100%': { transform: 'rotate(0) translateX(0)' },
          '20%': { transform: 'rotate(-3deg) translateX(-6px)' },
          '40%': { transform: 'rotate(3deg) translateX(6px)' },
          '60%': { transform: 'rotate(-2deg) translateX(-4px)' },
          '80%': { transform: 'rotate(2deg) translateX(4px)' },
        },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(.85) translateY(12px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shake: 'shake .45s ease-in-out infinite',
        'pop-in': 'pop-in .45s cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fade-in .3s ease-out both',
      },
    },
  },
  plugins: [],
}
