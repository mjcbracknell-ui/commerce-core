'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../lib/api';

const links = [
  ['/', 'Dashboard'],
  ['/products', 'Products'],
  ['/orders', 'Orders'],
  ['/customers', 'Customers'],
  ['/discounts', 'Discounts'],
  ['/themes', 'Themes'],
  ['/apps', 'Apps & API'],
  ['/settings', 'Settings'],
];

export default function Sidebar({ store, user }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="logo">
          {store?.name || 'CommerceCore'}
          <span>Admin · {store?.currency || 'USD'}</span>
        </div>
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
        <a href="http://localhost:3000" target="_blank" rel="noreferrer">
          View storefront ↗
        </a>
        <button className="btn secondary small" type="button" onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
