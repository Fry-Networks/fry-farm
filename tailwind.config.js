/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin';
export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      roboto: 'Roboto',
      apex: ['"Apex Mk2"', 'sans-serif'],
    },
    extend: {
      screens: {
        xs: '430px',
        'sm-s': { max: '600px' },
        'max-sm': { max: '830px' },
        'max-md': { max: '1024px' },
        'md-m': { max: '1170px' },
        'max-xxl': { max: '1300px' },
        'max-xxxl': { max: '1480px' },
        'max-exl': { max: '1650px' },
      },
      colors: {
        primary: '#202224',
        black: '#2B2B2B',
        red: '#FD0000',
        darkRed: '#F00',
        secondary: '#DE0308',
        heading: '#222541',
        text_clr: '#808080',
        green: '#08A700',
        link: '#337FFB',
        gray: '#F5F5F5',
        medGray: '#606060',
        neon: '#00B69B',
        txtPending: '#F7931A',
      },
    },
  },
  daisyui: {
    themes: ['lofi'],
  },
  plugins: [require('daisyui'), require('tailwindcss-important')],
}
