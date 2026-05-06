/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // HeroPad brand palette.
      // - "hero" tokens are derived from the SuperVictor character costume:
      //   primary blue, deep navy background, cyan cape highlights, gold for
      //   high-energy CTAs (matches the EUIPO Super Victor logo).
      // - "solana" tokens are reserved for crypto-context UI (login, wallet,
      //   on-chain success states) so users get a visual cue they're in the
      //   Solana side of the app.
      colors: {
        hero: {
          blue: '#1E5FBA',
          'blue-bright': '#3B9DDC',
          deep: '#0A1B3A',
          cyan: '#5DD3FF',
          gold: '#F5C842',
          'gold-bright': '#FFDB6E',
        },
        solana: {
          purple: '#9945FF',
          'purple-deep': '#7d34d6',
          green: '#14F195',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        // Diagonal hero glow used behind the headline. CSS-only, no asset.
        'hero-glow':
          'radial-gradient(circle at 30% 20%, rgba(93,211,255,0.18), transparent 55%), radial-gradient(circle at 80% 70%, rgba(153,69,255,0.14), transparent 60%)',
      },
      boxShadow: {
        'hero-gold': '0 10px 30px -10px rgba(245,200,66,0.45)',
        'hero-purple': '0 10px 30px -10px rgba(153,69,255,0.45)',
      },
    },
  },
  plugins: [],
};
