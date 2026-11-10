'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { api, getActiveStoreId, setActiveStoreId } from '../../lib/api';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => {
        const stores = data.stores || [];
        const activeStore = stores.find((store) => store.id === getActiveStoreId()) || stores[0] || null;
        if (activeStore) setActiveStoreId(activeStore.id);
        setSession({ ...data, stores, activeStore });
        setLoading(false);
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  if (loading) {
    return (
      <div className="auth-wrap">
        <p className="muted">Loading your storefronts…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar store={session?.activeStore} stores={session?.stores} user={session?.user} />
      <main className="main">{children}</main>
    </div>
  );
}
