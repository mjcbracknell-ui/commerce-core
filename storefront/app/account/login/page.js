'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const resetComplete = searchParams.get('reset') === '1';

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/storefront/account/login', { method: 'POST', body: form });
      const requested = searchParams.get('next');
      const target = requested && requested.startsWith('/') && !requested.startsWith('//')
        ? requested
        : '/account';
      router.replace(target);
      router.refresh();
    } catch (err) {
      if (err.data?.verification_required) {
        router.push(`/account/verify?email=${encodeURIComponent(err.data.email || form.email)}`);
        return;
      }
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="account-auth">
      <p className="eyebrow">Customer account</p>
      <h1>Welcome back</h1>
      <p style={{ color: 'var(--muted)' }}>Sign in to track orders and check out faster.</p>
      {resetComplete ? <div className="notice success">Password updated. Sign in with your new password.</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      <form className="account-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={update('password')}
          />
          <span className="product-meta">
            <Link href="/account/forgot-password" className="link-arrow">
              Forgot your password?
            </Link>
          </span>
        </div>
        <button className="btn accent block" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="product-meta" style={{ marginTop: 20 }}>
        New here? <Link href="/account/register" className="link-arrow">Create an account</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="container narrow page">
      <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
