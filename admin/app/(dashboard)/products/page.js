'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, API_BASE, formatMoney } from '../../../lib/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const data = await api(`/api/admin/products?${params.toString()}`);
      setProducts(data.products || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (product) => {
    if (!window.confirm(`Delete "${product.title}"? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setMessage('Product deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const data = await api('/api/admin/products/import-csv', { method: 'POST', body });
      setMessage(`Imported ${data.imported} product${data.imported === 1 ? '' : 's'}.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Products</h1>
          <p>{products.length} products in this store.</p>
        </div>
        <div className="topbar-actions">
          <a className="btn secondary" href={`${API_BASE}/api/admin/products/export.csv`}>
            Export CSV
          </a>
          <button className="btn secondary" type="button" onClick={() => fileInput.current?.click()}>
            Import CSV
          </button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: 'none' }} />
          <Link href="/products/new" className="btn accent">
            New product
          </Link>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search title, vendor or SKU…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          {loading ? <span className="muted small">Loading…</span> : null}
        </div>

        {products.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Variants</th>
                  <th>Inventory</th>
                  <th>Price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const inventory = product.variants.reduce((sum, variant) => sum + variant.inventory, 0);
                  return (
                    <tr key={product.id}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {product.featured_image ? (
                            <img
                              src={product.featured_image}
                              alt=""
                              style={{ width: 38, height: 46, objectFit: 'cover', borderRadius: 6 }}
                            />
                          ) : (
                            <div style={{ width: 38, height: 46, background: '#f0eee9', borderRadius: 6 }} />
                          )}
                          <div>
                            <Link href={`/products/${product.id}`}>
                              <strong>{product.title}</strong>
                            </Link>
                            <div className="muted small">/{product.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${product.status}`}>{product.status}</span>
                      </td>
                      <td>{product.variants.length}</td>
                      <td className={inventory <= 5 ? 'badge pending' : ''}>{inventory}</td>
                      <td>{formatMoney(product.price)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={`/products/${product.id}`} className="btn secondary small">
                          Edit
                        </Link>{' '}
                        <button className="btn danger small" type="button" onClick={() => remove(product)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            {loading ? 'Loading products…' : 'No products found. Create your first product or import a CSV.'}
          </div>
        )}
      </div>
    </>
  );
}
