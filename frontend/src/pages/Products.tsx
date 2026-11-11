import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { api, formatMoney, type Product, type ProductInput } from '../api';
import { useAuth } from '../auth';
import { StockStatus } from './Dashboard';

const EMPTY_FORM: ProductInput = { name: '', sku: '', category: '', price: 0, stock: 0, lowStockThreshold: 5 };

export function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  /** null = dialog closed, 'new' = adding, Product = editing that product. */
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const load = useCallback((term: string) => {
    return api
      .products(term)
      .then((result) => {
        setProducts(result);
        setError('');
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  // Search on the server, 250 ms after the user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => void load(search), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function handleDelete(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? Past sales keep their record of it.`)) return;
    try {
      await api.deleteProduct(product._id);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Products</h1>
        {isAdmin && (
          <button type="button" className="button-primary" onClick={() => setEditing('new')}>
            Add product
          </button>
        )}
      </div>

      <div className="toolbar">
        <label htmlFor="product-search" className="visually-hidden">
          Search products
        </label>
        <input
          id="product-search"
          type="search"
          placeholder="Search by name, SKU or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {products && (
          <span className="muted" aria-live="polite">
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
        )}
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <section className="card card-flush">
        {!products ? (
          <p className="page-status">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="empty">{search ? `No products match "${search}".` : 'No products yet.'}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th className="num">Price</th>
                  <th className="num">Stock</th>
                  <th>Status</th>
                  {isAdmin && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td>{product.name}</td>
                    <td className="mono">{product.sku}</td>
                    <td>{product.category}</td>
                    <td className="num">{formatMoney(product.price)}</td>
                    <td className="num">{product.stock}</td>
                    <td>
                      <StockStatus product={product} />
                    </td>
                    {isAdmin && (
                      <td className="actions">
                        <button type="button" className="button-quiet" onClick={() => setEditing(product)}>
                          Edit
                        </button>
                        <button type="button" className="button-quiet button-danger" onClick={() => handleDelete(product)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(search);
          }}
        />
      )}
    </>
  );
}

function ProductDialog({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ProductInput>(() => {
    if (!product) return EMPTY_FORM;
    const { _id: _ignored, ...fields } = product;
    return {
      name: fields.name,
      sku: fields.sku,
      category: fields.category,
      price: fields.price,
      stock: fields.stock,
      lowStockThreshold: fields.lowStockThreshold,
    };
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // A native <dialog> opened with showModal() traps focus and closes on Escape.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (product) await api.updateProduct(product._id, form);
      else await api.createProduct(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="product-dialog-title">
      <form onSubmit={handleSubmit}>
        <h2 id="product-dialog-title">{product ? 'Edit product' : 'Add product'}</h2>

        <label htmlFor="p-name">Name</label>
        <input id="p-name" required maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />

        <div className="form-row">
          <div>
            <label htmlFor="p-sku">SKU</label>
            <input
              id="p-sku"
              required
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,39}"
              title="2-40 characters: letters, digits, dot, dash or underscore"
              value={form.sku}
              onChange={(e) => set('sku', e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label htmlFor="p-category">Category</label>
            <input
              id="p-category"
              required
              maxLength={60}
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row form-row-3">
          <div>
            <label htmlFor="p-price">Price</label>
            <input
              id="p-price"
              type="number"
              required
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => set('price', e.target.valueAsNumber)}
            />
          </div>
          <div>
            <label htmlFor="p-stock">Stock</label>
            <input
              id="p-stock"
              type="number"
              required
              min={0}
              step={1}
              value={form.stock}
              onChange={(e) => set('stock', e.target.valueAsNumber)}
            />
          </div>
          <div>
            <label htmlFor="p-threshold">Low-stock alert at</label>
            <input
              id="p-threshold"
              type="number"
              required
              min={0}
              step={1}
              value={form.lowStockThreshold}
              onChange={(e) => set('lowStockThreshold', e.target.valueAsNumber)}
            />
          </div>
        </div>

        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
