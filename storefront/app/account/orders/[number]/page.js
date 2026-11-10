'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../../lib/client';
import { formatDate, formatMoney } from '../../../../lib/money';

export default function AccountOrderPage({ params }) {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/storefront/account/orders/${encodeURIComponent(params.number)}`)
      .then((data) => {
        if (alive) setOrder(data.order);
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 401) {
          router.replace(`/account/login?next=${encodeURIComponent(`/account/orders/${params.number}`)}`);
          return;
        }
        setError(err.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [params.number, router]);

  if (loading) {
    return (
      <main className="container narrow page">
        <p style={{ color: 'var(--muted)' }}>Loading order…</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="container narrow page">
        <h1>Order not found</h1>
        <div className="notice error">{error || 'This order is not available on your account.'}</div>
        <p style={{ marginTop: 16 }}>
          <Link href="/account" className="link-arrow">Back to your account</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="container narrow page">
      <Link href="/account" className="link-arrow">← Back to account</Link>
      <div className="order-card" style={{ marginTop: 20 }}>
        <p className="eyebrow">Order details</p>
        <h1 style={{ fontSize: '2.2rem' }}>Order #{order.number}</h1>
        <p style={{ color: 'var(--muted)' }}>
          Placed {formatDate(order.created_at)} · Confirmation sent to {order.email}
        </p>
        <div className="order-status">
          <span className={`pill ${order.financial_status}`}>
            {order.financial_status.replace('_', ' ')}
          </span>
          <span className={`pill ${order.fulfillment_status}`}>
            {order.fulfillment_status.replace('_', ' ')}
          </span>
          <span className="pill">{order.payment_method}</span>
        </div>

        {order.fulfillments?.length ? (
          <div style={{ margin: '0 0 24px' }}>
            <h2 style={{ fontSize: '1.4rem' }}>Shipments</h2>
            {order.fulfillments.map((shipment, index) => (
              <div key={shipment.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
                <p style={{ margin: '0 0 4px' }}>
                  <strong>Shipment {index + 1}</strong> <span className="pill">{shipment.status}</span>
                </p>
                <p className="product-meta">
                  {(shipment.line_items || [])
                    .map((item) => `${item.title} × ${item.quantity}`)
                    .join(', ')}
                </p>
                {shipment.carrier ? <p className="product-meta">{shipment.carrier}</p> : null}
                {shipment.tracking_number ? (
                  <p style={{ margin: '6px 0' }}>
                    Tracking: <strong>{shipment.tracking_number}</strong>
                  </p>
                ) : null}
                {shipment.tracking_url ? (
                  <a className="link-arrow" href={shipment.tracking_url} target="_blank" rel="noreferrer">
                    Track shipment ↗
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

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
                <td style={{ textAlign: 'right' }}>
                  {formatMoney(item.price * item.quantity, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20, maxWidth: 320, marginLeft: 'auto' }}>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotal, order.currency)}</span>
          </div>
          {order.discount_total > 0 ? (
            <div className="summary-row discount">
              <span>Discount</span>
              <span>−{formatMoney(order.discount_total, order.currency)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Shipping</span>
            <span>{order.shipping_total > 0 ? formatMoney(order.shipping_total, order.currency) : 'Free'}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span>
            <span>{formatMoney(order.tax_total, order.currency)}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatMoney(order.total, order.currency)}</span>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <Link href="/collections/all" className="btn">
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
