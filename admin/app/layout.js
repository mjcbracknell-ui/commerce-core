import './globals.css';

export const metadata = {
  title: 'Commerce Core Admin',
  description: 'Manage products, orders, customers and themes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
