'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api';

const blankVariant = () => ({
  title: 'Default Title',
  sku: '',
  price: '',
  compareAtPrice: '',
  inventory: 0,
  option1: '',
  option2: '',
  option3: '',
});

const toFormState = (product) =>
  product
    ? {
        title: product.title || '',
        handle: product.handle || '',
        status: product.status || 'active',
        vendor: product.vendor || '',
        productType: product.product_type || '',
        tags: (product.tags || []).join(', '),
        descriptionHtml: product.description_html || '',
        images: (product.images || []).map((image) => image.src).join('\n'),
        variants: (product.variants || []).map((variant) => ({
          id: variant.id,
          title: variant.title || 'Default Title',
          sku: variant.sku || '',
          price: variant.price ?? '',
          compareAtPrice: variant.compare_at_price ?? '',
          inventory: variant.inventory ?? 0,
          option1: variant.option1 || '',
          option2: variant.option2 || '',
          option3: variant.option3 || '',
        })),
      }
    : {
        title: '',
        handle: '',
        status: 'active',
        vendor: '',
        productType: '',
        tags: '',
        descriptionHtml: '',
        images: '',
        variants: [blankVariant()],
      };

export default function ProductForm({ product = null }) {
  const router = useRouter();
  const [form, setForm] = useState(() => toFormState(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const updateVariant = (index, key) => (event) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, i) =>
        i === index ? { ...variant, [key]: event.target.value } : variant,
      ),
    }));

  const addVariant = () =>
    setForm((current) => ({ ...current, variants: [...current.variants, blankVariant()] }));

  const removeVariant = (index) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.length > 1 ? current.variants.filter((_, i) => i !== index) : current.variants,
    }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        title: form.title,
        ...(form.handle ? { handle: form.handle } : {}),
        status: form.status,
        vendor: form.vendor || null,
        productType: form.productType || null,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        descriptionHtml: form.descriptionHtml || null,
        images: form.images
          .split('\n')
          .map((src) => src.trim())
          .filter(Boolean)
          .map((src) => ({ src })),
        variants: form.variants.map((variant) => ({
          ...(variant.id ? { id: variant.id } : {}),
          title: variant.title || 'Default Title',
          sku: variant.sku || null,
          price: Number(variant.price) || 0,
          compareAtPrice: variant.compareAtPrice === '' ? null : Number(variant.compareAtPrice),
          inventory: Number(variant.inventory) || 0,
          option1: variant.option1 || null,
          option2: variant.option2 || null,
          option3: variant.option3 || null,
        })),
      };

      if (product) {
        await api(`/api/admin/products/${product.id}`, { method: 'PUT', body });
      } else {
        await api('/api/admin/products', { method: 'POST', body });
      }
      router.push('/products');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error ? <div className="notice error">{error}</div> : null}

      <div className="split">
        <div>
          <div className="card">
            <h2>Product details</h2>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" required value={form.title} onChange={update('title')} placeholder="Classic organic tee" />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="handle">Handle</label>
                <input id="handle" value={form.handle} onChange={update('handle')} placeholder="auto-generated" />
                <span className="hint">URL: /products/{form.handle || 'auto'}</span>
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" value={form.status} onChange={update('status')}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="vendor">Vendor</label>
                <input id="vendor" value={form.vendor} onChange={update('vendor')} />
              </div>
              <div className="field">
                <label htmlFor="productType">Type</label>
                <input id="productType" value={form.productType} onChange={update('productType')} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" value={form.tags} onChange={update('tags')} placeholder="apparel, organic, bestseller" />
            </div>
            <div className="field">
              <label htmlFor="description">Description (HTML)</label>
              <textarea id="description" rows={8} value={form.descriptionHtml} onChange={update('descriptionHtml')} />
            </div>
            <div className="field">
              <label htmlFor="images">Image URLs</label>
              <textarea
                id="images"
                rows={3}
                value={form.images}
                onChange={update('images')}
                placeholder={'https://example.com/photo.jpg\nhttps://example.com/photo-2.jpg'}
              />
              <span className="hint">One URL per line. The first image is used as the featured image.</span>
            </div>
          </div>

          <div className="card">
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Variants</h2>
              <button type="button" className="btn secondary small" onClick={addVariant}>
                Add variant
              </button>
            </div>
            {form.variants.map((variant, index) => (
              <div key={variant.id || index} style={{ borderTop: index ? '1px solid var(--line)' : 0, paddingTop: index ? 16 : 0, marginTop: index ? 16 : 0 }}>
                <div className="row three">
                  <div className="field">
                    <label>Title</label>
                    <input value={variant.title} onChange={updateVariant(index, 'title')} />
                  </div>
                  <div className="field">
                    <label>SKU</label>
                    <input value={variant.sku} onChange={updateVariant(index, 'sku')} />
                  </div>
                  <div className="field">
                    <label>Inventory</label>
                    <input type="number" value={variant.inventory} onChange={updateVariant(index, 'inventory')} />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Price</label>
                    <input type="number" step="0.01" min="0" required value={variant.price} onChange={updateVariant(index, 'price')} />
                  </div>
                  <div className="field">
                    <label>Compare at price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={variant.compareAtPrice}
                      onChange={updateVariant(index, 'compareAtPrice')}
                    />
                  </div>
                </div>
                {form.variants.length > 1 ? (
                  <button type="button" className="btn danger small" onClick={() => removeVariant(index)}>
                    Remove variant
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: 20 }}>
          <h2>Save</h2>
          <p className="muted small">
            {product ? `Editing ${product.title}` : 'New products go live on the storefront immediately when active.'}
          </p>
          <button className="btn accent" type="submit" disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </button>
          <Link href="/products" className="btn secondary" style={{ width: '100%', marginTop: 10 }}>
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
