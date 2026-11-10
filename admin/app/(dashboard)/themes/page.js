'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, formatDate } from '../../../lib/api';

export default function ThemesPage() {
  const [themes, setThemes] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/themes');
      setThemes(data.themes || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('name', file.name.replace(/\.zip$/i, ''));
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/themes/upload', { method: 'POST', body });
      setMessage('Theme uploaded. Activate it when you are ready.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const installBundled = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/themes/install-bundled', { method: 'POST', body: { name: 'dawn-clone' } });
      setMessage('Dawn clone installed and activated.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const activate = async (theme) => {
    try {
      await api(`/api/admin/themes/${theme.id}/activate`, { method: 'POST' });
      setMessage(`${theme.name} is now the active theme.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (theme) => {
    if (!window.confirm(`Delete theme "${theme.name}"?`)) return;
    try {
      await api(`/api/admin/themes/${theme.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Themes</h1>
          <p>Upload Shopify-compatible Liquid themes (ZIP) and activate them instantly.</p>
        </div>
        <div className="topbar-actions">
          <button className="btn secondary" type="button" onClick={installBundled} disabled={busy}>
            Install bundled Dawn clone
          </button>
          <button className="btn accent" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'Working…' : 'Upload theme ZIP'}
          </button>
          <input ref={fileInput} type="file" accept=".zip,application/zip" onChange={upload} style={{ display: 'none' }} />
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="card">
        {themes.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Theme</th>
                  <th>Files</th>
                  <th>Sections</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {themes.map((theme) => (
                  <tr key={theme.id}>
                    <td>
                      <strong>{theme.name}</strong>
                    </td>
                    <td>{theme.summary.files}</td>
                    <td>{theme.summary.sections.length}</td>
                    <td>
                      <span className={`badge ${theme.is_active ? 'active' : 'draft'}`}>
                        {theme.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="muted">{formatDate(theme.created_at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <a
                        className="btn secondary small"
                        href={`${API_BASE}/api/admin/themes/${theme.id}/preview`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>{' '}
                      {!theme.is_active ? (
                        <button className="btn small" type="button" onClick={() => activate(theme)}>
                          Activate
                        </button>
                      ) : null}{' '}
                      {!theme.is_active ? (
                        <button className="btn danger small" type="button" onClick={() => remove(theme)}>
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <p>No themes yet. Install the bundled Dawn clone or upload a Shopify theme ZIP.</p>
            <button className="btn" type="button" onClick={installBundled} disabled={busy}>
              Install Dawn clone
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Theme requirements</h2>
        <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>ZIP must contain <code>layout/theme.liquid</code>.</li>
          <li>Sections live in <code>sections/</code> and are composed by <code>templates/index.json</code>.</li>
          <li>Snippets are supported with <code>{'{% render "snippet" %}'}</code>.</li>
          <li>Only .liquid, .json, .css, .js and .svg files up to 10MB are stored.</li>
        </ul>
      </div>
    </>
  );
}
