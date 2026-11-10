'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '../lib/money';
import { useCart } from '../lib/cart';

export default function AddToCart({ product, currency = 'USD' }) {
  const router = useRouter();
  const add = useCart((state) => state.add);
  const [variantId, setVariantId] = useState(
    product.variants?.find((variant) => variant.available)?.id || product.variants?.[0]?.id || '',
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = useMemo(
    () => product.variants?.find((item) => item.id === variantId) || product.variants?.[0],
    [product.variants, variantId],
  );

  if (!variant) return <p className="notice error">This product has no purchasable variant.</p>;

  const image = variant.image || product.featured_image || product.images?.[0]?.src;

  const handleAdd = () => {
    add({
      variantId: variant.id,
      productId: product.id,
      handle: product.handle,
      title: product.title,
      variantTitle: variant.title,
      price: variant.price,
      image,
      quantity,
      maxQuantity: Math.max(variant.inventory, 1),
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div className="purchase-panel">
      {product.variants.length > 1 ? (
        <div className="field">
          <label htmlFor="variant">Variant</label>
          <select id="variant" value={variantId} onChange={(event) => setVariantId(event.target.value)}>
            {product.variants.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.available}>
                {item.title} — {formatMoney(item.price, currency)} {item.available ? '' : '(sold out)'}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="row">
        <div className="field">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            min="1"
            max={Math.max(variant.inventory, 1)}
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(variant.inventory, 1))))
            }
          />
        </div>
        <div className="field">
          <label>Availability</label>
          <p style={{ margin: 0, paddingTop: 10, fontSize: '0.9rem', color: 'var(--muted)' }}>
            {variant.available ? `${variant.inventory} in stock` : 'Sold out'}
          </p>
        </div>
      </div>

      <button className="btn accent block" onClick={handleAdd} disabled={!variant.available}>
        {added ? 'Added to cart ✓' : `Add to cart — ${formatMoney(variant.price * quantity, currency)}`}
      </button>
      <button className="btn secondary block" onClick={() => router.push('/cart')} disabled={!variant.available}>
        Buy now
      </button>
      {added ? <p className="notice success">Added. Your cart is up to date.</p> : null}
      {variant.sku ? <p className="product-meta">SKU: {variant.sku}</p> : null}
    </div>
  );
}
