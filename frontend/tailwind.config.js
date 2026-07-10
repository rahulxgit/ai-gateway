/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm graphite, not pure black — panels sit one step lighter than
        // the canvas so structure reads without needing borders everywhere.
        canvas: '#0E0F12',
        panel: '#16181C',
        'panel-raised': '#1C1F24',
        hairline: '#282B31',
        ink: '#E8E6E1',
        'ink-muted': '#8B8F98',
        'ink-faint': '#54585F',
        // Two accents, each tied to a specific meaning in the product
        // rather than decoration: amber marks a provider switch/failover
        // event, teal marks a healthy/successful response.
        signal: '#F0A339',
        'signal-dim': '#8A6428',
        ok: '#4FD1AE',
        'ok-dim': '#2C6B58',
        danger: '#E5675B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
