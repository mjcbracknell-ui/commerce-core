'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function SettingsPage() {
  const [store, setStore] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [twoFA, setTwoFA] = useState({ enabled: false });
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    Promise.all([api('/api/admin/settings'), api('/api/auth/me')])
      .then(([settingsData, meData]) => {
        setStore(settingsData.store);
        setForm({
          name: settingsData.store.name,
          domain: settingsData.store.domain,
          currency: settingsData.store.currency,
          taxRate: settingsData.store.settings.taxRate ?? 0,
          shippingFlatRate: settingsData.store.settings.shippingFlatRate ?? 0,
          freeShippingThreshold: settingsData.store.settings.freeShippingThreshold ?? '',
          supportEmail: settingsData.store.settings.supportEmail ?? '',
        });
        setTwoFA({ enabled: Boolean(meData.user?.twoFAEnabled) });
      })
      .catch((err) => setError(err.message));
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          name: form.name,
          domain: form.domain,
          currency: form.currency,
          settings: {
            taxRate: Number(form.taxRate) || 0,
            shippingFlatRate: Number(form.shippingFlatRate) || 0,
            freeShippingThreshold:
              form.freeShippingThreshold === '' ? null : Number(form.freeShippingThreshold),
            supportEmail: form.supportEmail,
          },
        },
      });
      setStore(data.store);
      setMessage('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const start2FA = async () => {
    setError('');
    try {
      const data = await api('/api/auth/2fa/setup', { method: 'POST' });
      setSetup(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const enable2FA = async (event) => {
    event.preventDefault();
    try {
      await api('/api/auth/2fa/enable', { method: 'POST', body: { code } });
      setTwoFA({ enabled: true });
      setSetup(null);
      setCode('');
    } catch (err) {
      setError(err.message);
    }
  };

  const disable2FA = async (event) => {
    event.preventDefault();
    try {
      await api('/api/auth/2fa/disable', { method: 'POST', body: { password } });
      setTwoFA({ enabled: false });
      setPassword('');
      setMessage('Two-factor authentication disabled.');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!form) {
    return (
      <>
        <div className="topbar">
          <h1>Settings</h1>
        </div>
        {error ? <div className="notice error">{error}</div> : <p className="muted">Loading settings…</p>}
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Store identity, tax, shipping and account security.</p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="split">
        <form className="card" onSubmit={save}>
          <h2>Store details</h2>
          <div className="field">
            <label>Store name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="field">
            <label>Domain</label>
            <input value={form.domain} onChange={update('domain')} required />
            <span className="hint">Used for license checks and storefront resolution.</span>
          </div>
          <div className="row">
            <div className="field">
              <label>Currency</label>
              <input value={form.currency} maxLength={3} onChange={update('currency')} />
            </div>
            <div className="field">
              <label>Support email</label>
              <input type="email" value={form.supportEmail} onChange={update('supportEmail')} />
            </div>
          </div>

          <h2 style={{ marginTop: 24 }}>Tax &amp; shipping</h2>
          <div className="row three">
            <div className="field">
              <label>Tax rate %</label>
              <input type="number" min="0" step="0.01" value={form.taxRate} onChange={update('taxRate')} />
            </div>
            <div className="field">
              <label>Flat shipping</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.shippingFlatRate}
                onChange={update('shippingFlatRate')}
              />
            </div>
            <div className="field">
              <label>Free shipping over</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.freeShippingThreshold}
                onChange={update('freeShippingThreshold')}
                placeholder="Disabled"
              />
            </div>
          </div>

          <button className="btn accent" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>

        <div>
          <div className="card">
            <h2>Two-factor authentication</h2>
            {twoFA.enabled ? (
              <>
                <p className="muted small">2FA is enabled for this account.</p>
                <form onSubmit={disable2FA}>
                  <div className="field">
                    <label>Confirm password to disable</label>
                    <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
                  </div>
                  <button className="btn danger" type="submit">
                    Disable 2FA
                  </button>
                </form>
              </>
            ) : setup ? (
              <form onSubmit={enable2FA}>
                <p className="muted small">Scan this QR code, then enter the 6-digit code.</p>
                <img src={setup.qr} alt="2FA QR code" style={{ width: 180, height: 180, marginBottom: 12 }} />
                <div className="field">
                  <label>Secret</label>
                  <code className="small" style={{ wordBreak: 'break-all' }}>{setup.secret}</code>
                </div>
                <div className="field">
                  <label>Verification code</label>
                  <input inputMode="numeric" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} />
                </div>
                <button className="btn accent" type="submit">
                  Enable 2FA
                </button>
              </form>
            ) : (
              <>
                <p className="muted small">Add a TOTP authenticator for extra account security.</p>
                <button className="btn secondary" type="button" onClick={start2FA}>
                  Set up 2FA
                </button>
              </>
            )}
          </div>

          <div className="card">
            <h2>Plan</h2>
            <p className="muted small">
              Commerce Core perpetual license. No subscription, no transaction fees. Theme and app marketplace
              revenue share is optional.
            </p>
            <p className="small">
              Store ID: <code>{store?.id}</code>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
