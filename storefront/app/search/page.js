import ProductCard from '../../components/ProductCard';
import { getStore, searchProducts } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }) {
  const query = (searchParams?.q || '').trim();
  const [data, storeData] = query
    ? await Promise.all([searchProducts(query), getStore()])
    : [null, await getStore()];

  const results = data?.results || [];
  const currency = storeData?.store?.currency || 'USD';

  return (
    <main className="container page">
      <p className="eyebrow">Search</p>
      <h1>Find your next staple</h1>

      <form action="/search" method="get" style={{ display: 'flex', gap: 12, margin: '24px 0 36px', maxWidth: 620 }}>
        <input name="q" defaultValue={query} placeholder="Search products, e.g. tee" aria-label="Search products" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {query ? (
        <>
          <p style={{ color: 'var(--muted)' }}>
            {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
          </p>
          {results.length ? (
            <div className="product-grid">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} currency={currency} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>No matches</h3>
              <p>Try a broader term, or browse the full catalog.</p>
              <a className="btn secondary" href="/collections/all">
                Shop all
              </a>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--muted)' }}>Type a product name, material or category to get started.</p>
      )}
    </main>
  );
}
