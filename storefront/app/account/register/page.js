'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/client';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await apiFetch('/api/storefront/account/register', {
        method: 'POST',
        body: {
          email: form.email,
          password: form.password,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
        },
      });
      if (data.verification_code) {
        sessionStorage.setItem('cc_verification_code', data.verification_code);
      }
      router.push(`/account/verify?email=${encodeURIComponent(data.email || form.email)}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="container narrow page">
      <div className="account-auth">
        <p className="eyebrow">Customer account</p>
        <h1>Create your account</h1>
        <p style={{ color: 'var(--muted)' }}>
          Track every order, save addresses and check out faster. We will email a six-digit code to verify
          your address.
        </p>
        {error ? <div className="notice error">{error}</div> : null}
        <form className="account-form" onSubmit={submit}>
          <div className="row">
            <div className="field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                autoComplete="given-name"
                value={form.firstName}
                onChange={update('firstName')}
              />
            </div>
            <div className="field">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                autoComplete="family-name"
                value={form.lastName}
                onChange={update('lastName')}
              />
            </div>
          </div>
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
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={update('password')}
            />
            <span className="product-meta">At least 8 characters.</span>
          </div>
          <button className="btn accent block" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="product-meta" style={{ marginTop: 20 }}>
          Already have an account? <Link href="/account/login" className="link-arrow">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
