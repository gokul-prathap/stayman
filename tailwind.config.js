/** @type {import('tailwindcss').Config} */
const orange = {
  50: '#fff4eb', 100: '#ffe4ce', 200: '#ffc49a', 300: '#ffa06a',
  400: '#f77d45', 500: '#ed6236', 600: '#bd431c', 700: '#983516',
  800: '#772d19', 900: '#60291b', 950: '#341209',
};
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: {
    brand: orange,
    indigo: orange,
    slate: {
      50: '#fcf8f1', 100: '#f5eddf', 200: '#e6d8c3', 300: '#cbbba5',
      400: '#9e8e7d', 500: '#7d6c5c', 600: '#645346', 700: '#4c3e34',
      800: '#30271f', 900: '#191612', 950: '#0c0b09',
    },
    sunset: '#f4b735',
  } } },
  plugins: [],
};
