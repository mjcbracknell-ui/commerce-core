'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setActiveStoreId } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    storeName: '',
    currency: 'USD',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          email: form.email,
          password: form.password,
          name: form.name || undefined,
          storeName: form.storeName,
          currency: form.currency,
        },
      });
      setActiveStoreId(data.store.id);
      router.replace('/');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo">Commerce Core</div>
        <div className="sub">Create your storefront in a minute</div>

        {error ? <div className="notice error">{error}</div> : null}

        <div className="field">
          <label htmlFor="storeName">Store name</label>
          <input
            id="storeName"
            value={form.storeName}
            onChange={update('storeName')}
            placeholder="Acme Coffee"
            required
            autoFocus
          />
          <span className="hint">Your store gets its own subdomain and admin.</span>
        </div>
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" value={form.name} onChange={update('name')} placeholder="Ada Lovelace" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={update('email')}
            required
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select id="currency" value={form.currency} onChange={update('currency')}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <button className="btn accent" type="submit" disabled={loading} style={{ width: '100%', marginTop: 6 }}>
          {loading ? 'Creating your store…' : 'Create storefront'}
        </button>
        <p className="muted small" style={{ marginTop: 18, marginBottom: 0 }}>
          Already have an account? <a href="/login" style={{ textDecoration: 'underline' }}>Sign in</a>
        </p>
      </form>
    </div>
  );
}
