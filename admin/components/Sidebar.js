'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, setActiveStoreId } from '../lib/api';

const links = [
  ['/', 'Dashboard'],
  ['/products', 'Products'],
  ['/orders', 'Orders'],
  ['/customers', 'Customers'],
  ['/discounts', 'Discounts'],
  ['/themes', 'Themes'],
  ['/apps', 'Apps & API'],
  ['/settings', 'Settings'],
  ['/stores', 'Storefronts'],
];

export default function Sidebar({ store, stores = [], user }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  };

  const switchStore = (event) => {
    setActiveStoreId(event.target.value);
    window.location.reload();
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="logo">
          {store?.name || 'Commerce Core'}
          <span>{store ? `Admin · ${store.currency}` : 'Store platform'}</span>
        </div>
        {stores.length ? (
          <select
            value={store?.id || ''}
            onChange={switchStore}
            aria-label="Active store"
            style={{
              marginTop: 14,
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.18)',
              fontSize: '0.8rem',
            }}
          >
            {stores.map((item) => (
              <option key={item.id} value={item.id} style={{ color: '#191817' }}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <nav className="side-nav">
        {links.map(([href, label]) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? 'active' : ''}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <span>{user?.email}</span>
        <a href={store?.storefront_url || 'http://localhost:3000'} target="_blank" rel="noreferrer">
          View storefront ↗
        </a>
        <Link href="/stores">Manage storefronts</Link>
        <button className="btn secondary small" type="button" onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
