/** @type {import('tailwindcss').Config} */
const blue = {
  50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
  400: '#60a5fa', 500: '#3b82f6', 600: '#315fff', 700: '#264ed5',
  800: '#2443ab', 900: '#233c87', 950: '#172554',
};
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: {
    brand: blue,
    indigo: blue,
    slate: {
      50: '#fcf8f1', 100: '#f5eddf', 200: '#e6d8c3', 300: '#cbbba5',
      400: '#9e8e7d', 500: '#7d6c5c', 600: '#645346', 700: '#4c3e34',
      800: '#30271f', 900: '#191612', 950: '#0c0b09',
    },
    sunset: '#f4b735',
  } } },
  plugins: [],
};
