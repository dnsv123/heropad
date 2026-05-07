import { Route, Routes } from 'react-router-dom';

import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Claim from './pages/Claim';
import Profile from './pages/Profile';
import Play from './pages/Play';

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/v-dash" element={<Play />} />
          {/* Catch-all: send unknown paths back to the landing page. */}
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
