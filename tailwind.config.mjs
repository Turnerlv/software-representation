import flowbite from 'flowbite/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,ts}',
    './node_modules/flowbite/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: '#FFD500', // Yellow-9
        gray: {
          50: '#FDFCFA',
          100: '#F2EFEB',
          200: '#EBE7E2',
          300: '#D2CDC7',
          400: '#C0BAB2',
          500: '#948C80',
          600: '#746C61',
          700: '#4C4741',
          800: '#2B2926',
          900: '#1A1917',
          950: '#0E0C0A',
        },
      },
      fontFamily: {
        sans: ['"Work Sans"', 'system-ui', 'sans-serif'],
        heading: ['Rubik', 'system-ui', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            fontFamily: '"Work Sans", system-ui, sans-serif',
            h1: { fontFamily: 'Rubik, system-ui, sans-serif' },
            h2: { fontFamily: 'Rubik, system-ui, sans-serif' },
            h3: { fontFamily: 'Rubik, system-ui, sans-serif' },
            h4: { fontFamily: 'Rubik, system-ui, sans-serif' },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    flowbite,
  ],
};
