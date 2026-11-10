'use client';

import { useEffect, useState } from 'react';
import { api, setActiveStoreId } from '../../../lib/api';

export default function StoresPage() {
  const [stores, setStores] = useState([]);
  const [form, setForm] = useState({ name: '', currency: 'USD' });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () =>
    api('/api/auth/me')
      .then((data) => {
        setStores(data.stores || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

  useEffect(() => {
    load();
  }, []);

  const openStore = (store) => {
    setActiveStoreId(store.id);
    window.location.href = '/';
  };

  const create = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/auth/stores', {
        method: 'POST',
        body: { name: form.name, currency: form.currency },
      });
      setActiveStoreId(data.store.id);
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Storefronts</h1>
          <p>Every store has its own catalog, orders, customers and public domain.</p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="split">
        <div>
          {loading ? (
            <p className="muted">Loading storefronts…</p>
          ) : (
            stores.map((store) => (
              <div className="card" key={store.id}>
                <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <h2 style={{ marginBottom: 2 }}>{store.name}</h2>
                    <span className="muted small">
                      {store.domain} · {store.currency} · {store.role}
                    </span>
                  </div>
                  <div className="btn-row">
                    <button className="btn small" type="button" onClick={() => openStore(store)}>
                      Manage
                    </button>
                    <a className="btn secondary small" href={store.storefront_url} target="_blank" rel="noreferrer">
                      View storefront ↗
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form className="card" onSubmit={create}>
          <h2>Create another storefront</h2>
          <p className="muted small">It starts empty with its own admin, ready for products.</p>
          <div className="field">
            <label htmlFor="storeName">Store name</label>
            <input
              id="storeName"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Second store"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="storeCurrency">Currency</label>
            <select
              id="storeCurrency"
              value={form.currency}
              onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
            >
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <button className="btn accent" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create storefront'}
          </button>
        </form>
      </div>
    </>
  );
}
