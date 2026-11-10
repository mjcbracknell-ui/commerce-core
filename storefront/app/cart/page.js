'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../../lib/cart';
import { apiFetch } from '../../lib/client';
import { formatMoney } from '../../lib/money';

export default function CartPage() {
  const items = useCart((state) => state.items);
  const storedDiscount = useCart((state) => state.discountCode);
  const storedGiftCard = useCart((state) => state.giftCardCode);
  const setQuantity = useCart((state) => state.setQuantity);
  const remove = useCart((state) => state.remove);
  const setDiscountCode = useCart((state) => state.setDiscountCode);
  const setGiftCardCode = useCart((state) => state.setGiftCardCode);

  const [cart, setCart] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [discountInput, setDiscountInput] = useState(storedDiscount || '');
  const [giftInput, setGiftInput] = useState(storedGiftCard || '');

  const payload = useMemo(
    () => items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    [items],
  );
  const signature = JSON.stringify(payload);

  useEffect(() => {
    let alive = true;
    if (!payload.length) {
      setCart(null);
      setPending(false);
      return () => {
        alive = false;
      };
    }
    setPending(true);
    apiFetch('/api/storefront/cart', {
      method: 'POST',
      body: {
        items: payload,
        discountCode: storedDiscount || undefined,
        giftCardCode: storedGiftCard || undefined,
      },
    })
      .then((data) => {
        if (!alive) return;
        setCart(data.cart);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
      })
      .finally(() => alive && setPending(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, storedDiscount, storedGiftCard]);

  const applyDiscount = async () => {
    const code = discountInput.trim();
    if (!code) {
      setDiscountCode('');
      return;
    }
    setError('');
    try {
      await apiFetch('/api/storefront/discounts/validate', {
        method: 'POST',
        body: { code, items: payload },
      });
      setDiscountCode(code.toUpperCase());
    } catch (err) {
      setError(err.message);
    }
  };

  const applyGiftCard = async () => {
    const code = giftInput.trim();
    if (!code) {
      setGiftCardCode('');
      return;
    }
    setError('');
    try {
      await apiFetch('/api/storefront/gift-cards/validate', { method: 'POST', body: { code } });
      setGiftCardCode(code.toUpperCase());
    } catch (err) {
      setError(err.message);
    }
  };

  if (!items.length) {
    return (
      <main className="container page">
        <h1>Your cart</h1>
        <div className="empty">
          <h3>Your cart is empty</h3>
          <p>Add a few essentials and they will show up here.</p>
          <Link href="/collections/all" className="btn">
            Start shopping
          </Link>
        </div>
      </main>
    );
  }

  const totals = cart || {
    subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    discount_total: 0,
    shipping_total: 0,
    tax_total: 0,
    gift_card_applied: 0,
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };
  const currency = cart?.currency || 'USD';

  return (
    <main className="container page">
      <h1>Your cart</h1>
      <div className="cart-layout">
        <div>
          {error ? <div className="notice error">{error}</div> : null}
          {items.map((item) => (
            <div className="cart-line" key={item.variantId}>
              {item.image ? (
                <img src={item.image} alt={item.title} />
              ) : (
                <div style={{ width: 96, height: 112, background: 'var(--paper-soft)', borderRadius: 10 }} />
              )}
              <div>
                <h3>
                  <Link href={`/products/${item.handle}`}>{item.title}</Link>
                </h3>
                <p className="product-meta" style={{ marginBottom: 8 }}>
                  {item.variantTitle} · {formatMoney(item.price, currency)}
                </p>
                <div className="qty">
                  <button type="button" onClick={() => setQuantity(item.variantId, item.quantity - 1)} aria-label="Decrease quantity">
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => setQuantity(item.variantId, item.quantity + 1)} aria-label="Increase quantity">
                    +
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="remove-link" onClick={() => remove(item.variantId)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="line-total" style={{ textAlign: 'right' }}>
                {formatMoney(item.price * item.quantity, currency)}
              </div>
            </div>
          ))}

          <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
            <div className="field">
              <label htmlFor="discount">Discount code</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="discount"
                  value={discountInput}
                  onChange={(event) => setDiscountInput(event.target.value)}
                  placeholder="WELCOME10"
                />
                <button className="btn secondary small" type="button" onClick={applyDiscount}>
                  Apply
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="giftcard">Gift card</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="giftcard"
                  value={giftInput}
                  onChange={(event) => setGiftInput(event.target.value)}
                  placeholder="GC-XXXX-XXXX"
                />
                <button className="btn secondary small" type="button" onClick={applyGiftCard}>
                  Redeem
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="summary">
          <h2>Order summary</h2>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(totals.subtotal, currency)}</span>
          </div>
          {totals.discount_total > 0 ? (
            <div className="summary-row discount">
              <span>Discount</span>
              <span>−{formatMoney(totals.discount_total, currency)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Shipping</span>
            <span>{totals.shipping_total > 0 ? formatMoney(totals.shipping_total, currency) : 'Free'}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span>
            <span>{formatMoney(totals.tax_total, currency)}</span>
          </div>
          {totals.gift_card_applied > 0 ? (
            <div className="summary-row discount">
              <span>Gift card</span>
              <span>−{formatMoney(totals.gift_card_applied, currency)}</span>
            </div>
          ) : null}
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatMoney(totals.total, currency)}</span>
          </div>
          <div style={{ marginTop: 20 }}>
            <Link href="/checkout" className="btn accent block" aria-disabled={pending || Boolean(error)}>
              {pending ? 'Updating…' : 'Continue to checkout'}
            </Link>
          </div>
          <p className="product-meta" style={{ marginTop: 14 }}>
            Taxes and shipping are calculated server-side at checkout.
          </p>
        </aside>
      </div>
    </main>
  );
}
