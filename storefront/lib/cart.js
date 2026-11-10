'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCart = create(
  persist(
    (set, get) => ({
      items: [],
      discountCode: '',
      giftCardCode: '',

      add(item) {
        const existing = get().items.find((line) => line.variantId === item.variantId);
        if (existing) {
          const max = item.maxQuantity ?? existing.maxQuantity ?? 99;
          set({
            items: get().items.map((line) =>
              line.variantId === item.variantId
                ? { ...line, quantity: Math.min(line.quantity + item.quantity, max) }
                : line,
            ),
          });
          return;
        }
        set({ items: [...get().items, item] });
      },

      remove(variantId) {
        set({ items: get().items.filter((line) => line.variantId !== variantId) });
      },

      setQuantity(variantId, quantity) {
        const next = Math.max(1, Number(quantity) || 1);
        set({
          items: get().items.map((line) =>
            line.variantId === variantId
              ? { ...line, quantity: Math.min(next, line.maxQuantity ?? 99) }
              : line,
          ),
        });
      },

      setDiscountCode(code) {
        set({ discountCode: code || '' });
      },

      setGiftCardCode(code) {
        set({ giftCardCode: code || '' });
      },

      clear() {
        set({ items: [], discountCode: '', giftCardCode: '' });
      },
    }),
    { name: 'commercecore-cart' },
  ),
);

export const cartCount = (items) => items.reduce((sum, line) => sum + line.quantity, 0);
export const cartSubtotal = (items) =>
  Math.round(items.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0) * 100) / 100;
