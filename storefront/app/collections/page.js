import Link from 'next/link';
import { getCollections } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function CollectionsPage() {
  const data = await getCollections();
  const collections = data?.collections || [];

  return (
    <main className="container page">
      <p className="eyebrow">Browse</p>
      <h1>Collections</h1>
      <p style={{ color: 'var(--muted)', maxWidth: '52ch' }}>
        Groupings of pieces that work together. Every collection is managed from the CommerceCore admin.
      </p>

      {collections.length ? (
        <div className="product-grid" style={{ marginTop: 36 }}>
          <Link href="/collections/all" className="product-card">
            <div
              className="product-media"
              style={{ background: 'linear-gradient(150deg,#e7ddcd,#bda184)', display: 'grid', placeItems: 'center' }}
            >
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: '#fff' }}>All</span>
            </div>
            <div className="product-info">
              <h3>All products</h3>
            </div>
          </Link>
          {collections.map((collection, index) => (
            <Link key={collection.handle} href={`/collections/${collection.handle}`} className="product-card">
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
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', color: '#fff' }}>
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
      ) : (
        <div className="empty" style={{ marginTop: 32 }}>
          <h3>No collections yet</h3>
          <p>Create collections in the admin to organise your catalog.</p>
        </div>
      )}
    </main>
  );
}
