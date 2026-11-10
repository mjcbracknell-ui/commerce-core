'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, formatDate, formatMoney } from '../../../../lib/api';

export default function OrderDetailPage() {
  const params = useParams();
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/admin/orders/${params.id}`);
      setOrder(data.order);
      setTracking(data.order.tracking_number || '');
    } catch (err) {
      setError(err.message);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (label, fn) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await load();
      setMessage(label);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <>
        <div className="topbar">
          <h1>Order</h1>
        </div>
        {error ? <div className="notice error">{error}</div> : <p className="muted">Loading order…</p>}
      </>
    );
  }

  const address = order.shipping_address || {};
  const amountPaid = order.financial_status === 'paid' || order.financial_status === 'refunded';

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Order #{order.number}</h1>
          <p>
            {formatDate(order.created_at, true)} · {order.email}
          </p>
        </div>
        <div className="topbar-actions">
          <Link href="/orders" className="btn secondary">
            All orders
          </Link>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="split">
        <div>
          <div className="card">
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Items</h2>
              <div>
                <span className={`badge ${order.financial_status}`}>{order.financial_status.replace('_', ' ')}</span>{' '}
                <span className={`badge ${order.fulfillment_status}`}>{order.fulfillment_status}</span>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.line_items.map((item) => (
                  <tr key={item.variantId}>
                    <td>
                      {item.title}
                      <div className="muted small">{item.variantTitle}</div>
                    </td>
                    <td className="muted">{item.sku || '—'}</td>
                    <td>{item.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(item.price * item.quantity, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ maxWidth: 320, marginLeft: 'auto', marginTop: 16 }}>
              <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span className="muted">Subtotal</span>
                <span>{formatMoney(order.subtotal, order.currency)}</span>
              </div>
              {order.discount_total > 0 ? (
                <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--accent)' }}>
                  <span>Discount {order.discount_code ? `(${order.discount_code})` : ''}</span>
                  <span>−{formatMoney(order.discount_total, order.currency)}</span>
                </div>
              ) : null}
              <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span className="muted">Shipping</span>
                <span>{formatMoney(order.shipping_total, order.currency)}</span>
              </div>
              <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span className="muted">Tax</span>
                <span>{formatMoney(order.tax_total, order.currency)}</span>
              </div>
              <div
                className="summary-row"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', fontWeight: 600 }}
              >
                <span>Total</span>
                <span>{formatMoney(order.total, order.currency)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Notes</h2>
            {order.notes ? <p>{order.notes}</p> : <p className="muted">No notes from the customer.</p>}
            {order.tracking_number ? (
              <p>
                Tracking number: <strong>{order.tracking_number}</strong>
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Fulfilment</h2>
            <div className="field">
              <label htmlFor="tracking">Tracking number</label>
              <input
                id="tracking"
                value={tracking}
                onChange={(event) => setTracking(event.target.value)}
                placeholder="1Z999AA10123456784"
              />
            </div>
            <button
              className="btn"
              type="button"
              disabled={busy || order.fulfillment_status === 'fulfilled'}
              style={{ width: '100%' }}
              onClick={() =>
                run('Order marked as fulfilled.', () =>
                  api(`/api/admin/orders/${order.id}/fulfill`, {
                    method: 'POST',
                    body: { trackingNumber: tracking || undefined, notifyCustomer: true },
                  }),
                )
              }
            >
              {order.fulfillment_status === 'fulfilled' ? 'Fulfilled' : 'Mark fulfilled'}
            </button>
          </div>

          <div className="card">
            <h2>Payment</h2>
            <p className="muted small">
              {amountPaid ? `Paid on ${formatDate(order.paid_at)}` : 'Payment has not been captured yet.'}
            </p>
            <div className="btn-row">
              <button
                className="btn secondary"
                type="button"
                disabled={busy || order.financial_status === 'paid'}
                onClick={() => run('Order marked as paid.', () => api(`/api/admin/orders/${order.id}/mark-paid`, { method: 'POST' }))}
              >
                Mark paid
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={busy || order.financial_status === 'refunded'}
                onClick={() => {
                  if (!window.confirm('Refund this order in full?')) return;
                  run('Refund recorded.', () => api(`/api/admin/orders/${order.id}/refund`, { method: 'POST', body: { notifyCustomer: true } }));
                }}
              >
                Refund
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busy || Boolean(order.canceled_at)}
                onClick={() => {
                  if (!window.confirm('Cancel this order and restock inventory?')) return;
                  run('Order cancelled.', () =>
                    api(`/api/admin/orders/${order.id}/cancel`, { method: 'POST', body: { restock: true, reason: 'Cancelled from admin' } }),
                  );
                }}
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Customer</h2>
            <div className="kv">
              <dt>Email</dt>
              <dd>{order.email}</dd>
              <dt>Name</dt>
              <dd>
                {[address.first_name, address.last_name].filter(Boolean).join(' ') || order.customer?.name || '—'}
              </dd>
              <dt>Phone</dt>
              <dd>{address.phone || order.customer?.phone || '—'}</dd>
            </div>
          </div>

          <div className="card">
            <h2>Shipping address</h2>
            {address.address1 ? (
              <address style={{ fontStyle: 'normal', lineHeight: 1.7 }}>
                {address.address1}
                <br />
                {address.address2 ? (
                  <>
                    {address.address2}
                    <br />
                  </>
                ) : null}
                {[address.city, address.region, address.postal_code].filter(Boolean).join(', ')}
                <br />
                {address.country}
              </address>
            ) : (
              <p className="muted">No shipping address on file.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
