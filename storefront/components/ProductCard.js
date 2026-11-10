import Link from 'next/link';
import { formatMoney } from '../lib/money';

export default function ProductCard({ product, currency = 'USD' }) {
  const image = product.featured_image || product.images?.[0]?.src;
  const onSale = product.compare_at_price && product.compare_at_price > product.price;

  return (
    <Link href={`/products/${product.handle}`} className="product-card">
      <div className="product-media">
        {image ? (
          <img src={image} alt={product.images?.[0]?.alt || product.title} loading="lazy" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(145deg,#e7ddcd,#cdb59a)',
              fontFamily: 'var(--font-serif)',
              fontSize: '1.4rem',
            }}
          >
            {product.title}
          </div>
        )}
        {onSale ? <span className="badge sale">Sale</span> : null}
        {!product.available ? <span className="badge">Sold out</span> : null}
      </div>
      <div className="product-info">
        <h3>{product.title}</h3>
        <span className="price">
          {onSale ? <s>{formatMoney(product.compare_at_price, currency)}</s> : null}
          {formatMoney(product.price, currency)}
        </span>
      </div>
      {product.vendor ? <p className="product-meta">{product.vendor}</p> : null}
    </Link>
  );
}
