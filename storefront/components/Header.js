'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cartCount, useCart } from '../lib/cart';

export default function Header({ storeName = 'CommerceCore' }) {
  const items = useCart((state) => state.items);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = cartCount(items);

  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="brand">
          {storeName} <span>Store</span>
        </Link>
        <nav className="nav">
          <Link href="/collections/all">Shop</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/search">Search</Link>
        </nav>
        <div className="header-actions">
          <Link href="/search" aria-label="Search">
            Search
          </Link>
          <Link href="/cart" className="cart-link">
            Cart {mounted && count > 0 ? <span className="cart-badge">{count}</span> : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
