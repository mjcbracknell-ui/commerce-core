import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCart from '../../../components/AddToCart';
import ProductCard from '../../../components/ProductCard';
import { getProduct, getStore } from '../../../lib/api';
import { formatMoney } from '../../../lib/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const data = await getProduct(params.handle);
  if (!data?.product) return { title: 'Product not found' };
  return {
    title: data.product.seo_title || `${data.product.title} — CommerceCore`,
    description: data.product.seo_description || data.product.description_html?.replace(/<[^>]+>/g, '').slice(0, 150),
  };
}

export default async function ProductPage({ params }) {
  const [data, storeData] = await Promise.all([getProduct(params.handle), getStore()]);
  if (!data?.product) notFound();

  const { product, collections = [], related = [] } = data;
  const currency = storeData?.store?.currency || 'USD';
  const image = product.featured_image || product.images?.[0]?.src;
  const onSale = product.compare_at_price && product.compare_at_price > product.price;

  return (
    <main className="container">
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        {collections[0] ? (
          <>
            <Link href={`/collections/${collections[0].handle}`}>{collections[0].title}</Link>
            <span>/</span>
          </>
        ) : null}
        <span>{product.title}</span>
      </div>

      <div className="product-detail">
        <div>
          <div className="gallery-main">
            {image ? (
              <img src={image} alt={product.title} />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'linear-gradient(145deg,#e7ddcd,#cdb59a)',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '2rem',
                }}
              >
                {product.title}
              </div>
            )}
          </div>
          {product.images?.length > 1 ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {product.images.slice(1, 4).map((img) => (
                <img
                  key={img.src}
                  src={img.src}
                  alt={img.alt || product.title}
                  style={{ width: 92, height: 110, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {product.vendor ? <p className="eyebrow">{product.vendor}</p> : null}
          <h1 className="product-title">{product.title}</h1>
          <p className="price" style={{ fontSize: '1.2rem' }}>
            {onSale ? <s>{formatMoney(product.compare_at_price, currency)}</s> : null}
            {formatMoney(product.price, currency)}
          </p>
          {product.description_html ? (
            <div className="prose" dangerouslySetInnerHTML={{ __html: product.description_html }} />
          ) : (
            <p className="prose">Details coming soon.</p>
          )}
          {product.tags?.length ? (
            <p className="product-meta">Tags: {product.tags.join(', ')}</p>
          ) : null}
          <AddToCart product={product} currency={currency} />
        </div>
      </div>

      {related.length ? (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <h2>You may also like</h2>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} currency={currency} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
