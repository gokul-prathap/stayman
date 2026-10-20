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
      50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
      400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
      800: '#1e293b', 900: '#0f172a', 950: '#020617',
    },
    sunset: '#f4b735',
  } } },
  plugins: [],
};
