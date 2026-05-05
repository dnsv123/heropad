import ClaimFlow from '../components/ClaimFlow';

// TODO: read claim code from URL params, validate via API, then run ClaimFlow.
export default function Claim() {
  return (
    <section className="px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Claim your hero</h1>
      <div className="mt-8">
        <ClaimFlow />
      </div>
    </section>
  );
}
