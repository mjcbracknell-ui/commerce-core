import Link from 'next/link';

export default function StoreNotFound() {
  return (
    <main className="container page">
      <p className="eyebrow">Storefront</p>
      <h1>This store does not exist.</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 520 }}>
        No storefront is configured for this domain. Check the address, or ask the store owner for their link.
      </p>
      <Link href="/" className="btn secondary">
        Back to the homepage
      </Link>
    </main>
  );
}