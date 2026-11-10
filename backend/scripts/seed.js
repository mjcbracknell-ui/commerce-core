import bcrypt from 'bcryptjs';
import prisma from '../src/db.js';
import { loadBundledTheme } from '../src/lib/theme.js';
import { round2 } from '../src/lib/pricing.js';

const money = (value) => Math.round(Number(value) * 100) / 100;

function placeholderImage(label, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="430" r="210" fill="rgba(255,255,255,0.12)"/><text x="400" y="450" font-family="Georgia, serif" font-size="46" fill="rgba(255,255,255,0.92)" text-anchor="middle">${label}</text><text x="400" y="540" font-family="Helvetica, sans-serif" font-size="18" letter-spacing="6" fill="rgba(255,255,255,0.7)" text-anchor="middle">COMMERCECORE</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CATALOG = [
  {
    title: 'Heavyweight Organic Tee',
    handle: 'heavyweight-organic-tee',
    vendor: 'Northwind',
    type: 'T-Shirts',
    tags: ['apparel', 'organic', 'bestseller'],
    price: 32,
    compareAtPrice: 40,
    descriptionHtml:
      '<p>240gsm organic cotton with a boxy, structured drape. Pre-washed so it keeps its shape and gets softer with every wear.</p><ul><li>100% GOTS-certified organic cotton</li><li>Ribbed neckline that will not stretch out</li><li>Made in Portugal</li></ul>',
    image: ['#e8d7bf', '#a9754f'],
    sizes: ['S', 'M', 'L', 'XL'],
    inventory: [18, 26, 22, 9],
  },
  {
    title: 'Cropped Denim Jacket',
    handle: 'cropped-denim-jacket',
    vendor: 'Northwind',
    type: 'Outerwear',
    tags: ['apparel', 'denim'],
    price: 148,
    compareAtPrice: null,
    descriptionHtml:
      '<p>A boxy, cropped take on the classic trucker jacket in 12oz rigid denim. Breaks in beautifully and holds its shape.</p>',
    image: ['#c9d3dd', '#4d6478'],
    sizes: ['S', 'M', 'L'],
    inventory: [7, 11, 5],
  },
  {
    title: 'Merino Crew Sweater',
    handle: 'merino-crew-sweater',
    vendor: 'Northwind',
    type: 'Knitwear',
    tags: ['apparel', 'merino', 'new'],
    price: 120,
    compareAtPrice: null,
    descriptionHtml:
      '<p>Fine-gauge extra-fine merino with a clean crew neck. Warm without bulk, breathable enough for all but the hottest days.</p>',
    image: ['#dcd8cc', '#8d8674'],
    sizes: ['S', 'M', 'L', 'XL'],
    inventory: [12, 15, 13, 6],
  },
  {
    title: 'Relaxed Pleated Chino',
    handle: 'relaxed-pleated-chino',
    vendor: 'Northwind',
    type: 'Trousers',
    tags: ['apparel', 'bestseller'],
    price: 88,
    compareAtPrice: 110,
    descriptionHtml:
      '<p>A single-pleat chino cut with room through the thigh and a gentle taper below the knee. Garment-dyed for depth of colour.</p>',
    image: ['#e5dccb', '#9b8563'],
    sizes: ['28', '30', '32', '34', '36'],
    inventory: [6, 10, 12, 8, 4],
  },
  {
    title: 'Canvas Weekender',
    handle: 'canvas-weekender',
    vendor: 'Northwind Supply',
    type: 'Bags',
    tags: ['accessories', 'travel'],
    price: 165,
    compareAtPrice: null,
    descriptionHtml:
      '<p>18oz waxed canvas, full-grain leather handles and a brass zip that will outlive the bag. Fits a 48-hour trip.</p>',
    image: ['#d9c3a9', '#6b4a33'],
    sizes: [],
    inventory: [14],
  },
  {
    title: 'Leather Card Holder',
    handle: 'leather-card-holder',
    vendor: 'Northwind Supply',
    type: 'Accessories',
    tags: ['accessories', 'leather'],
    price: 58,
    compareAtPrice: null,
    descriptionHtml:
      '<p>Vegetable-tanned leather cut from a single piece, folded and saddle-stitched. Holds six cards and a few notes.</p>',
    image: ['#e0c8b0', '#7d4a2c'],
    sizes: [],
    inventory: [32],
  },
  {
    title: 'Ribbed Wool Beanie',
    handle: 'ribbed-wool-beanie',
    vendor: 'Northwind',
    type: 'Accessories',
    tags: ['accessories', 'new'],
    price: 38,
    compareAtPrice: null,
    descriptionHtml:
      '<p>Double-layer lambswool rib with a deep turn-up. Warm, itch-free and small enough to live in a coat pocket.</p>',
    image: ['#cfd6cd', '#5c6b5c'],
    sizes: ['One size'],
    inventory: [40],
  },
  {
    title: 'Linen Overshirt',
    handle: 'linen-overshirt',
    vendor: 'Northwind',
    type: 'Shirts',
    tags: ['apparel', 'linen', 'new'],
    price: 110,
    compareAtPrice: null,
    descriptionHtml:
      '<p>European linen with a soft, slubby texture. Wear it open over a tee or buttoned as a light jacket.</p>',
    image: ['#e9e2d3', '#a99b7d'],
    sizes: ['S', 'M', 'L', 'XL'],
    inventory: [9, 14, 12, 7],
  },
  {
    title: 'Everyday Court Sneaker',
    handle: 'everyday-court-sneaker',
    vendor: 'Northwind Supply',
    type: 'Footwear',
    tags: ['footwear', 'bestseller'],
    price: 135,
    compareAtPrice: 160,
    descriptionHtml:
      '<p>A low-profile court sneaker in full-grain leather with a recycled rubber sole. Resoleable, so you keep them longer.</p>',
    image: ['#e4e4e0', '#8f8f88'],
    sizes: ['40', '41', '42', '43', '44', '45'],
    inventory: [5, 8, 10, 9, 6, 3],
  },
  {
    title: 'Cotton Crew Socks (3-pack)',
    handle: 'cotton-crew-socks-3-pack',
    vendor: 'Northwind',
    type: 'Accessories',
    tags: ['accessories', 'essentials'],
    price: 24,
    compareAtPrice: null,
    descriptionHtml:
      '<p>Three pairs of combed cotton crew socks with a reinforced heel and toe. The only socks you will need.</p>',
    image: ['#e7e0d2', '#9a8f77'],
    sizes: ['One size'],
    inventory: [60],
  },
  {
    title: 'Field Watch',
    handle: 'field-watch',
    vendor: 'Northwind Supply',
    type: 'Accessories',
    tags: ['accessories', 'gift'],
    price: 220,
    compareAtPrice: null,
    descriptionHtml:
      '<p>36mm brushed steel case, sapphire crystal and a Japanese automatic movement. A quiet, legible everyday watch.</p>',
    image: ['#d6d9d3', '#4c5350'],
    sizes: [],
    inventory: [6],
  },
  {
    title: 'Stoneware Mug',
    handle: 'stoneware-mug',
    vendor: 'Northwind Supply',
    type: 'Home',
    tags: ['home', 'gift', 'new'],
    price: 28,
    compareAtPrice: null,
    descriptionHtml:
      '<p>Wheel-thrown stoneware with a speckled matte glaze. Holds 350ml and keeps coffee warm longer than it should.</p>',
    image: ['#e6d8c8', '#8a6a52'],
    sizes: [],
    inventory: [26],
  },
];

const CUSTOMERS = [
  { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
  { email: 'grace@example.com', firstName: 'Grace', lastName: 'Hopper' },
  { email: 'alan@example.com', firstName: 'Alan', lastName: 'Turing' },
  { email: 'katherine@example.com', firstName: 'Katherine', lastName: 'Johnson' },
  { email: 'linus@example.com', firstName: 'Linus', lastName: 'Torvalds' },
  { email: 'margaret@example.com', firstName: 'Margaret', lastName: 'Hamilton' },
];

async function main() {
  console.log('Seeding CommerceCore demo data…');

  const password = await bcrypt.hash('Admin123!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: { password, name: 'Demo Owner', role: 'owner' },
    create: { email: 'admin@demo.com', password, name: 'Demo Owner', role: 'owner' },
  });

  const settings = {
    currency: 'USD',
    taxRate: 0,
    shippingFlatRate: 6.95,
    freeShippingThreshold: 100,
    supportEmail: 'hello@northwind.test',
    orderPrefix: '',
  };

  const store = await prisma.store.upsert({
    where: { domain: 'localhost' },
    update: { name: 'Northwind Supply', currency: 'USD', settings },
    create: { name: 'Northwind Supply', domain: 'localhost', currency: 'USD', settings },
  });

  await prisma.storeUser.upsert({
    where: { storeId_userId: { storeId: store.id, userId: user.id } },
    update: { role: 'owner' },
    create: { storeId: store.id, userId: user.id, role: 'owner' },
  });

  // Products & variants
  const productRecords = [];
  for (const item of CATALOG) {
    const images = [{ src: placeholderImage(item.title.split(' ').slice(0, 2).join(' '), item.image[0], item.image[1]), alt: item.title }];
    const existing = await prisma.product.findUnique({
      where: { storeId_handle: { storeId: store.id, handle: item.handle } },
      include: { variants: true },
    });

    let product;
    if (existing) {
      product = await prisma.product.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          descriptionHtml: item.descriptionHtml,
          vendor: item.vendor,
          productType: item.type,
          tags: item.tags,
          images,
          featuredImage: images[0].src,
          status: 'active',
        },
        include: { variants: true },
      });
      if (!product.variants.length) {
        await prisma.variant.create({
          data: {
            productId: product.id,
            title: item.sizes.length ? item.sizes[0] : 'Default Title',
            sku: `${item.handle.slice(0, 8).toUpperCase()}-1`,
            price: item.price,
            compareAtPrice: item.compareAtPrice,
            inventory: item.inventory[0],
          },
        });
        product = await prisma.product.findUnique({ where: { id: product.id }, include: { variants: true } });
      }
    } else {
      product = await prisma.product.create({
        data: {
          storeId: store.id,
          title: item.title,
          handle: item.handle,
          descriptionHtml: item.descriptionHtml,
          vendor: item.vendor,
          productType: item.type,
          status: 'active',
          tags: item.tags,
          images,
          featuredImage: images[0].src,
          publishedAt: new Date(),
          variants: {
            create: (item.sizes.length ? item.sizes : ['Default Title']).map((size, index) => ({
              title: size,
              sku: `${item.handle.slice(0, 8).toUpperCase()}-${index + 1}`,
              price: item.price,
              compareAtPrice: item.compareAtPrice,
              inventory: item.inventory[index] ?? 10,
              option1: size,
              position: index,
            })),
          },
        },
        include: { variants: true },
      });
    }
    productRecords.push(product);
  }

  // Collections
  const collections = [
    { title: 'New arrivals', handle: 'new-arrivals', picks: ['merino-crew-sweater', 'linen-overshirt', 'stoneware-mug', 'ribbed-wool-beanie'] },
    { title: 'Essentials', handle: 'essentials', picks: ['heavyweight-organic-tee', 'cotton-crew-socks-3-pack', 'relaxed-pleated-chino', 'everyday-court-sneaker'] },
    { title: 'Accessories', handle: 'accessories', picks: ['canvas-weekender', 'leather-card-holder', 'field-watch', 'ribbed-wool-beanie'] },
  ];

  for (const collection of collections) {
    const record = await prisma.collection.upsert({
      where: { storeId_handle: { storeId: store.id, handle: collection.handle } },
      update: { title: collection.title },
      create: {
        storeId: store.id,
        title: collection.title,
        handle: collection.handle,
        descriptionHtml: `<p>${collection.title} from Northwind Supply.</p>`,
      },
    });
    const count = await prisma.collectionProduct.count({ where: { collectionId: record.id } });
    if (!count) {
      const picks = productRecords.filter((product) => collection.picks.includes(product.handle));
      await prisma.collectionProduct.createMany({
        data: picks.map((product, position) => ({ collectionId: record.id, productId: product.id, position })),
        skipDuplicates: true,
      });
    }
  }

  // Customers
  const customerRecords = [];
  for (const customer of CUSTOMERS) {
    const record = await prisma.customer.upsert({
      where: { storeId_email: { storeId: store.id, email: customer.email } },
      update: { firstName: customer.firstName, lastName: customer.lastName },
      create: { storeId: store.id, ...customer },
    });
    customerRecords.push(record);
  }

  // Orders
  const orderCount = await prisma.order.count({ where: { storeId: store.id } });
  if (orderCount === 0) {
    const variants = productRecords.flatMap((product) =>
      product.variants.map((variant) => ({ ...variant, product })),
    );
    const pickVariant = (index) => variants[index % variants.length];
    const statuses = [
      { financialStatus: 'paid', fulfillmentStatus: 'fulfilled', daysAgo: 21 },
      { financialStatus: 'paid', fulfillmentStatus: 'fulfilled', daysAgo: 18 },
      { financialStatus: 'paid', fulfillmentStatus: 'unfulfilled', daysAgo: 12 },
      { financialStatus: 'paid', fulfillmentStatus: 'unfulfilled', daysAgo: 8 },
      { financialStatus: 'pending', fulfillmentStatus: 'unfulfilled', daysAgo: 5 },
      { financialStatus: 'paid', fulfillmentStatus: 'fulfilled', daysAgo: 3 },
      { financialStatus: 'paid', fulfillmentStatus: 'unfulfilled', daysAgo: 1 },
      { financialStatus: 'refunded', fulfillmentStatus: 'unfulfilled', daysAgo: 2 },
    ];

    for (let index = 0; index < statuses.length; index += 1) {
      const status = statuses[index];
      const customer = customerRecords[index % customerRecords.length];
      const first = pickVariant(index * 2);
      const second = pickVariant(index * 2 + 3);
      const lines = [
        {
          variantId: first.id,
          productId: first.product.id,
          title: first.product.title,
          variantTitle: first.title,
          handle: first.product.handle,
          sku: first.sku,
          image: first.product.featuredImage,
          price: Number(first.price),
          quantity: 1 + (index % 2),
          lineTotal: money(Number(first.price) * (1 + (index % 2))),
        },
        {
          variantId: second.id,
          productId: second.product.id,
          title: second.product.title,
          variantTitle: second.title,
          handle: second.product.handle,
          sku: second.sku,
          image: second.product.featuredImage,
          price: Number(second.price),
          quantity: 1,
          lineTotal: money(Number(second.price)),
        },
      ];
      const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
      const shippingTotal = subtotal >= 100 ? 0 : 6.95;
      const total = round2(subtotal + shippingTotal);
      const createdAt = new Date(Date.now() - status.daysAgo * 24 * 60 * 60 * 1000);

      await prisma.order.create({
        data: {
          storeId: store.id,
          number: String(1001 + index),
          customerId: customer.id,
          email: customer.email,
          financialStatus: status.financialStatus,
          fulfillmentStatus: status.fulfillmentStatus,
          currency: 'USD',
          subtotal,
          shippingTotal,
          total,
          lineItems: lines,
          paymentMethod: index % 3 === 0 ? 'stripe' : 'manual',
          shippingAddress: {
            first_name: customer.firstName,
            last_name: customer.lastName,
            address1: `${100 + index} Market Street`,
            city: 'Portland',
            region: 'OR',
            postal_code: '97205',
            country: 'United States',
          },
          paidAt: status.financialStatus === 'paid' ? createdAt : null,
          fulfilledAt: status.fulfillmentStatus === 'fulfilled' ? createdAt : null,
          createdAt,
        },
      });

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ordersCount: { increment: 1 },
          totalSpent: { increment: total },
        },
      });
    }
  }

  // Discounts
  const discounts = [
    { code: 'WELCOME10', type: 'percentage', value: 10, minSubtotal: null, usageLimit: null },
    { code: 'SAVE20', type: 'fixed_amount', value: 20, minSubtotal: 100, usageLimit: 100 },
    { code: 'FREESHIP', type: 'free_shipping', value: 0, minSubtotal: null, usageLimit: null },
  ];
  for (const discount of discounts) {
    await prisma.discount.upsert({
      where: { storeId_code: { storeId: store.id, code: discount.code } },
      update: { active: true },
      create: { storeId: store.id, ...discount },
    });
  }

  await prisma.giftCard.upsert({
    where: { storeId_code: { storeId: store.id, code: 'GC-DEMO-50' } },
    update: {},
    create: { storeId: store.id, code: 'GC-DEMO-50', balance: 50, currency: 'USD' },
  });

  // Theme
  const themeCount = await prisma.theme.count({ where: { storeId: store.id } });
  if (!themeCount) {
    const bundled = loadBundledTheme('dawn-clone');
    if (bundled) {
      await prisma.theme.create({
        data: { storeId: store.id, name: 'Dawn Clone', files: bundled.files, isActive: true },
      });
    }
  }

  console.log('\nSeed complete.');
  console.log('  Admin:      http://localhost:3001  →  admin@demo.com / Admin123!');
  console.log('  Storefront: http://localhost:3000');
  console.log('  Backend:    http://localhost:4000');
  console.log('  Discounts:  WELCOME10, SAVE20, FREESHIP');
  console.log('  Gift card:  GC-DEMO-50 ($50)');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
