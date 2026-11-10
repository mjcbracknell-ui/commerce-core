'use client';

import ProductForm from '../../../../components/ProductForm';

export default function NewProductPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>New product</h1>
          <p>Add a product with at least one variant.</p>
        </div>
      </div>
      <ProductForm />
    </>
  );
}
