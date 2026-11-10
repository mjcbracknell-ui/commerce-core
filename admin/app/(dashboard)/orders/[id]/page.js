'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, formatDate, formatMoney } from '../../../../lib/api';

export default function OrderDetailPage() {
  const params = useParams();
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [carrier, setCarrier] = useState('');
  const [quantities, setQuantities] = useState({});
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [returnForm, setReturnForm] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/admin/orders/${params.id}`);
      setOrder(data.order);
      setTracking(data.order.tracking_number || '');
      setTrackingUrl(data.order.tracking_url || '');

      const shipments = data.order.fulfillments || [];
      const lastShipment = shipments[shipments.length - 1];
      setCarrier(lastShipment?.carrier || '');

      const shipped = new Map();
      for (const shipment of shipments) {
        for (const item of shipment.line_items || []) {
          if (!item.variantId) continue;
          shipped.set(item.variantId, (shipped.get(item.variantId) || 0) + Number(item.quantity || 0));
        }
      }

      const nextQuantities = {};
      for (const item of data.order.line_items || []) {
        const remaining = Math.max(0, Number(item.quantity || 0) - (shipped.get(item.variantId) || 0));
        if (item.variantId && remaining > 0) nextQuantities[item.variantId] = remaining;
      }
      setQuantities(nextQuantities);
      setError('');
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

  const setQuantity = (variantId, max, value) => {
    const next = Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
    setQuantities((current) => ({ ...current, [variantId]: next }));
  };

  const startReturn = () => {
    const items = {};
    const reasons = {};
    for (const item of order?.returnable_items || []) {
      items[item.variantId] = 0;
      reasons[item.variantId] = 'other';
    }
    setReturnForm({ items, reasons, resolution: 'refund', note: '' });
  };

  const createReturn = async () => {
    const items = Object.entries(returnForm.items)
      .map(([variantId, quantity]) => ({
        variantId,
        quantity: Number(quantity) || 0,
        reason: returnForm.reasons[variantId] || 'other',
      }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      setError('Choose at least one item to return.');
      return;
    }
    await run('Return created.', () =>
      api(`/api/admin/orders/${order.id}/returns`, {
        method: 'POST',
        body: {
          items,
          resolution: returnForm.resolution,
          ...(returnForm.note ? { note: returnForm.note } : {}),
        },
      }),
    );
    setReturnForm(null);
  };

  const completeExchange = (record) => {
    const trackingNumber = window.prompt('Replacement tracking number (optional):') || '';
    const trackingUrl = trackingNumber ? window.prompt('Tracking URL (optional):') || '' : '';
    run('Exchange completed.', () =>
      api(`/api/admin/returns/${record.id}/exchange`, {
        method: 'POST',
        body: { trackingNumber: trackingNumber || undefined, trackingUrl: trackingUrl || undefined },
      }),
    );
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
  const lineItems = order.line_items || [];
  const shipments = order.fulfillments || [];
  const shippedByVariant = {};
  for (const shipment of shipments) {
    for (const item of shipment.line_items || []) {
      if (!item.variantId) continue;
      shippedByVariant[item.variantId] =
        (shippedByVariant[item.variantId] || 0) + Number(item.quantity || 0);
    }
  }
  const remainingFor = (item) =>
    item.variantId ? Math.max(0, Number(item.quantity || 0) - (shippedByVariant[item.variantId] || 0)) : 0;
  const totalRemaining = lineItems.reduce((sum, item) => sum + remainingFor(item), 0);
  const selectedCount = Object.values(quantities).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
  const returns = order.returns || [];
  const returnable = order.returnable_items || [];
  const returnReasons = [
    ['wrong_size', 'Wrong size or fit'],
    ['damaged', 'Damaged or faulty'],
    ['not_as_described', 'Not as described'],
    ['changed_mind', 'Changed my mind'],
    ['other', 'Other'],
  ];

  const createShipment = () => {
    const items = Object.entries(quantities)
      .map(([variantId, quantity]) => ({ variantId, quantity: Number(quantity) || 0 }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      setError('Choose at least one item to ship.');
      return;
    }
    run('Shipment created.', () =>
      api(`/api/admin/orders/${order.id}/fulfill`, {
        method: 'POST',
        body: {
          items,
          ...(tracking ? { trackingNumber: tracking } : {}),
          ...(trackingUrl ? { trackingUrl } : {}),
          ...(carrier ? { carrier } : {}),
          notifyCustomer,
        },
      }),
    );
  };

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
                <span className={`badge ${order.fulfillment_status}`}>
                  {order.fulfillment_status.replace('_', ' ')}
                </span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Shipped</th>
                    <th>To ship</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => {
                    const remaining = remainingFor(item);
                    const shipped = Number(item.quantity || 0) - remaining;
                    return (
                      <tr key={item.variantId || index}>
                        <td>
                          {item.title}
                          <div className="muted small">{item.variantTitle}</div>
                        </td>
                        <td className="muted">{item.sku || '—'}</td>
                        <td>{item.quantity}</td>
                        <td>{shipped}</td>
                        <td>
                          {item.variantId && remaining > 0 ? (
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              value={quantities[item.variantId] ?? 0}
                              onChange={(event) => setQuantity(item.variantId, remaining, event.target.value)}
                              aria-label={`Quantity of ${item.title} to ship`}
                              style={{ width: 82 }}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {formatMoney(item.price * item.quantity, order.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Fulfilment</h2>
            {totalRemaining === 0 ? (
              <p className="muted small">All items have been fulfilled.</p>
            ) : (
              <>
                <p className="muted small">Choose quantities to create a shipment. Leave a quantity unchanged to ship all remaining items.</p>
                <div className="field">
                  <label htmlFor="carrier">Carrier</label>
                  <input
                    id="carrier"
                    value={carrier}
                    onChange={(event) => setCarrier(event.target.value)}
                    placeholder="UPS, FedEx, Royal Mail…"
                  />
                </div>
                <div className="field">
                  <label htmlFor="tracking">Tracking number</label>
                  <input
                    id="tracking"
                    value={tracking}
                    onChange={(event) => setTracking(event.target.value)}
                    placeholder="1Z999AA10123456784"
                  />
                </div>
                <div className="field">
                  <label htmlFor="trackingUrl">Tracking URL</label>
                  <input
                    id="trackingUrl"
                    type="url"
                    value={trackingUrl}
                    onChange={(event) => setTrackingUrl(event.target.value)}
                    placeholder="https://carrier.example/track/…"
                  />
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={notifyCustomer}
                    onChange={(event) => setNotifyCustomer(event.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Email the customer about this shipment
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={busy || selectedCount === 0}
                  style={{ width: '100%' }}
                  onClick={createShipment}
                >
                  {busy ? 'Creating shipment…' : `Ship ${selectedCount} item${selectedCount === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>

          <div className="card">
            <h2>Shipments</h2>
            {shipments.length ? (
              shipments.map((shipment, index) => (
                <div className="shipment" key={shipment.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <strong>Shipment {index + 1}</strong>
                    <span className={`badge ${shipment.status}`}>{shipment.status}</span>
                  </div>
                  <p className="muted small" style={{ margin: '4px 0' }}>
                    {formatDate(shipment.created_at, true)}
                    {shipment.carrier ? ` · ${shipment.carrier}` : ''}
                  </p>
                  <p style={{ margin: '6px 0' }}>
                    {(shipment.line_items || [])
                      .map((item) => `${item.title} × ${item.quantity}`)
                      .join(', ')}
                  </p>
                  {shipment.tracking_number ? (
                    <p className="small" style={{ margin: '4px 0' }}>
                      Tracking: <strong>{shipment.tracking_number}</strong>
                    </p>
                  ) : null}
                  {shipment.tracking_url ? (
                    <a
                      href={shipment.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="small"
                      style={{ textDecoration: 'underline' }}
                    >
                      Track shipment ↗
                    </a>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="muted small">No shipments yet.</p>
            )}
          </div>

          <div className="card">
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Returns &amp; exchanges</h2>
              {returnable.length > 0 && !returnForm ? (
                <button className="btn secondary small" type="button" onClick={startReturn}>
                  Create return
                </button>
              ) : null}
            </div>

            {returnForm ? (
              <div style={{ marginTop: 12 }}>
                {returnable.map((item) => (
                  <div className="field" key={item.variantId}>
                    <label>{item.title}{item.variantTitle ? ` — ${item.variantTitle}` : ''}</label>
                    <div className="row">
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
                        aria-label={`Quantity of ${item.title} to return`}
                      />
                      <select
                        value={returnForm.reasons[item.variantId] || 'other'}
                        onChange={(event) =>
                          setReturnForm((current) => ({
                            ...current,
                            reasons: { ...current.reasons, [item.variantId]: event.target.value },
                          }))
                        }
                        aria-label={`Reason for returning ${item.title}`}
                      >
                        {returnReasons.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <span className="hint">{item.quantity} available to return</span>
                  </div>
                ))}
                <div className="field">
                  <label>Resolution</label>
                  <select
                    value={returnForm.resolution}
                    onChange={(event) => setReturnForm((current) => ({ ...current, resolution: event.target.value }))}
                  >
                    <option value="refund">Refund</option>
                    <option value="exchange">Exchange</option>
                  </select>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    value={returnForm.note}
                    onChange={(event) => setReturnForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder={returnForm.resolution === 'exchange' ? 'Replacement preferences…' : 'Return notes…'}
                  />
                </div>
                <div className="btn-row">
                  <button className="btn accent" type="button" disabled={busy} onClick={createReturn}>
                    Create return
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setReturnForm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {returns.length ? (
              returns.map((record) => (
                <div className="shipment" key={record.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <strong>{record.resolution === 'exchange' ? 'Exchange' : 'Return'}</strong>
                    <span className={`badge ${record.status}`}>{record.status}</span>
                  </div>
                  <p className="muted small" style={{ margin: '4px 0' }}>
                    {formatDate(record.created_at, true)} · {record.requested_by}
                  </p>
                  <p style={{ margin: '6px 0' }}>
                    {(record.line_items || [])
                      .map((item) => `${item.title} × ${item.quantity} (${item.reason})`)
                      .join(', ')}
                  </p>
                  {record.note ? <p className="muted small">{record.note}</p> : null}
                  {record.refund_amount > 0 ? (
                    <p className="small">Refunded {formatMoney(record.refund_amount, order.currency)}</p>
                  ) : null}
                  {record.exchange_tracking_number ? (
                    <p className="small">Replacement tracking: <strong>{record.exchange_tracking_number}</strong></p>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    {record.status === 'requested' ? (
                      <>
                        <button
                          className="btn secondary small"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run('Return marked received and restocked.', () =>
                              api(`/api/admin/returns/${record.id}/receive`, {
                                method: 'POST',
                                body: { restock: true },
                              }),
                            )
                          }
                        >
                          Receive &amp; restock
                        </button>
                        <button
                          className="btn danger small"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm('Reject this return?')) return;
                            run('Return rejected.', () =>
                              api(`/api/admin/returns/${record.id}/reject`, { method: 'POST' }),
                            );
                          }}
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {record.status === 'received' && record.resolution === 'refund' ? (
                      <button
                        className="btn accent small"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Refund the returned items for this order?`)) return;
                          run('Refund recorded.', () =>
                            api(`/api/admin/returns/${record.id}/refund`, {
                              method: 'POST',
                              body: { notifyCustomer: true },
                            }),
                          );
                        }}
                      >
                        Refund returned items
                      </button>
                    ) : null}
                    {record.status === 'received' && record.resolution === 'exchange' ? (
                      <button
                        className="btn accent small"
                        type="button"
                        disabled={busy}
                        onClick={() => completeExchange(record)}
                      >
                        Complete exchange
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted small" style={{ marginTop: 12 }}>No returns or exchanges yet.</p>
            )}
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
