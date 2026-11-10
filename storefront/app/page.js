import Link from 'next/link';
import ProductCard from '../components/ProductCard';
import { getCollections, getProducts, getStore } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [productData, collectionData, storeData] = await Promise.all([
    getProducts('?limit=8&sort=featured'),
    getCollections(),
    getStore(),
  ]);

  const products = productData?.products || [];
  const collections = collectionData?.collections || [];
  const currency = storeData?.store?.currency || 'USD';
  const storeName = storeData?.store?.name || 'CommerceCore';

  return (
    <main>
      <section className="hero">
        <div className="container inner">
          <div>
            <p className="eyebrow">New season · {storeName}</p>
            <h1>Fewer, better things.</h1>
            <p className="lead">
              Everyday pieces designed to be worn hard, washed often and kept for years. No subscriptions,
              no middlemen, no platform tax on your orders.
            </p>
            <div className="hero-actions">
              <Link href="/collections/all" className="btn">
                Shop the collection
              </Link>
              <Link href="/collections" className="btn secondary">
                Browse collections
              </Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true" />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Featured</p>
              <h2>This week&apos;s picks</h2>
            </div>
            <Link href="/collections/all" className="link-arrow">
              View all products →
            </Link>
          </div>

          {products.length ? (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} currency={currency} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>No products yet</h3>
              <p>Run the seed script or add products in the admin to see them here.</p>
              <a className="btn secondary" href="http://localhost:3001">
                Open admin
              </a>
            </div>
          )}
        </div>
      </section>

      {collections.length ? (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <div>
                <p className="eyebrow">Curated</p>
                <h2>Shop by collection</h2>
              </div>
            </div>
            <div className="product-grid">
              {collections.slice(0, 3).map((collection, index) => (
                <Link
                  key={collection.handle}
                  href={`/collections/${collection.handle}`}
                  className="product-card"
                >
                  <div
                    className="product-media"
                    style={{
                      background:
                        index % 3 === 0
                          ? 'linear-gradient(150deg,#e8d7bf,#b5764f)'
                          : index % 3 === 1
                            ? 'linear-gradient(150deg,#dfe2d3,#8e9a7d)'
                            : 'linear-gradient(150deg,#e6d9d3,#a67b74)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '2rem',
                        color: 'rgba(255,255,255,0.9)',
                        textAlign: 'center',
                        padding: 24,
                      }}
                    >
                      {collection.title}
                    </span>
                  </div>
                  <div className="product-info">
                    <h3>{collection.title}</h3>
                    <span className="product-meta">{collection.products_count} items</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="value-grid">
            <div className="value">
              <h4>Free shipping over $100</h4>
              <p>Carbon-neutral delivery on every order, tracked end to end.</p>
            </div>
            <div className="value">
              <h4>30-day returns</h4>
              <p>Not right? Send it back within 30 days for a full refund.</p>
            </div>
            <div className="value">
              <h4>Self-hosted checkout</h4>
              <p>Your customer data stays on your server. No per-transaction platform fees.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
