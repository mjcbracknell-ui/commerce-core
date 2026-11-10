'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../../lib/client';
import { formatDate, formatMoney } from '../../../../lib/money';

const reasons = [
  { value: 'wrong_size', label: 'Wrong size or fit' },
  { value: 'damaged', label: 'Damaged or faulty' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'other', label: 'Other' },
];

const statusLabel = (value) => String(value || '').replace(/_/g, ' ');

export default function AccountOrderPage({ params }) {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [returnForm, setReturnForm] = useState(null);
  const [returnError, setReturnError] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/storefront/account/orders/${encodeURIComponent(params.number)}`);
      setOrder(data.order);
      setError('');
    } catch (err) {
      if (err.status === 401) {
        router.replace(`/account/login?next=${encodeURIComponent(`/account/orders/${params.number}`)}`);
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.number, router]);

  useEffect(() => {
    load();
  }, [load]);

  const startReturn = () => {
    const items = {};
    for (const item of order?.returnable_items || []) items[item.variantId] = 0;
    setReturnForm({ items, reasons: {}, resolution: 'refund', note: '' });
    setReturnError('');
  };

  const submitReturn = async (event) => {
    event.preventDefault();
    const items = Object.entries(returnForm.items)
      .map(([variantId, quantity]) => ({
        variantId,
        quantity: Number(quantity) || 0,
        reason: returnForm.reasons[variantId] || 'other',
      }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      setReturnError('Choose at least one item to return.');
      return;
    }
    setSavingReturn(true);
    setReturnError('');
    try {
      await apiFetch(`/api/storefront/account/orders/${encodeURIComponent(params.number)}/returns`, {
        method: 'POST',
        body: { items, resolution: returnForm.resolution, note: returnForm.note || undefined },
      });
      setReturnForm(null);
      await load();
    } catch (err) {
      setReturnError(err.message);
    } finally {
      setSavingReturn(false);
    }
  };

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

  const returns = order.returns || [];
  const returnable = order.returnable_items || [];

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
          <span className={`pill ${order.financial_status}`}>{statusLabel(order.financial_status)}</span>
          <span className={`pill ${order.fulfillment_status}`}>{statusLabel(order.fulfillment_status)}</span>
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
          {order.refunded_total > 0 ? (
            <div className="summary-row discount">
              <span>Refunded</span>
              <span>−{formatMoney(order.refunded_total, order.currency)}</span>
            </div>
          ) : null}
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatMoney(order.total, order.currency)}</span>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <div className="account-panel-head">
            <h2 style={{ fontSize: '1.4rem' }}>Returns &amp; exchanges</h2>
            {returnable.length > 0 && !returnForm ? (
              <button className="btn secondary small" type="button" onClick={startReturn}>
                Request a return
              </button>
            ) : null}
          </div>

          {returns.length ? (
            returns.map((record) => (
              <div key={record.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
                <p style={{ margin: '0 0 4px' }}>
                  <strong>{record.resolution === 'exchange' ? 'Exchange' : 'Return'}</strong>{' '}
                  <span className={`pill ${record.status}`}>{statusLabel(record.status)}</span>
                </p>
                <p className="product-meta">
                  {(record.line_items || [])
                    .map((item) => `${item.title} × ${item.quantity} (${statusLabel(item.reason)})`)
                    .join(', ')}
                </p>
                {record.note ? <p className="product-meta">{record.note}</p> : null}
                {record.refund_amount > 0 ? (
                  <p className="product-meta">Refunded {formatMoney(record.refund_amount, order.currency)}</p>
                ) : null}
                {record.exchange_tracking_number ? (
                  <p className="product-meta">
                    Replacement tracking: <strong>{record.exchange_tracking_number}</strong>
                  </p>
                ) : null}
                {record.exchange_tracking_url ? (
                  <a className="link-arrow" href={record.exchange_tracking_url} target="_blank" rel="noreferrer">
                    Track replacement ↗
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <p className="product-meta">No returns or exchanges on this order.</p>
          )}

          {returnForm ? (
            <form className="account-form" onSubmit={submitReturn} style={{ marginTop: 18 }}>
              {returnError ? <div className="notice error">{returnError}</div> : null}
              {returnable.map((item) => (
                <div className="row" key={item.variantId}>
                  <div className="field">
                    <label>
                      {item.title}
                      {item.variantTitle ? ` — ${item.variantTitle}` : ''}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={item.quantity}
                      value={returnForm.items[item.variantId] ?? 0}
                      onChange={(event) =>
                        setReturnForm((current) => ({
                          ...current,
                          items: {
                            ...current.items,
                            [item.variantId]: Math.max(0, Math.min(item.quantity, Number(event.target.value) || 0)),
                          },
                        }))
                      }
                    />
                    <span className="product-meta">{item.quantity} available to return</span>
                  </div>
                  <div className="field">
                    <label>Reason</label>
                    <select
                      value={returnForm.reasons[item.variantId] || 'other'}
                      onChange={(event) =>
                        setReturnForm((current) => ({
                          ...current,
                          reasons: { ...current.reasons, [item.variantId]: event.target.value },
                        }))
                      }
                    >
                      {reasons.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <div className="field">
                <label htmlFor="returnResolution">Resolution</label>
                <select
                  id="returnResolution"
                  value={returnForm.resolution}
                  onChange={(event) => setReturnForm((current) => ({ ...current, resolution: event.target.value }))}
                >
                  <option value="refund">Refund</option>
                  <option value="exchange">Exchange</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="returnNote">Notes (optional)</label>
                <textarea
                  id="returnNote"
                  rows={3}
                  value={returnForm.note}
                  onChange={(event) => setReturnForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder={
                    returnForm.resolution === 'exchange'
                      ? 'Tell us what you would like instead.'
                      : 'Anything we should know?'
                  }
                />
              </div>
              <div className="account-form-actions">
                <button className="btn accent" type="submit" disabled={savingReturn}>
                  {savingReturn ? 'Submitting…' : 'Submit request'}
                </button>
                <button className="btn secondary" type="button" onClick={() => setReturnForm(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
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
