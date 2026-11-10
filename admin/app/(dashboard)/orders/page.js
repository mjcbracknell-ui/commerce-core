'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatDate, formatMoney } from '../../../lib/api';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [financial, setFinancial] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (financial) params.set('financial_status', financial);
      if (fulfillment) params.set('fulfillment_status', fulfillment);
      const data = await api(`/api/admin/orders?${params.toString()}`);
      setOrders(data.orders || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, financial, fulfillment]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Orders</h1>
          <p>Fulfil, refund and track every order.</p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search order number or email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={financial} onChange={(event) => setFinancial(event.target.value)}>
            <option value="">All payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partially refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={fulfillment} onChange={(event) => setFulfillment(event.target.value)}>
            <option value="">All fulfilment</option>
            <option value="unfulfilled">Unfulfilled</option>
            <option value="partially_fulfilled">Partially fulfilled</option>
            <option value="fulfilled">Fulfilled</option>
          </select>
          {loading ? <span className="muted small">Loading…</span> : null}
        </div>

        {orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Fulfilment</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/orders/${order.id}`}>
                        <strong>#{order.number}</strong>
                      </Link>
                    </td>
                    <td className="muted">{formatDate(order.created_at, true)}</td>
                    <td>{order.email}</td>
                    <td>
                      <span className={`badge ${order.financial_status}`}>{order.financial_status.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <span className={`badge ${order.fulfillment_status}`}>{order.fulfillment_status}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(order.total, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">{loading ? 'Loading orders…' : 'No orders match these filters.'}</div>
        )}
      </div>
    </>
  );
}
