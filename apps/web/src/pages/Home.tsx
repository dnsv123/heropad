import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import WhySolana from '../components/WhySolana';

// TODO: wire the landing page sections in a single scroll narrative.
export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhySolana />
    </>
  );
}
