'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatDate, formatMoney } from '../../lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/analytics/summary')
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Dashboard</h1>
          </div>
        </div>
        <div className="notice error">{error}</div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <div className="topbar">
          <h1>Dashboard</h1>
        </div>
        <p className="muted">Loading analytics…</p>
      </>
    );
  }

  const maxRevenue = Math.max(...stats.sales_last_30_days.map((day) => day.revenue), 1);
  const currency = 'USD';

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Revenue, orders and catalog health at a glance.</p>
        </div>
        <div className="topbar-actions">
          <Link href="/products/new" className="btn accent">
            New product
          </Link>
          <Link href="/orders" className="btn secondary">
            View orders
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Revenue</div>
          <div className="value">{formatMoney(stats.revenue, currency)}</div>
          <div className="sub">{stats.paid_orders_count} paid orders</div>
        </div>
        <div className="stat">
          <div className="label">Orders</div>
          <div className="value">{stats.orders_count}</div>
          <div className="sub">{formatMoney(stats.revenue_last_30_days, currency)} in the last 30 days</div>
        </div>
        <div className="stat">
          <div className="label">Average order</div>
          <div className="value">{formatMoney(stats.average_order_value, currency)}</div>
          <div className="sub">Across paid orders</div>
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{stats.customers_count}</div>
          <div className="sub">{stats.products_count} products · {stats.low_stock_count} low stock</div>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Revenue · last 30 days</h2>
          <div className="chart">
            {stats.sales_last_30_days.map((day) => (
              <div
                key={day.date}
                className="bar"
                title={`${day.date}: ${formatMoney(day.revenue, currency)} (${day.orders} orders)`}
                style={{ height: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%`, opacity: day.revenue ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="chart-legend">
            <span>{stats.sales_last_30_days[0]?.date}</span>
            <span>{stats.sales_last_30_days[stats.sales_last_30_days.length - 1]?.date}</span>
          </div>
        </div>

        <div className="card">
          <h2>Top products</h2>
          {stats.top_products.length ? (
            <table className="table">
              <tbody>
                {stats.top_products.map((product) => (
                  <tr key={product.product_id || product.title}>
                    <td>{product.title}</td>
                    <td className="muted">{product.quantity} sold</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(product.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No paid orders yet.</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Recent orders</h2>
          <Link href="/orders" className="btn secondary small">
            All orders
          </Link>
        </div>
        {stats.recent_orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/orders/${order.id}`}>#{order.number}</Link>
                    </td>
                    <td className="muted">{formatDate(order.created_at)}</td>
                    <td>{order.email}</td>
                    <td>
                      <span className={`badge ${order.financial_status}`}>{order.financial_status}</span>{' '}
                      <span className={`badge ${order.fulfillment_status}`}>{order.fulfillment_status}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(order.total, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No orders yet. Share your storefront to get the first one.</p>
        )}
      </div>
    </>
  );
}
