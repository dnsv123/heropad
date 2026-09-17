import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import ProductCarousel from '../components/ProductCarousel';
import ForBusinesses from '../components/ForBusinesses';
import ForWho from '../components/ForWho';
import LandingPricing from '../components/LandingPricing';
import Ecosystem from '../components/Ecosystem';

// Landing narrative, Power-Pass-first:
//   Hero (the promise) → How it works (customer journey) → the product →
//   For businesses (the sales section the gold CTA scrolls to) → who it fits
//   → pricing → Ecosystem (SuperVictor universe doors).
//
// No framer-motion on this page any more: every section renders at rest.
// Scroll-reveal fades cost a JS animation per card and made the landing feel
// like it was loading twice; a page that is simply there feels faster.
export default function Home() {
  return (
    <div className="relative">
      <Hero />
      <HowItWorks />
      <ProductCarousel />
      <ForBusinesses />
      <ForWho />
      <LandingPricing />
      <Ecosystem />
    </div>
  );
}
