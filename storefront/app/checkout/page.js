'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../../lib/cart';
import { apiFetch } from '../../lib/client';
import { formatMoney } from '../../lib/money';

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((state) => state.items);
  const discountCode = useCart((state) => state.discountCode);
  const giftCardCode = useCart((state) => state.giftCardCode);
  const clear = useCart((state) => state.clear);

  const [cart, setCart] = useState(null);
  const [settings, setSettings] = useState(null);
  const [account, setAccount] = useState(null);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'United States',
    phone: '',
    notes: '',
    paymentMethod: 'manual',
  });

  const payload = useMemo(
    () => items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    [items],
  );
  const signature = JSON.stringify(payload);

  useEffect(() => {
    if (!payload.length) return;
    let alive = true;
    apiFetch('/api/storefront/settings')
      .then((settingsData) => {
        if (!alive) return;
        setSettings(settingsData);
        setForm((current) => ({
          ...current,
          paymentMethod: settingsData.payments?.stripe ? 'stripe' : 'manual',
        }));
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (!payload.length) return;
    let alive = true;
    const timer = setTimeout(() => {
      apiFetch('/api/storefront/cart', {
        method: 'POST',
        body: {
          items: payload,
          discountCode: discountCode || undefined,
          giftCardCode: giftCardCode || undefined,
          shippingAddress: {
            country: form.country,
            region: form.region,
            postal_code: form.postalCode,
            city: form.city,
          },
        },
      })
        .then((cartData) => {
          if (alive) setCart(cartData.cart);
        })
        .catch((err) => alive && setError(err.message));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, discountCode, giftCardCode, form.country, form.region]);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/storefront/account')
      .then((data) => {
        if (!alive) return;
        setAccount(data.customer);
        setSavedAddresses(data.addresses || []);
        const preferred = (data.addresses || []).find((address) => address.is_default) || data.addresses?.[0];
        setForm((current) => ({
          ...current,
          email: current.email || data.customer.email || '',
          firstName: current.firstName || preferred?.first_name || data.customer.first_name || '',
          lastName: current.lastName || preferred?.last_name || data.customer.last_name || '',
          phone: current.phone || preferred?.phone || data.customer.phone || '',
          ...(preferred
            ? {
                address1: current.address1 || preferred.address1 || '',
                address2: current.address2 || preferred.address2 || '',
                city: current.city || preferred.city || '',
                region: current.region || preferred.region || '',
                postalCode: current.postalCode || preferred.postal_code || '',
                country: current.country || preferred.country || current.country,
              }
            : {}),
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const applySavedAddress = (event) => {
    const address = savedAddresses.find((item) => item.id === event.target.value);
    if (!address) return;
    setForm((current) => ({
      ...current,
      firstName: address.first_name || '',
      lastName: address.last_name || '',
      address1: address.address1 || '',
      address2: address.address2 || '',
      city: address.city || '',
      region: address.region || '',
      postalCode: address.postal_code || '',
      country: address.country || current.country,
      phone: address.phone || current.phone,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!items.length) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await apiFetch('/api/storefront/checkout', {
        method: 'POST',
        body: {
          email: form.email,
          items: payload,
          discountCode: discountCode || undefined,
          giftCardCode: giftCardCode || undefined,
          paymentMethod: form.paymentMethod,
          notes: form.notes || undefined,
          shippingAddress: {
            first_name: form.firstName,
            last_name: form.lastName,
            address1: form.address1,
            address2: form.address2,
            city: form.city,
            region: form.region,
            postal_code: form.postalCode,
            country: form.country,
            phone: form.phone,
          },
        },
      });
      clear();
      if (data.payment?.url) {
        window.location.href = data.payment.url;
        return;
      }
      router.push(`/orders/${data.order.number}?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (!items.length) {
    return (
      <main className="container page">
        <h1>Checkout</h1>
        <div className="empty">
          <h3>Your cart is empty</h3>
          <p>Add something before checking out.</p>
          <Link href="/collections/all" className="btn">
            Shop now
          </Link>
        </div>
      </main>
    );
  }

  const currency = cart?.currency || 'USD';
  const stripeReady = settings?.payments?.stripe;

  return (
    <main className="container page">
      <h1>Checkout</h1>
      <div className="cart-layout">
        <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
          {error ? <div className="notice error">{error}</div> : null}

          <section>
            <h2 style={{ fontSize: '1.2rem' }}>Contact</h2>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={form.email} onChange={update('email')} />
            </div>
            {account ? (
              <p className="product-meta" style={{ marginTop: 10 }}>
                Signed in as {account.email}. Your details are prefilled from your account.
              </p>
            ) : (
              <p className="product-meta" style={{ marginTop: 10 }}>
                <Link href="/account/login?next=/checkout" className="link-arrow">
                  Sign in
                </Link>{' '}
                to prefill your details and see this order in your account.
              </p>
            )}
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem' }}>Shipping address</h2>
            {savedAddresses.length ? (
              <div className="field" style={{ marginBottom: 16 }}>
                <label htmlFor="savedAddress">Saved address</label>
                <select id="savedAddress" defaultValue="" onChange={applySavedAddress}>
                  <option value="">Choose a saved address</option>
                  {savedAddresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label ? `${address.label} — ` : ''}
                      {address.address1}, {address.city}
                      {address.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="row">
              <div className="field">
                <label htmlFor="firstName">First name</label>
                <input id="firstName" required value={form.firstName} onChange={update('firstName')} />
              </div>
              <div className="field">
                <label htmlFor="lastName">Last name</label>
                <input id="lastName" required value={form.lastName} onChange={update('lastName')} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="address1">Address</label>
              <input id="address1" required value={form.address1} onChange={update('address1')} />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="address2">Apartment, suite (optional)</label>
              <input id="address2" value={form.address2} onChange={update('address2')} />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="city">City</label>
                <input id="city" required value={form.city} onChange={update('city')} />
              </div>
              <div className="field">
                <label htmlFor="region">State / region</label>
                <input id="region" value={form.region} onChange={update('region')} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="postalCode">Postal code</label>
                <input id="postalCode" required value={form.postalCode} onChange={update('postalCode')} />
              </div>
              <div className="field">
                <label htmlFor="country">Country</label>
                <input id="country" required value={form.country} onChange={update('country')} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="phone">Phone (optional)</label>
              <input id="phone" value={form.phone} onChange={update('phone')} />
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem' }}>Payment</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {stripeReady ? (
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="payment"
                    value="stripe"
                    checked={form.paymentMethod === 'stripe'}
                    onChange={update('paymentMethod')}
                    style={{ width: 'auto' }}
                  />
                  Pay by card (Stripe secure checkout)
                </label>
              ) : null}
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="payment"
                  value="manual"
                  checked={form.paymentMethod === 'manual'}
                  onChange={update('paymentMethod')}
                  style={{ width: 'auto' }}
                />
                Pay on delivery / manual payment
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="payment"
                  value="cod"
                  checked={form.paymentMethod === 'cod'}
                  onChange={update('paymentMethod')}
                  style={{ width: 'auto' }}
                />
                Cash on delivery
              </label>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="notes">Order notes (optional)</label>
              <textarea id="notes" rows={3} value={form.notes} onChange={update('notes')} />
            </div>
          </section>

          <button className="btn accent" type="submit" disabled={submitting}>
            {submitting
              ? 'Placing order…'
              : `Place order — ${formatMoney(cart?.total ?? 0, currency)}`}
          </button>
          <p className="product-meta">
            By placing this order you agree to the store&apos;s terms. Payment is collected outside this page
            for manual orders.
          </p>
        </form>

        <aside className="summary">
          <h2>Your order</h2>
          {items.map((item) => (
            <div className="summary-row" key={item.variantId}>
              <span>
                {item.title} × {item.quantity}
              </span>
              <span>{formatMoney(item.price * item.quantity, currency)}</span>
            </div>
          ))}
          <div className="summary-row" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
            <span>Subtotal</span>
            <span>{formatMoney(cart?.subtotal ?? 0, currency)}</span>
          </div>
          {cart?.discount_total > 0 ? (
            <div className="summary-row discount">
              <span>Discount {discountCode ? `(${discountCode})` : ''}</span>
              <span>−{formatMoney(cart.discount_total, currency)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Shipping</span>
            <span>{cart?.shipping_total > 0 ? formatMoney(cart.shipping_total, currency) : 'Free'}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span>
            <span>{formatMoney(cart?.tax_total ?? 0, currency)}</span>
          </div>
          {cart?.gift_card_applied > 0 ? (
            <div className="summary-row discount">
              <span>Gift card</span>
              <span>−{formatMoney(cart.gift_card_applied, currency)}</span>
            </div>
          ) : null}
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatMoney(cart?.total ?? 0, currency)}</span>
          </div>
          <p className="product-meta" style={{ marginTop: 14 }}>
            Secure checkout · No platform transaction fees
          </p>
        </aside>
      </div>
    </main>
  );
}
