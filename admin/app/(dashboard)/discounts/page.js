'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatDate, formatMoney } from '../../../lib/api';

const blank = { code: '', type: 'percentage', value: 10, usageLimit: '', minSubtotal: '', active: true, endsAt: '' };

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState([]);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/discounts');
      setDiscounts(data.discounts || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/admin/discounts', {
        method: 'POST',
        body: {
          code: form.code,
          type: form.type,
          value: Number(form.value) || 0,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : null,
          active: form.active,
          endsAt: form.endsAt || null,
        },
      });
      setForm(blank);
      setShowForm(false);
      setMessage('Discount created.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (discount) => {
    try {
      await api(`/api/admin/discounts/${discount.id}`, { method: 'PUT', body: { active: !discount.active } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (discount) => {
    if (!window.confirm(`Delete discount ${discount.code}?`)) return;
    try {
      await api(`/api/admin/discounts/${discount.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Discounts</h1>
          <p>Percentage, fixed amount and free-shipping codes.</p>
        </div>
        <div className="topbar-actions">
          <button className="btn accent" type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Close form' : 'New discount'}
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {showForm ? (
        <form className="card" onSubmit={submit}>
          <h2>New discount</h2>
          <div className="row three">
            <div className="field">
              <label>Code</label>
              <input required value={form.code} onChange={update('code')} placeholder="WELCOME10" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={update('type')}>
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed amount</option>
                <option value="free_shipping">Free shipping</option>
              </select>
            </div>
            <div className="field">
              <label>Value</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.value}
                onChange={update('value')}
                disabled={form.type === 'free_shipping'}
              />
            </div>
          </div>
          <div className="row three">
            <div className="field">
              <label>Usage limit</label>
              <input type="number" min="1" value={form.usageLimit} onChange={update('usageLimit')} placeholder="Unlimited" />
            </div>
            <div className="field">
              <label>Minimum subtotal</label>
              <input type="number" min="0" value={form.minSubtotal} onChange={update('minSubtotal')} placeholder="None" />
            </div>
            <div className="field">
              <label>Ends at</label>
              <input type="date" value={form.endsAt} onChange={update('endsAt')} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <input type="checkbox" checked={form.active} onChange={update('active')} style={{ width: 'auto' }} /> Active
          </label>
          <button className="btn accent" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create discount'}
          </button>
        </form>
      ) : null}

      <div className="card">
        {discounts.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Used</th>
                  <th>Minimum</th>
                  <th>Ends</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {discounts.map((discount) => (
                  <tr key={discount.id}>
                    <td>
                      <strong>{discount.code}</strong>
                    </td>
                    <td className="muted">{discount.type.replace('_', ' ')}</td>
                    <td>
                      {discount.type === 'percentage'
                        ? `${discount.value}%`
                        : discount.type === 'fixed_amount'
                          ? formatMoney(discount.value)
                          : 'Free shipping'}
                    </td>
                    <td>
                      {discount.usage_count}
                      {discount.usage_limit ? ` / ${discount.usage_limit}` : ''}
                    </td>
                    <td>{discount.min_subtotal ? formatMoney(discount.min_subtotal) : '—'}</td>
                    <td className="muted">{discount.ends_at ? formatDate(discount.ends_at) : '—'}</td>
                    <td>
                      <span className={`badge ${discount.active ? 'active' : 'archived'}`}>
                        {discount.active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn secondary small" type="button" onClick={() => toggle(discount)}>
                        {discount.active ? 'Disable' : 'Enable'}
                      </button>{' '}
                      <button className="btn danger small" type="button" onClick={() => remove(discount)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No discount codes yet. Create one to run a promotion.</div>
        )}
      </div>
    </>
  );
}
