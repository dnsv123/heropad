import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
// Cookieless, anonymous page analytics — consistent with the privacy policy's
// "no advertising cookies and no third-party trackers" promise (GA4 would
// break it and drag in a consent banner). No-ops until the Vercel dashboard
// toggle is on.
import { Analytics } from '@vercel/analytics/react';

import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Claim from './pages/Claim';
import Profile from './pages/Profile';
import Play from './pages/Play';
import Loyalty from './pages/Loyalty';
import Passport from './pages/Passport';
// Merchant + admin screens load on demand: they pull in the QR scanner and
// jsQR (~250 KB) which a CUSTOMER opening their loyalty card must never pay
// for on café cellular. Privy stays eager in main.tsx — only routes split.
const Business = lazy(() => import('./pages/Business'));
const Admin = lazy(() => import('./pages/Admin'));
const Partner = lazy(() => import('./pages/Partner'));
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

// Top-level layout: shared <Header/> + <Footer/> on every page, page content
// rendered between them via React Router. The flex column + min-h-screen
// pattern pins the footer to the bottom even on short pages.
//
// All routes are rewritten to /index.html on Vercel (see vercel.json), which
// keeps deep-links like /claim?c=ABC working when shared as QR / NFC URLs.
export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-hero-deep text-slate-100">
      <Header />
      <main className="flex-1">
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/v-dash" element={<Play />} />
          <Route path="/loyalty/:slug" element={<Loyalty />} />
          <Route path="/loyalty" element={<Loyalty />} />
          <Route path="/passport" element={<Passport />} />
          <Route path="/business" element={<Business />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/partner" element={<Partner />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          {/* Catch-all: send unknown paths back to the landing page. */}
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
      </main>
      <Footer />
      <Analytics />
    </div>
  );
}
