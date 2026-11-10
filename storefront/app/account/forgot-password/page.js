'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const data = await apiFetch('/api/storefront/account/forgot-password', {
        method: 'POST',
        body: { email },
      });
      if (data.reset_code) sessionStorage.setItem('cc_reset_code', data.reset_code);
      setNotice('If that email has an account, a reset code is on its way.');
      router.push(`/account/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="container narrow page">
      <div className="account-auth">
        <p className="eyebrow">Customer account</p>
        <h1>Reset your password</h1>
        <p style={{ color: 'var(--muted)' }}>
          Enter the email on your account and we will send a six-digit reset code.
        </p>
        {error ? <div className="notice error">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}
        <form className="account-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button className="btn accent block" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
        <p className="product-meta" style={{ marginTop: 20 }}>
          Remembered it? <Link href="/account/login" className="link-arrow">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
