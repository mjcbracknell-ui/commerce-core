import express from 'express';
import prisma from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { serializeOrder } from '../lib/serializers.js';

const router = express.Router();

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [paidAgg, ordersCount, customersCount, productsCount, lowStock, recentOrders, paidRecent] =
      await Promise.all([
        prisma.order.aggregate({
          where: { storeId: req.storeId, financialStatus: 'paid' },
          _sum: { total: true },
          _count: true,
        }),
        prisma.order.count({ where: { storeId: req.storeId } }),
        prisma.customer.count({ where: { storeId: req.storeId } }),
        prisma.product.count({ where: { storeId: req.storeId, status: { not: 'archived' } } }),
        prisma.variant.count({ where: { product: { storeId: req.storeId }, inventory: { lte: 5 } } }),
        prisma.order.findMany({
          where: { storeId: req.storeId },
          include: { customer: true },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        prisma.order.findMany({
          where: { storeId: req.storeId, financialStatus: 'paid', createdAt: { gte: since } },
          select: { total: true, createdAt: true, lineItems: true },
        }),
      ]);

    const revenue = Number(paidAgg._sum.total || 0);
    const paidOrders = paidAgg._count || 0;

    const byDay = new Map();
    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(date.toISOString().slice(0, 10), { date: date.toISOString().slice(0, 10), revenue: 0, orders: 0 });
    }
    const productSales = new Map();
    for (const order of paidRecent) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.revenue = Math.round((bucket.revenue + Number(order.total)) * 100) / 100;
        bucket.orders += 1;
      }
      for (const item of order.lineItems || []) {
        const entry = productSales.get(item.productId || item.title) || {
          title: item.title,
          product_id: item.productId,
          quantity: 0,
          revenue: 0,
        };
        entry.quantity += Number(item.quantity) || 0;
        entry.revenue = Math.round((entry.revenue + Number(item.price) * Number(item.quantity)) * 100) / 100;
        productSales.set(item.productId || item.title, entry);
      }
    }

    return res.json({
      revenue,
      orders_count: ordersCount,
      paid_orders_count: paidOrders,
      average_order_value: paidOrders ? Math.round((revenue / paidOrders) * 100) / 100 : 0,
      customers_count: customersCount,
      products_count: productsCount,
      low_stock_count: lowStock,
      revenue_last_30_days: Math.round(paidRecent.reduce((sum, o) => sum + Number(o.total), 0) * 100) / 100,
      sales_last_30_days: [...byDay.values()],
      top_products: [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      recent_orders: recentOrders.map((order) => serializeOrder(order)),
    });
  }),
);

export default router;
