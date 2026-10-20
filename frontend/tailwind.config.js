/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608bfa',
          500: '#3b65f6',
          600: '#2546eb',
          700: '#1d34d8',
          800: '#1e2caf',
          900: '#1e2b8a',
          950: '#171c54',
        },
      },
    },
  },
  plugins: [],
}
