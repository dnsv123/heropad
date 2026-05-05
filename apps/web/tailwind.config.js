/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // TODO: align brand palette with SuperVictor design tokens.
      colors: {
        hero: {
          accent: '#7c3aed',
          glow: '#a78bfa',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
