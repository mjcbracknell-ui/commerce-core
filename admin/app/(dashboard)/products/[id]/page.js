'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProductForm from '../../../../components/ProductForm';
import { api } from '../../../../lib/api';

export default function EditProductPage() {
  const params = useParams();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/admin/products/${params.id}`)
      .then((data) => setProduct(data.product))
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (error) {
    return (
      <>
        <div className="topbar">
          <h1>Product</h1>
        </div>
        <div className="notice error">{error}</div>
        <Link href="/products" className="btn secondary">
          Back to products
        </Link>
      </>
    );
  }

  if (!product) return <p className="muted">Loading product…</p>;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{product.title}</h1>
          <p>
            /{product.handle} · {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="topbar-actions">
          <a className="btn secondary" href={`http://localhost:3000/products/${product.handle}`} target="_blank" rel="noreferrer">
            View on storefront ↗
          </a>
        </div>
      </div>
      <ProductForm product={product} />
    </>
  );
}
