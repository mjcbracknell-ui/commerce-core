import Link from 'next/link';
import { getOrder, getStore } from '../../../lib/api';
import { formatDate, formatMoney } from '../../../lib/money';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params, searchParams }) {
  const email = (searchParams?.email || '').trim();
  const paid = searchParams?.paid === '1';
  const [data, storeData] = await Promise.all([
    email ? getOrder(params.number, email) : Promise.resolve(null),
    getStore(),
  ]);

  const currency = data?.order?.currency || storeData?.store?.currency || 'USD';

  if (!email || !data?.order) {
    return (
      <main className="container narrow page">
        <h1>Order {params.number}</h1>
        <p style={{ color: 'var(--muted)' }}>
          Enter the email used at checkout to view this order.
        </p>
        <form method="get" style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required defaultValue={email} />
          </div>
          <button className="btn" type="submit">
            View order
          </button>
        </form>
        {email && !data?.order ? <div className="notice error" style={{ marginTop: 16 }}>No order found for that email.</div> : null}
      </main>
    );
  }

  const order = data.order;

  return (
    <main className="container narrow page">
      {paid ? <div className="notice success">Payment received — thank you!</div> : null}
      <div className="order-card" style={{ marginTop: paid ? 16 : 0 }}>
        <p className="eyebrow">Order confirmation</p>
        <h1 style={{ fontSize: '2.2rem' }}>Thanks, {order.customer?.first_name || 'friend'}.</h1>
        <p style={{ color: 'var(--muted)' }}>
          Order <strong>#{order.number}</strong> placed {formatDate(order.created_at)}. A confirmation was sent to{' '}
          {order.email}.
        </p>
        <div className="order-status">
          <span className={`pill ${order.financial_status}`}>{order.financial_status.replace('_', ' ')}</span>
          <span className="pill">{order.fulfillment_status}</span>
          <span className="pill">{order.payment_method}</span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.line_items.map((item) => (
              <tr key={item.variantId}>
                <td>
                  {item.title}
                  <div className="product-meta">{item.variantTitle}</div>
                </td>
                <td>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(item.price * item.quantity, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20, maxWidth: 320, marginLeft: 'auto' }}>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotal, currency)}</span>
          </div>
          {order.discount_total > 0 ? (
            <div className="summary-row discount">
              <span>Discount</span>
              <span>−{formatMoney(order.discount_total, currency)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Shipping</span>
            <span>{order.shipping_total > 0 ? formatMoney(order.shipping_total, currency) : 'Free'}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span>
            <span>{formatMoney(order.tax_total, currency)}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatMoney(order.total, currency)}</span>
          </div>
        </div>

        {order.tracking_number ? (
          <p style={{ marginTop: 20 }}>
            Tracking number: <strong>{order.tracking_number}</strong>
          </p>
        ) : null}

        <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/collections/all" className="btn">
            Continue shopping
          </Link>
          <Link href={`/orders/${order.number}?email=${encodeURIComponent(order.email)}`} className="btn secondary">
            Refresh status
          </Link>
        </div>
      </div>
    </main>
  );
}
