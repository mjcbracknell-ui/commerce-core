'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('Admin123!');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then(() => router.replace('/'))
      .catch(() => {});
  }, [router]);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: { email, password, ...(totp ? { totp } : {}) },
      });
      router.replace('/');
    } catch (err) {
      if (err.message?.toLowerCase().includes('two-factor')) {
        setNeedsTotp(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo">Commerce Core</div>
        <div className="sub">Sign in to your store admin</div>

        {error ? <div className="notice error">{error}</div> : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {needsTotp ? (
          <div className="field">
            <label htmlFor="totp">Two-factor code</label>
            <input
              id="totp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totp}
              onChange={(event) => setTotp(event.target.value)}
              placeholder="123456"
              autoFocus
            />
          </div>
        ) : null}

        <button className="btn accent" type="submit" disabled={loading} style={{ width: '100%', marginTop: 6 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small" style={{ marginTop: 18, marginBottom: 0 }}>
          Demo credentials: admin@demo.com / Admin123!
        </p>
        <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
          New here? <a href="/register" style={{ textDecoration: 'underline' }}>Create your storefront</a>
        </p>
      </form>
    </div>
  );
}
