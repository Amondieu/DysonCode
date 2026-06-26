/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dyson: {
          bg: 'rgb(var(--dyson-bg) / <alpha-value>)',
          panel: 'rgb(var(--dyson-panel) / <alpha-value>)',
          elevated: 'rgb(var(--dyson-elevated) / <alpha-value>)',
          border: 'rgb(var(--dyson-border) / <alpha-value>)',
          accent: 'rgb(var(--dyson-accent) / <alpha-value>)',
          flow: 'rgb(var(--dyson-flow) / <alpha-value>)',
          blueprint: 'rgb(var(--dyson-blueprint) / <alpha-value>)',
          green: 'rgb(var(--dyson-green) / <alpha-value>)',
          yellow: 'rgb(var(--dyson-yellow) / <alpha-value>)',
          red: 'rgb(var(--dyson-red) / <alpha-value>)',
          text: 'rgb(var(--dyson-text) / <alpha-value>)',
          muted: 'rgb(var(--dyson-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
