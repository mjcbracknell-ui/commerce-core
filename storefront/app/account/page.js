'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/client';
import { formatDate, formatMoney } from '../../lib/money';

const emptyAddress = {
  label: '',
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'United States',
  phone: '',
  isDefault: false,
};

const addressToForm = (address) => ({
  id: address.id,
  label: address.label || '',
  firstName: address.first_name || '',
  lastName: address.last_name || '',
  address1: address.address1 || '',
  address2: address.address2 || '',
  city: address.city || '',
  region: address.region || '',
  postalCode: address.postal_code || '',
  country: address.country || '',
  phone: address.phone || '',
  isDefault: Boolean(address.is_default),
});

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phone: '' });
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const account = await apiFetch('/api/storefront/account');
      setData(account);
      setAddresses(account.addresses || []);
      setProfile({
        firstName: account.customer.first_name || '',
        lastName: account.customer.last_name || '',
        phone: account.customer.phone || '',
      });
      setError('');
    } catch (err) {
      if (err.status === 401) {
        router.replace('/account/login?next=/account');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfile = (key) => (event) =>
    setProfile((current) => ({ ...current, [key]: event.target.value }));

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving('profile');
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/storefront/account', {
        method: 'PATCH',
        body: {
          firstName: profile.firstName || null,
          lastName: profile.lastName || null,
          phone: profile.phone || null,
        },
      });
      await load();
      setNotice('Profile updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const updateAddress = (key) => (event) =>
    setAddressForm((current) => ({ ...current, [key]: event.target.value }));

  const saveAddress = async (event) => {
    event.preventDefault();
    if (!addressForm) return;
    setSaving('address');
    setError('');
    setNotice('');
    try {
      const { id, ...fields } = addressForm;
      await apiFetch(id ? `/api/storefront/account/addresses/${id}` : '/api/storefront/account/addresses', {
        method: id ? 'PATCH' : 'POST',
        body: { ...fields, isDefault: Boolean(fields.isDefault) },
      });
      setAddressForm(null);
      await load();
      setNotice(id ? 'Address updated.' : 'Address saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const deleteAddress = async (address) => {
    if (!window.confirm('Delete this saved address?')) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/storefront/account/addresses/${address.id}`, { method: 'DELETE' });
      await load();
      setNotice('Address deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const makeDefault = async (address) => {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/storefront/account/addresses/${address.id}`, {
        method: 'PATCH',
        body: { isDefault: true },
      });
      await load();
      setNotice('Default address updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  const logout = async () => {
    await apiFetch('/api/storefront/account/logout', { method: 'POST' }).catch(() => {});
    router.replace('/account/login');
  };

  if (loading) {
    return (
      <main className="container page">
        <p style={{ color: 'var(--muted)' }}>Loading your account…</p>
      </main>
    );
  }

  if (!data?.customer) {
    return (
      <main className="container page">
        <h1>Your account</h1>
        <div className="notice error">{error || 'We could not load your account.'}</div>
        <div style={{ marginTop: 16 }}>
          <Link href="/account/login" className="btn">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const { customer, orders = [] } = data;
  const currency = orders[0]?.currency || 'USD';

  return (
    <main className="container page">
      <p className="eyebrow">Customer account</p>
      <h1>Hello, {customer.first_name || customer.name}.</h1>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="account-shell">
        <aside className="account-sidebar">
          <div>
            <strong>{customer.name}</strong>
            <p className="product-meta">{customer.email}</p>
          </div>
          <nav>
            <a href="#orders">Order history</a>
            <a href="#addresses">Saved addresses</a>
            <a href="#profile">Profile</a>
          </nav>
          <button type="button" className="remove-link" onClick={logout}>
            Sign out
          </button>
        </aside>

        <div className="account-main">
          <section className="account-panel" id="orders">
            <div className="account-panel-head">
              <div>
                <h2>Order history</h2>
                <p className="product-meta">
                  {customer.orders_count} {customer.orders_count === 1 ? 'order' : 'orders'} ·{' '}
                  {formatMoney(customer.total_spent, currency)} lifetime
                </p>
              </div>
              <Link href="/collections/all" className="btn secondary small">
                Shop again
              </Link>
            </div>

            {orders.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th aria-label="Open order" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>#{order.number}</td>
                        <td>{formatDate(order.created_at)}</td>
                        <td>
                          <span className={`pill ${order.financial_status}`}>
                            {order.financial_status.replace('_', ' ')}
                          </span>{' '}
                          <span className={`pill ${order.fulfillment_status}`}>
                            {order.fulfillment_status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>{formatMoney(order.total, order.currency || currency)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href={`/account/orders/${order.number}`} className="link-arrow">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <h3>No orders yet</h3>
                <p>Orders placed with this email will appear here.</p>
                <Link href="/collections/all" className="btn">
                  Start shopping
                </Link>
              </div>
            )}
          </section>

          <section className="account-panel" id="addresses">
            <div className="account-panel-head">
              <div>
                <h2>Saved addresses</h2>
                <p className="product-meta">Your default address is used to prefill checkout.</p>
              </div>
              {!addressForm ? (
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setAddressForm({ ...emptyAddress, isDefault: addresses.length === 0 })}
                >
                  Add address
                </button>
              ) : null}
            </div>

            {addressForm ? (
              <form className="account-form" onSubmit={saveAddress}>
                <div className="field">
                  <label htmlFor="addressLabel">Label (optional)</label>
                  <input
                    id="addressLabel"
                    value={addressForm.label}
                    onChange={updateAddress('label')}
                    placeholder="Home, work…"
                  />
                </div>
                <div className="row">
                  <div className="field">
                    <label htmlFor="addressFirstName">First name</label>
                    <input
                      id="addressFirstName"
                      required
                      value={addressForm.firstName}
                      onChange={updateAddress('firstName')}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="addressLastName">Last name</label>
                    <input
                      id="addressLastName"
                      required
                      value={addressForm.lastName}
                      onChange={updateAddress('lastName')}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="address1">Address</label>
                  <input
                    id="address1"
                    required
                    value={addressForm.address1}
                    onChange={updateAddress('address1')}
                  />
                </div>
                <div className="field">
                  <label htmlFor="address2">Apartment, suite (optional)</label>
                  <input
                    id="address2"
                    value={addressForm.address2}
                    onChange={updateAddress('address2')}
                  />
                </div>
                <div className="row">
                  <div className="field">
                    <label htmlFor="addressCity">City</label>
                    <input
                      id="addressCity"
                      required
                      value={addressForm.city}
                      onChange={updateAddress('city')}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="addressRegion">State / region</label>
                    <input
                      id="addressRegion"
                      value={addressForm.region}
                      onChange={updateAddress('region')}
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label htmlFor="addressPostalCode">Postal code</label>
                    <input
                      id="addressPostalCode"
                      required
                      value={addressForm.postalCode}
                      onChange={updateAddress('postalCode')}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="addressCountry">Country</label>
                    <input
                      id="addressCountry"
                      required
                      value={addressForm.country}
                      onChange={updateAddress('country')}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="addressPhone">Phone (optional)</label>
                  <input
                    id="addressPhone"
                    value={addressForm.phone}
                    onChange={updateAddress('phone')}
                  />
                </div>
                <label className="account-check">
                  <input
                    type="checkbox"
                    checked={Boolean(addressForm.isDefault)}
                    onChange={(event) =>
                      setAddressForm((current) => ({ ...current, isDefault: event.target.checked }))
                    }
                  />
                  Use as my default address
                </label>
                <div className="account-form-actions">
                  <button className="btn accent" type="submit" disabled={saving === 'address'}>
                    {saving === 'address' ? 'Saving…' : 'Save address'}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setAddressForm(null)}
                    disabled={saving === 'address'}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {addresses.length ? (
              <div className="address-grid">
                {addresses.map((address) => (
                  <div className="address-card" key={address.id}>
                    <div className="address-card-head">
                      <strong>{address.label || 'Address'}</strong>
                      {address.is_default ? <span className="pill paid">Default</span> : null}
                    </div>
                    <p>
                      {address.name}
                      <br />
                      {address.address1}
                      {address.address2 ? (
                        <>
                          <br />
                          {address.address2}
                        </>
                      ) : null}
                      <br />
                      {address.city}
                      {address.region ? `, ${address.region}` : ''} {address.postal_code}
                      <br />
                      {address.country}
                    </p>
                    {address.phone ? <p className="product-meta">{address.phone}</p> : null}
                    <div className="address-card-actions">
                      <button
                        type="button"
                        className="remove-link"
                        onClick={() => setAddressForm(addressToForm(address))}
                      >
                        Edit
                      </button>
                      {!address.is_default ? (
                        <button type="button" className="remove-link" onClick={() => makeDefault(address)}>
                          Make default
                        </button>
                      ) : null}
                      <button type="button" className="remove-link" onClick={() => deleteAddress(address)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !addressForm ? (
              <p className="product-meta">No saved addresses yet.</p>
            ) : null}
          </section>

          <section className="account-panel" id="profile">
            <h2>Profile</h2>
            <form className="account-form" onSubmit={saveProfile}>
              <div className="field">
                <label htmlFor="profileEmail">Email</label>
                <input id="profileEmail" value={customer.email} disabled />
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="profileFirstName">First name</label>
                  <input
                    id="profileFirstName"
                    value={profile.firstName}
                    onChange={updateProfile('firstName')}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileLastName">Last name</label>
                  <input
                    id="profileLastName"
                    value={profile.lastName}
                    onChange={updateProfile('lastName')}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="profilePhone">Phone</label>
                <input id="profilePhone" value={profile.phone} onChange={updateProfile('phone')} />
              </div>
              <div className="account-form-actions">
                <button className="btn" type="submit" disabled={saving === 'profile'}>
                  {saving === 'profile' ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
