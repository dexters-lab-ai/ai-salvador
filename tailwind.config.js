/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      display: ['var(--font-display)', 'sans-serif'],
      body: ['var(--font-body)', 'monospace'],
    },
    extend: {
      colors: {
        yellow: {
          300: '#FCD34D', // text-yellow-300
          400: '#FBBF24', // text-yellow-400
        },
        brown: {
          100: '#FFFFFF',
          200: '#EAD4AA',
          300: '#E4A672',
          500: '#B86F50',
          700: '#743F39',
          800: '#3F2832',
          900: '#181425',
        },
        clay: {
          100: '#C0CBDC',
          300: '#8B9BB4',
          500: '#5A6988',
          700: '#3A4466',
          900: '#181425',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
