// Footer — corporate identification + legal line + small social links.
// Uses the SVU corporate logo (different from the EUIPO SuperVictor mark used
// elsewhere) to position HeroPad as part of the SuperVictor Universe portfolio.
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-hero-blue/20 bg-hero-deep/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 md:flex-row md:justify-between">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <img
            src="/svu-logo.webp"
            alt="SuperVictor Universe"
            className="h-8 w-8 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span>
            © {year}{' '}
            <a
              href="https://supervictornft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-hero-cyan transition"
            >
              SuperVictor Universe
            </a>
            . Fidelizare digitală pentru localuri.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <a href="/privacy" className="hover:text-hero-cyan transition">
            Privacy
          </a>
          <a href="/terms" className="hover:text-hero-cyan transition">
            Terms
          </a>
          <a
            href="https://supervictor.shop"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-hero-gold transition"
          >
            Shop
          </a>
          <a
            href="https://supervictornft.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-hero-cyan transition"
          >
            Hall of Heroes
          </a>
          <a
            href="https://github.com/dnsv123/heropad"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-hero-cyan transition"
          >
            GitHub
          </a>
          <a
            href="https://x.com/SVictorUniverse"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-hero-cyan transition"
          >
            X
          </a>
          <span className="text-slate-600">v1.0</span>
        </div>
      </div>
    </footer>
  );
}
