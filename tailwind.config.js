/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // JendCore brand palette — refined for modern workspace
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
          500: '#1877F2',
          600: '#0F5FCC',
        },
        jend: {
          blue: '#1877F2',
          deep: '#0F5FCC',
          destructive: '#DC2626',
        },
        /*
         * Phase 2A workspace palette (session screen only).
         * Purely ADDITIVE: the ink / accent / jend scales above are untouched,
         * so LandingPage, StartSessionPage, JoinSessionPage and PrimaryButton
         * keep their current appearance.
         *
         * graphite = neutral titanium-dark surfaces (stage, panels, bars).
         * titanium = text, secondary labels and hairline borders on graphite.
         * status   = functional signalling colours (truthful, never decorative).
         */
        graphite: {
          400: '#4b545f',
          500: '#3a424c',
          600: '#2c333b',
          700: '#22282f',
          800: '#191e24',
          850: '#14181d',
          900: '#101317',
          950: '#0a0c0f',
        },
        titanium: {
          100: '#e8ecf1',
          200: '#c9d0d8',
          300: '#a5aeba',
          400: '#7e8896',
          500: '#5e6774',
        },
        status: {
          success: '#34c08a',
          warn: '#e0a33c',
          danger: '#e5484d',
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
      /* Phase 2A workspace elevation — additive tokens. */
      boxShadow: {
        'jc-float':
          '0 24px 48px -24px rgba(0, 0, 0, 0.9), 0 2px 8px rgba(0, 0, 0, 0.5)',
        'jc-panel': '-24px 0 60px -30px rgba(0, 0, 0, 0.85)',
        'jc-sheet': '0 -24px 60px -30px rgba(0, 0, 0, 0.85)',
        'jc-inset-hairline': 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
    },
  },
  plugins: [],
};
