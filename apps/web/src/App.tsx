import { Suspense, lazy, useEffect, useLayoutEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { noteRoute } from './lib/auth';

/** Tells the auth bridge where we are, so the SDK loads the moment a route
 *  that may need a session is entered — and never on the landing alone. */
function AuthRouteWatcher() {
  const { pathname } = useLocation();
  useEffect(() => {
    noteRoute(pathname);
  }, [pathname]);
  return null;
}

/**
 * Removes the static first screen from index.html the instant React has
 * committed the real one — and BEFORE the browser paints that commit.
 *
 * Why a layout effect and not an effect + frame: the placeholder sits above
 * #root in the DOM. If even one frame is painted with both present, the
 * page shows two heroes stacked and then jumps a full viewport when the
 * placeholder goes — Lighthouse scored exactly that as CLS 1. A layout
 * effect runs after the DOM mutation and before paint, so no such frame
 * can exist: the browser's first paint of React's tree is already without
 * the placeholder, in the same position.
 */
function PreheroRemover() {
  useLayoutEffect(() => {
    document.getElementById('prehero')?.remove();
  }, []);
  return null;
}
// Cookieless, anonymous page analytics — consistent with the privacy policy's
// "no advertising cookies and no third-party trackers" promise (GA4 would
// break it and drag in a consent banner). No-ops until the Vercel dashboard
// toggle is on.
import { Analytics } from '@vercel/analytics/react';

import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
// Profile and Loyalty used to be eager "because customers land there". They
// do — but never from the landing page in the same session, and the landing
// is the page whose first paint sells the product. Lazy here takes the QR
// library and two pages' worth of components off the critical path.
const Profile = lazy(() => import('./pages/Profile'));
const Loyalty = lazy(() => import('./pages/Loyalty'));
// Merchant + admin screens load on demand: they pull in the QR scanner and
// jsQR (~250 KB) which a CUSTOMER opening their loyalty card must never pay
// for on café cellular. Privy stays eager in main.tsx — only routes split.
// Claim/Play/Passport join them: none is on the landing's critical path,
// and every KB out of the entry chunk is Speed Index for the pitch page.
const Business = lazy(() => import('./pages/Business'));
const Admin = lazy(() => import('./pages/Admin'));
const Partner = lazy(() => import('./pages/Partner'));
const Claim = lazy(() => import('./pages/Claim'));
const Play = lazy(() => import('./pages/Play'));
const Passport = lazy(() => import('./pages/Passport'));
const Rewards = lazy(() => import('./pages/Rewards'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));

// Top-level layout: shared <Header/> + <Footer/> on every page, page content
// rendered between them via React Router. The flex column + min-h-screen
// pattern pins the footer to the bottom even on short pages.
//
// All routes are rewritten to /index.html on Vercel (see vercel.json), which
// keeps deep-links like /claim?c=ABC working when shared as QR / NFC URLs.
export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-hero-deep text-slate-100">
      <AuthRouteWatcher />
      <PreheroRemover />
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
          <Route path="/rewards" element={<Rewards />} />
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
