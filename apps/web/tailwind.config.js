/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // HeroPad design system v2 — "a real app, not a game".
      //
      //   Ground:  ONE navy in three steps (deep → navy → navy2). Depth comes
      //            from stepping the surface, never from shadows or glows.
      //   Colour:  ONE full colour — gold — and it means "you can press this
      //            or win this". Cyan is ink only (eyebrows, lines, codes),
      //            never a fill. Green is reserved for "it worked".
      //   Motion:  150ms, one curve, transform/opacity only.
      //
      // "solana" tokens stay for the few crypto-context screens (wallet,
      // on-chain states) — they are deliberately absent from the landing and
      // the customer card.
      colors: {
        hero: {
          blue: '#1E5FBA',
          'blue-bright': '#3B9DDC',
          deep: '#0A1B3A',
          navy: '#0F2450',
          navy2: '#15306A',
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
        // A faint navy wash at the top of a page — the only "atmosphere" we
        // allow. It used to be a cyan + purple double glow; that read as a
        // game lobby. Same class name so nothing else had to change.
        'hero-glow':
          'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(21,48,106,0.6), transparent)',
      },
      boxShadow: {
        // Glows are retired. The tokens remain so older call sites keep
        // compiling, but every one of them now renders flat.
        'hero-gold': '0 0 #0000',
        'hero-purple': '0 0 #0000',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        // Transform-only, so it never touches LCP or layout.
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
