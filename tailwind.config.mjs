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
        accent: '#1d3557',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            fontFamily: 'Lora, Georgia, serif',
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
