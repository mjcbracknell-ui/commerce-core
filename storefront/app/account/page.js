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
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [emailChange, setEmailChange] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [account, sessionData] = await Promise.all([
        apiFetch('/api/storefront/account'),
        apiFetch('/api/storefront/account/sessions'),
      ]);
      setData(account);
      setSessions(sessionData.sessions || []);
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

  const changePassword = async (event) => {
    event.preventDefault();
    setSaving('password');
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/storefront/account/change-password', {
        method: 'POST',
        body: passwordForm,
      });
      setPasswordForm({ currentPassword: '', newPassword: '' });
      await load();
      setNotice('Password changed. Other sessions were signed out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const requestEmailChange = async (event) => {
    event.preventDefault();
    setSaving('email');
    setError('');
    setNotice('');
    try {
      const result = await apiFetch('/api/storefront/account/email', {
        method: 'PATCH',
        body: emailForm,
      });
      setEmailChange({
        pendingEmail: result.pending_email,
        code: result.verification_code || '',
        devCode: result.verification_code || '',
      });
      setEmailForm({ email: '', password: '' });
      setNotice('Enter the code sent to your new address to finish the change.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const verifyEmailChange = async (event) => {
    event.preventDefault();
    setSaving('email-verify');
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/storefront/account/email/verify', {
        method: 'POST',
        body: { code: emailChange.code },
      });
      setEmailChange(null);
      await load();
      setNotice('Email address updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const revokeSession = async (session) => {
    if (!window.confirm('Sign out this session?')) return;
    setError('');
    setNotice('');
    try {
      const result = await apiFetch(`/api/storefront/account/sessions/${session.id}`, { method: 'DELETE' });
      if (result.current) {
        router.replace('/account/login');
        return;
      }
      await load();
      setNotice('Session signed out.');
    } catch (err) {
      setError(err.message);
    }
  };

  const revokeOtherSessions = async () => {
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/storefront/account/sessions/revoke-others', { method: 'POST' });
      await load();
      setNotice('All other sessions were signed out.');
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
            <a href="#security">Security</a>
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

          <section className="account-panel" id="security">
            <h2>Security</h2>
            <p className="product-meta">
              Change your email or password here. Changing either signs out your other devices.
            </p>

            {emailChange ? (
              <form className="account-form" onSubmit={verifyEmailChange} style={{ marginTop: 18 }}>
                <div className="notice">
                  Enter the six-digit code sent to <strong>{emailChange.pendingEmail}</strong>.
                  {emailChange.devCode ? <> Development code: <strong>{emailChange.devCode}</strong>.</> : null}
                </div>
                <div className="field">
                  <label htmlFor="emailChangeCode">Verification code</label>
                  <input
                    id="emailChangeCode"
                    inputMode="numeric"
                    maxLength={6}
                    value={emailChange.code}
                    onChange={(event) =>
                      setEmailChange((current) => ({
                        ...current,
                        code: event.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                  />
                </div>
                <div className="account-form-actions">
                  <button className="btn accent" type="submit" disabled={saving === 'email-verify' || emailChange.code.length !== 6}>
                    {saving === 'email-verify' ? 'Verifying…' : 'Confirm new email'}
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setEmailChange(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form className="account-form" onSubmit={requestEmailChange} style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: '1.05rem' }}>Change email</h3>
                <div className="row">
                  <div className="field">
                    <label htmlFor="newEmail">New email</label>
                    <input
                      id="newEmail"
                      type="email"
                      required
                      value={emailForm.email}
                      onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="emailPassword">Current password</label>
                    <input
                      id="emailPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={emailForm.password}
                      onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="account-form-actions">
                  <button className="btn secondary" type="submit" disabled={saving === 'email'}>
                    {saving === 'email' ? 'Sending…' : 'Send confirmation code'}
                  </button>
                </div>
              </form>
            )}

            <form className="account-form" onSubmit={changePassword} style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: '1.05rem' }}>Change password</h3>
              <div className="row">
                <div className="field">
                  <label htmlFor="currentPassword">Current password</label>
                  <input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="newPassword">New password</label>
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="account-form-actions">
                <button className="btn accent" type="submit" disabled={saving === 'password'}>
                  {saving === 'password' ? 'Changing…' : 'Change password'}
                </button>
              </div>
            </form>

            <div style={{ marginTop: 24 }}>
              <div className="account-panel-head">
                <div>
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Signed-in sessions</h3>
                  <p className="product-meta">{sessions.length} active session{sessions.length === 1 ? '' : 's'}.</p>
                </div>
                {sessions.length > 1 ? (
                  <button className="remove-link" type="button" onClick={revokeOtherSessions}>
                    Sign out other sessions
                  </button>
                ) : null}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {sessions.map((session) => (
                  <div className="address-card" key={session.id}>
                    <div className="address-card-head">
                      <strong>{session.current ? 'This device' : 'Other device'}</strong>
                      {session.current ? <span className="pill paid">Current</span> : null}
                    </div>
                    <p className="product-meta">
                      {session.user_agent || 'Unknown browser'} · signed in {formatDate(session.created_at)}
                    </p>
                    {!session.current ? (
                      <button className="remove-link" type="button" onClick={() => revokeSession(session)}>
                        Sign out
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
