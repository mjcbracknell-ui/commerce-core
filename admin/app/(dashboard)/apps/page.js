'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatDate } from '../../../lib/api';

export default function AppsPage() {
  const [apps, setApps] = useState([]);
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [topics, setTopics] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [keyName, setKeyName] = useState('');
  const [hookForm, setHookForm] = useState({ topic: 'orders/create', url: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [appsData, keysData, hooksData] = await Promise.all([
        api('/api/admin/apps'),
        api('/api/admin/api-keys'),
        api('/api/admin/webhooks'),
      ]);
      setApps(appsData.apps || []);
      setKeys(keysData.api_keys || []);
      setWebhooks(hooksData.webhooks || []);
      setTopics(hooksData.topics || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createKey = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await api('/api/admin/api-keys', {
        method: 'POST',
        body: { name: keyName || 'Storefront key', scopes: ['storefront:read'] },
      });
      setNewKey(data.key);
      setKeyName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const revokeKey = async (id) => {
    if (!window.confirm('Revoke this API key? Existing integrations will stop working.')) return;
    try {
      await api(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createWebhook = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await api('/api/admin/webhooks', {
        method: 'POST',
        body: { topic: hookForm.topic, url: hookForm.url },
      });
      setMessage(`Webhook created. Signing secret: ${data.secret}`);
      setHookForm({ topic: hookForm.topic, url: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const testWebhook = async (webhook) => {
    try {
      const result = await api(`/api/admin/webhooks/${webhook.id}/test`, { method: 'POST' });
      setMessage(result.ok ? 'Test delivery succeeded.' : `Test delivery failed (${result.delivery?.error}).`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteWebhook = async (webhook) => {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      await api(`/api/admin/webhooks/${webhook.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Apps &amp; API</h1>
          <p>Payment, search and email integrations plus keys and outgoing webhooks.</p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="card">
        <h2>Integrations</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>App</th>
                <th>Category</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.slug}>
                  <td>
                    <strong>{app.name}</strong>
                  </td>
                  <td className="muted">{app.category}</td>
                  <td>
                    <span className={`badge ${app.configured ? 'active' : 'draft'}`}>
                      {app.configured ? 'configured' : 'not configured'}
                    </span>
                  </td>
                  <td className="muted small">{app.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
          Configure integrations with environment variables (STRIPE_SECRET_KEY, MEILI_HOST, SMTP_HOST, S3_ENDPOINT)
          and restart the backend.
        </p>
      </div>

      <div className="split">
        <div className="card">
          <h2>Storefront API keys</h2>
          <form onSubmit={createKey} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Key name, e.g. Headless app"
            />
            <button className="btn accent" type="submit">
              Create key
            </button>
          </form>

          {newKey ? (
            <div className="notice success">
              Copy this key now — it will not be shown again.
              <div style={{ marginTop: 8 }}>
                <code style={{ wordBreak: 'break-all' }}>{newKey}</code>
              </div>
            </div>
          ) : null}

          {keys.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id}>
                      <td>{key.name}</td>
                      <td className="muted">
                        <code>{key.masked_key}</code>
                      </td>
                      <td className="muted">{formatDate(key.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {key.revoked_at ? (
                          <span className="badge archived">revoked</span>
                        ) : (
                          <button className="btn danger small" type="button" onClick={() => revokeKey(key.id)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small">No API keys yet.</p>
          )}
        </div>

        <div className="card">
          <h2>Outgoing webhooks</h2>
          <form onSubmit={createWebhook} style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            <div className="field">
              <label>Topic</label>
              <select
                value={hookForm.topic}
                onChange={(event) => setHookForm((current) => ({ ...current, topic: event.target.value }))}
              >
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Endpoint URL</label>
              <input
                type="url"
                required
                value={hookForm.url}
                onChange={(event) => setHookForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://example.com/webhooks/orders"
              />
            </div>
            <button className="btn accent" type="submit">
              Add webhook
            </button>
          </form>

          {webhooks.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>URL</th>
                    <th>Last</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((webhook) => (
                    <tr key={webhook.id}>
                      <td>{webhook.topic}</td>
                      <td className="muted small" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {webhook.url}
                      </td>
                      <td>
                        <span className={`badge ${webhook.last_status && webhook.last_status < 300 ? 'active' : 'draft'}`}>
                          {webhook.last_status ?? 'never'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn secondary small" type="button" onClick={() => testWebhook(webhook)}>
                          Test
                        </button>{' '}
                        <button className="btn danger small" type="button" onClick={() => deleteWebhook(webhook)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small">No webhooks yet. Events are signed with HMAC-SHA256.</p>
          )}
        </div>
      </div>
    </>
  );
}
