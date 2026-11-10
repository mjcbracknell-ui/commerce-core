'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatDate, formatMoney } from '../../../lib/api';

const blank = { email: '', firstName: '', lastName: '', phone: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      const data = await api(`/api/admin/customers?${params.toString()}`);
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.message);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/admin/customers', { method: 'POST', body: form });
      setForm(blank);
      setShowForm(false);
      setMessage('Customer created.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Customers</h1>
          <p>Everyone who has ordered or been added manually.</p>
        </div>
        <div className="topbar-actions">
          <button className="btn accent" type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Close form' : 'New customer'}
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {showForm ? (
        <form className="card" onSubmit={submit}>
          <h2>New customer</h2>
          <div className="row">
            <div className="field">
              <label>Email</label>
              <input type="email" required value={form.email} onChange={update('email')} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={update('phone')} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>First name</label>
              <input value={form.firstName} onChange={update('firstName')} />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={form.lastName} onChange={update('lastName')} />
            </div>
          </div>
          <button className="btn accent" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create customer'}
          </button>
        </form>
      ) : null}

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {customers.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Orders</th>
                  <th style={{ textAlign: 'right' }}>Total spent</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                      {customer.tags?.length ? <div className="muted small">{customer.tags.join(', ')}</div> : null}
                    </td>
                    <td className="muted">{customer.email}</td>
                    <td>{customer.orders_count}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(customer.total_spent)}</td>
                    <td className="muted">{formatDate(customer.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No customers yet.</div>
        )}
      </div>
    </>
  );
}
