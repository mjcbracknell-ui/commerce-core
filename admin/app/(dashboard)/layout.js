'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { api } from '../../lib/api';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  if (loading) {
    return (
      <div className="auth-wrap">
        <p className="muted">Loading your store…</p>
      </div>
    );
  }

  const store = session?.stores?.[0];

  return (
    <div className="shell">
      <Sidebar store={store} user={session?.user} />
      <main className="main">{children}</main>
    </div>
  );
}
