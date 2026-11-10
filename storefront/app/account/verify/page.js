'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/client';

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [devCode, setDevCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('cc_verification_code');
    if (stored) {
      setDevCode(stored);
      setCode(stored);
    }
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/storefront/account/verify', {
        method: 'POST',
        body: { email, code },
      });
      sessionStorage.removeItem('cc_verification_code');
      router.replace('/account');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError('');
    setNotice('');
    try {
      const data = await apiFetch('/api/storefront/account/resend-verification', {
        method: 'POST',
        body: { email },
      });
      setNotice('A new code has been sent.');
      if (data.verification_code) {
        sessionStorage.setItem('cc_verification_code', data.verification_code);
        setDevCode(data.verification_code);
        setCode(data.verification_code);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <div className="account-auth">
        <h1>Verify your email</h1>
        <div className="notice error">We need the email address you registered with.</div>
        <p style={{ marginTop: 16 }}>
          <Link href="/account/register" className="link-arrow">Create an account</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="account-auth">
      <p className="eyebrow">Customer account</p>
      <h1>Check your email</h1>
      <p style={{ color: 'var(--muted)' }}>
        Enter the six-digit code sent to <strong>{email}</strong>.
      </p>
      {devCode ? (
        <div className="notice">
          Development mode: your verification code is <strong>{devCode}</strong>.
        </div>
      ) : null}
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      <form className="account-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>
        <button className="btn accent block" type="submit" disabled={submitting || code.length !== 6}>
          {submitting ? 'Verifying…' : 'Verify email'}
        </button>
      </form>
      <p className="product-meta" style={{ marginTop: 20 }}>
        Didn&apos;t get a code?{' '}
        <button type="button" className="remove-link" onClick={resend} disabled={resending}>
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="container narrow page">
      <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading…</p>}>
        <VerifyForm />
      </Suspense>
    </main>
  );
}
