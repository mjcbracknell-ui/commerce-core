import Link from 'next/link';

export default function Footer({ storeName = 'Commerce Core', currency = 'USD' }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <strong style={{ color: 'var(--ink)', fontFamily: 'var(--font-serif)', fontSize: '1.2rem' }}>
              {storeName}
            </strong>
            <p style={{ marginTop: 12, maxWidth: '36ch' }}>
              Considered essentials, made to last. This storefront runs on Commerce Core — buy once, own it forever.
            </p>
          </div>
          <div>
            <h5>Shop</h5>
            <Link href="/collections/all">All products</Link>
            <Link href="/collections">Collections</Link>
            <Link href="/search">Search</Link>
          </div>
          <div>
            <h5>Help</h5>
            <Link href="/cart">Cart</Link>
            <Link href="/orders/lookup">Order lookup</Link>
            <a href="http://localhost:3001">Store admin</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {storeName}. All prices in {currency}.
          </span>
          <span>Powered by Commerce Core — perpetual license, no platform fees.</span>
        </div>
      </div>
    </footer>
  );
}
