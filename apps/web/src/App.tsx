import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import WhySolana from './components/WhySolana';

// TODO: replace with React Router once Claim + Profile pages are wired up.
export default function App() {
  return (
    <main className="min-h-screen">
      <Hero />
      <HowItWorks />
      <WhySolana />
    </main>
  );
}
