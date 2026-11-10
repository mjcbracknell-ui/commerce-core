import { redirect } from 'next/navigation';

export default function OrderLookupPage({ searchParams }) {
  const number = (searchParams?.number || '').trim();
  const email = (searchParams?.email || '').trim();

  if (number && email) {
    redirect(`/orders/${encodeURIComponent(number)}?email=${encodeURIComponent(email)}`);
  }

  return (
    <main className="container narrow page">
      <h1>Find your order</h1>
      <p style={{ color: 'var(--muted)' }}>Use the order number from your confirmation email.</p>
      <form method="get" action="/orders/lookup" style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="number">Order number</label>
          <input id="number" name="number" placeholder="1001" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>
        <button className="btn" type="submit">
          Find order
        </button>
      </form>
    </main>
  );
}
