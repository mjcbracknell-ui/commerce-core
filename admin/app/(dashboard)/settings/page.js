'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function SettingsPage() {
  const [store, setStore] = useState(null);
  const [form, setForm] = useState(null);
  const [zones, setZones] = useState([]);
  const [taxRegions, setTaxRegions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [twoFA, setTwoFA] = useState({ enabled: false });
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    Promise.all([
      api('/api/admin/settings'),
      api('/api/auth/me'),
      api('/api/admin/settings/shipping-zones'),
      api('/api/admin/settings/tax-regions'),
    ])
      .then(([settingsData, meData, zoneData, taxData]) => {
        setStore(settingsData.store);
        setZones(zoneData.zones || []);
        setTaxRegions(taxData.regions || []);
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

  const addZone = () =>
    setZones((current) => [
      ...current,
      {
        name: 'New zone',
        countries: [],
        regions: [],
        position: current.length,
        active: true,
        rates: [{ name: 'Standard', rate: 0, min_subtotal: null, max_subtotal: null, free_over: null, position: 0, active: true }],
      },
    ]);

  const updateZone = (index, key, value) =>
    setZones((current) => current.map((zone, i) => (i === index ? { ...zone, [key]: value } : zone)));

  const removeZone = (index) => setZones((current) => current.filter((_, i) => i !== index));

  const addRate = (zoneIndex) =>
    setZones((current) =>
      current.map((zone, i) =>
        i === zoneIndex
          ? {
              ...zone,
              rates: [
                ...(zone.rates || []),
                { name: 'Standard', rate: 0, min_subtotal: null, max_subtotal: null, free_over: null, position: zone.rates?.length || 0, active: true },
              ],
            }
          : zone,
      ),
    );

  const updateRate = (zoneIndex, rateIndex, key, value) =>
    setZones((current) =>
      current.map((zone, i) =>
        i === zoneIndex
          ? {
              ...zone,
              rates: (zone.rates || []).map((rate, j) => (j === rateIndex ? { ...rate, [key]: value } : rate)),
            }
          : zone,
      ),
    );

  const removeRate = (zoneIndex, rateIndex) =>
    setZones((current) =>
      current.map((zone, i) =>
        i === zoneIndex ? { ...zone, rates: (zone.rates || []).filter((_, j) => j !== rateIndex) } : zone,
      ),
    );

  const saveShippingZones = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/admin/settings/shipping-zones', {
        method: 'PUT',
        body: {
          zones: zones.map((zone, zoneIndex) => ({
            name: zone.name,
            countries: String(zone.countriesText ?? zone.countries?.join(', ') ?? '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            regions: String(zone.regionsText ?? zone.regions?.join(', ') ?? '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            position: zoneIndex,
            active: zone.active !== false,
            rates: (zone.rates || []).map((rate, rateIndex) => ({
              name: rate.name,
              rate: Number(rate.rate) || 0,
              minSubtotal: rate.min_subtotal === '' || rate.min_subtotal == null ? null : Number(rate.min_subtotal),
              maxSubtotal: rate.max_subtotal === '' || rate.max_subtotal == null ? null : Number(rate.max_subtotal),
              freeOver: rate.free_over === '' || rate.free_over == null ? null : Number(rate.free_over),
              position: rateIndex,
              active: rate.active !== false,
            })),
          })),
        },
      });
      setZones(data.zones || []);
      setMessage('Shipping zones saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addTaxRegion = () =>
    setTaxRegions((current) => [
      ...current,
      { name: 'New tax region', country: 'United States', region: '', rate: 0, position: current.length, active: true },
    ]);

  const updateTaxRegion = (index, key, value) =>
    setTaxRegions((current) => current.map((region, i) => (i === index ? { ...region, [key]: value } : region)));

  const removeTaxRegion = (index) => setTaxRegions((current) => current.filter((_, i) => i !== index));

  const saveTaxRegions = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/admin/settings/tax-regions', {
        method: 'PUT',
        body: {
          regions: taxRegions.map((region, index) => ({
            name: region.name,
            country: region.country,
            region: region.region || null,
            rate: Number(region.rate) || 0,
            position: index,
            active: region.active !== false,
          })),
        },
      });
      setTaxRegions(data.regions || []);
      setMessage('Tax regions saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
              <label>Default tax rate %</label>
              <input type="number" min="0" step="0.01" value={form.taxRate} onChange={update('taxRate')} />
            </div>
            <div className="field">
              <label>Flat shipping fallback</label>
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
          <p className="hint">
            The fallback applies when no shipping zone or tax region matches the destination.
          </p>

          <button className="btn accent" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>

          <div style={{ borderTop: '1px solid var(--line)', marginTop: 24, paddingTop: 20 }}>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0 }}>Shipping zones</h2>
                <p className="hint">Countries and regions are comma-separated. Use * as a wildcard.</p>
              </div>
              <button className="btn secondary small" type="button" onClick={addZone}>
                Add zone
              </button>
            </div>

            {zones.length ? (
              zones.map((zone, zoneIndex) => (
                <div key={zone.id || `zone-${zoneIndex}`} style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 16 }}>
                  <div className="row">
                    <div className="field">
                      <label>Zone name</label>
                      <input value={zone.name} onChange={(event) => updateZone(zoneIndex, 'name', event.target.value)} />
                    </div>
                    <button className="remove-link" type="button" onClick={() => removeZone(zoneIndex)}>
                      Remove zone
                    </button>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Countries</label>
                      <input
                        value={zone.countriesText ?? (zone.countries || []).join(', ')}
                        onChange={(event) => updateZone(zoneIndex, 'countriesText', event.target.value)}
                        placeholder="United States, Canada"
                      />
                    </div>
                    <div className="field">
                      <label>Regions (optional)</label>
                      <input
                        value={zone.regionsText ?? (zone.regions || []).join(', ')}
                        onChange={(event) => updateZone(zoneIndex, 'regionsText', event.target.value)}
                        placeholder="California, New York"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                      <label style={{ margin: 0 }}>Rates</label>
                      <button className="remove-link" type="button" onClick={() => addRate(zoneIndex)}>
                        Add rate
                      </button>
                    </div>
                    {(zone.rates || []).map((rate, rateIndex) => (
                      <div className="row" key={rate.id || `rate-${rateIndex}`} style={{ alignItems: 'end' }}>
                        <div className="field">
                          <label>Name</label>
                          <input value={rate.name} onChange={(event) => updateRate(zoneIndex, rateIndex, 'name', event.target.value)} />
                        </div>
                        <div className="field">
                          <label>Price</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={rate.rate}
                            onChange={(event) => updateRate(zoneIndex, rateIndex, 'rate', event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Free over</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={rate.free_over ?? ''}
                            onChange={(event) => updateRate(zoneIndex, rateIndex, 'free_over', event.target.value)}
                            placeholder="Never"
                          />
                        </div>
                        <button className="remove-link" type="button" onClick={() => removeRate(zoneIndex, rateIndex)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted small">No zones yet. The fallback rate above is used until one matches.</p>
            )}

            <button className="btn secondary" type="button" onClick={saveShippingZones} disabled={saving} style={{ marginTop: 16 }}>
              {saving ? 'Saving…' : 'Save shipping zones'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--line)', marginTop: 24, paddingTop: 20 }}>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0 }}>Tax regions</h2>
                <p className="hint">Region-specific rates override the default tax rate. A blank region covers the whole country.</p>
              </div>
              <button className="btn secondary small" type="button" onClick={addTaxRegion}>
                Add tax region
              </button>
            </div>
            {taxRegions.length ? (
              taxRegions.map((region, index) => (
                <div className="row" key={region.id || `tax-${index}`} style={{ alignItems: 'end', marginTop: 12 }}>
                  <div className="field">
                    <label>Name</label>
                    <input value={region.name} onChange={(event) => updateTaxRegion(index, 'name', event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Country</label>
                    <input
                      value={region.country}
                      onChange={(event) => updateTaxRegion(index, 'country', event.target.value)}
                      placeholder="United States"
                    />
                  </div>
                  <div className="field">
                    <label>Region</label>
                    <input
                      value={region.region || ''}
                      onChange={(event) => updateTaxRegion(index, 'region', event.target.value)}
                      placeholder="Any"
                    />
                  </div>
                  <div className="field">
                    <label>Rate %</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={region.rate}
                      onChange={(event) => updateTaxRegion(index, 'rate', event.target.value)}
                    />
                  </div>
                  <button className="remove-link" type="button" onClick={() => removeTaxRegion(index)}>
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="muted small">No regional rates. The default tax rate above applies.</p>
            )}
            <button className="btn secondary" type="button" onClick={saveTaxRegions} disabled={saving} style={{ marginTop: 16 }}>
              {saving ? 'Saving…' : 'Save tax regions'}
            </button>
          </div>
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
