import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { getStore } from '../lib/api';

export const metadata = {
  title: 'CommerceCore Store',
  description: 'A fast, self-hosted storefront powered by CommerceCore.',
};

export default async function RootLayout({ children }) {
  const data = await getStore();
  const storeName = data?.store?.name || 'CommerceCore';
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
