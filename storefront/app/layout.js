import './globals.css';
import { notFound } from 'next/navigation';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { getStore } from '../lib/api';

export async function generateMetadata() {
  const data = await getStore();
  const storeName = data?.store?.name;
  return {
    title: storeName ? `${storeName} — Store` : 'Store not found',
    description: storeName ? `Shop ${storeName} online.` : 'This storefront is not configured.',
  };
}

export default async function RootLayout({ children }) {
  const data = await getStore();
  if (!data?.store) notFound();
  const storeName = data?.store?.name || 'Commerce Core';
  const currency = data?.store?.currency || 'USD';

  return (
    <html lang="en">
      <body>
        <Header storeName={storeName} />
        {children}
        <Footer storeName={storeName} currency={currency} />
      </body>
    </html>
  );
}
