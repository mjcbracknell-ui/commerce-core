'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [form, setForm] = useState({ code: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('cc_reset_code');
    if (stored) setForm((current) => ({ ...current, code: stored }));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/storefront/account/reset-password', {
        method: 'POST',
        body: { email, code: form.code, password: form.password },
      });
      sessionStorage.removeItem('cc_reset_code');
      router.replace('/account/login?reset=1');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (!email) {
    return (
      <div className="account-auth">
        <h1>Reset your password</h1>
        <div className="notice error">We need the email address on the account.</div>
        <p style={{ marginTop: 16 }}>
          <Link href="/account/forgot-password" className="link-arrow">Request a reset code</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="account-auth">
      <p className="eyebrow">Customer account</p>
      <h1>Choose a new password</h1>
      <p style={{ color: 'var(--muted)' }}>
        Enter the code sent to <strong>{email}</strong>.
      </p>
      {error ? <div className="notice error">{error}</div> : null}
      <form className="account-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">Reset code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <span className="product-meta">At least 8 characters.</span>
        </div>
        <button className="btn accent block" type="submit" disabled={submitting || form.code.length !== 6}>
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="container narrow page">
      <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
