export default function ConversionCard() {
  return (
    <div className="rounded-2xl border border-canvas-line bg-white px-6 py-6 shadow-card">
      <p className="text-base font-semibold text-semantic-heading">
        Most people who read these stories end up traveling with us.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <a
          href="/trips"
          className="inline-flex items-center justify-center rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          Explore upcoming trips
        </a>
        <a
          href="/community"
          className="inline-flex items-center justify-center rounded-full border border-brand-primary px-5 py-2.5 text-sm font-semibold text-semantic-heading transition hover:border-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          Join the Musafir community
        </a>
      </div>
    </div>
  );
}
