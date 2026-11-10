import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductCard from '../../../components/ProductCard';
import { getCollection, getProducts, getStore } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({ params, searchParams }) {
  const sort = searchParams?.sort || 'featured';
  const isAll = params.handle === 'all';

  const [collectionData, productData, storeData] = await Promise.all([
    isAll ? Promise.resolve(null) : getCollection(params.handle),
    getProducts(isAll ? `?limit=100&sort=${sort}` : '?limit=100'),
    getStore(),
  ]);

  if (!isAll && !collectionData?.collection) notFound();

  const currency = storeData?.store?.currency || 'USD';
  const collection = collectionData?.collection;
  const products = isAll ? productData?.products || [] : collectionData?.products || [];

  return (
    <main className="container page">
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/collections">Collections</Link>
        <span>/</span>
        <span>{collection?.title || 'All products'}</span>
      </div>

      <div className="section-head">
        <div>
          <p className="eyebrow">{products.length} pieces</p>
          <h1>{collection?.title || 'All products'}</h1>
          {collection?.description_html ? (
            <div
              className="prose"
              style={{ maxWidth: '60ch' }}
              dangerouslySetInnerHTML={{ __html: collection.description_html }}
            />
          ) : (
            <p style={{ color: 'var(--muted)' }}>Every piece currently available in the store.</p>
          )}
        </div>
        {isAll ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['featured', 'Featured'],
              ['newest', 'Newest'],
              ['price_asc', 'Price ↑'],
              ['price_desc', 'Price ↓'],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={`/collections/all?sort=${value}`}
                className="btn secondary small"
                style={sort === value ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}
              >
                {label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} currency={currency} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>Nothing here yet</h3>
          <p>Add products to this collection from the admin.</p>
          <Link href="/collections" className="btn secondary">
            Back to collections
          </Link>
        </div>
      )}
    </main>
  );
}
