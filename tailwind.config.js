/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // JendCore brand palette
        ink: {
          50: '#f5f7fb',
          100: '#e6ebf5',
          200: '#c7d1e6',
          300: '#9aaccd',
          400: '#6b82b0',
          500: '#4a6296',
          600: '#384c79',
          700: '#2a3a5e',
          800: '#1c2640',
          900: '#0b1220',
        },
        accent: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
