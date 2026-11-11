import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { api, formatMoney, type LowStockAlert, type Product, type Sale } from '../api';

interface Line {
  productId: string;
  quantity: number;
}

export function NewSale() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ sale: Sale; lowStockAlerts: LowStockAlert[] } | null>(null);

  const loadProducts = () =>
    api
      .products()
      .then(setProducts)
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    void loadProducts();
  }, []);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p._id, p])), [products]);

  const selected = byId.get(productId);
  const alreadyInSale = lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const available = selected ? selected.stock - alreadyInSale : 0;

  const total = lines.reduce((sum, line) => sum + (byId.get(line.productId)?.price ?? 0) * line.quantity, 0);

  function addLine(event: SubmitEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Quantity must be a whole number of at least 1.');
      return;
    }
    // A friendly early check. The server enforces the real rule when the sale is saved.
    if (quantity > available) {
      setError(`Only ${available} more of "${selected.name}" available.`);
      return;
    }
    setError('');
    setReceipt(null);
    setLines((current) =>
      current.some((l) => l.productId === productId)
        ? current.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l))
        : [...current, { productId, quantity }],
    );
    setProductId('');
    setQuantity(1);
  }

  async function completeSale() {
    setSubmitting(true);
    setError('');
    try {
      const result = await api.createSale(lines);
      setReceipt(result);
      setLines([]);
    } catch (err) {
      // e.g. 409 when someone else sold the last units in the meantime
      setError(err instanceof Error ? err.message : 'Could not save the sale');
    } finally {
      setSubmitting(false);
      void loadProducts(); // refresh stock numbers either way
    }
  }

  if (!products && !error) return <p className="page-status">Loading products…</p>;

  return (
    <>
      <div className="page-header">
        <h1>New sale</h1>
      </div>

      {receipt && (
        <div className="alert alert-success" role="status">
          <strong>Sale saved.</strong> {receipt.sale.items.reduce((n, i) => n + i.quantity, 0)} units for{' '}
          {formatMoney(receipt.sale.total)}. Stock has been updated.
          {receipt.lowStockAlerts.length > 0 && (
            <ul>
              {receipt.lowStockAlerts.map((alert) => (
                <li key={alert.productId}>
                  ▲ {alert.name} is {alert.stock === 0 ? 'out of stock' : `low: ${alert.stock} left`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2>Add items</h2>
        <form className="sale-add" onSubmit={addLine}>
          <div className="grow">
            <label htmlFor="sale-product">Product</label>
            <select id="sale-product" required value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Choose a product…</option>
              {(products ?? []).map((product) => (
                <option key={product._id} value={product._id} disabled={product.stock === 0}>
                  {product.name} ({product.sku}) — {formatMoney(product.price)} —{' '}
                  {product.stock === 0 ? 'out of stock' : `${product.stock} in stock`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sale-quantity">Quantity</label>
            <input
              id="sale-quantity"
              type="number"
              required
              min={1}
              step={1}
              max={selected ? Math.max(available, 1) : undefined}
              value={Number.isNaN(quantity) ? '' : quantity}
              onChange={(e) => setQuantity(e.target.valueAsNumber)}
            />
          </div>
          <button type="submit" className="button-secondary" disabled={!selected}>
            Add to sale
          </button>
        </form>
      </section>

      <section className="card card-flush">
        {lines.length === 0 ? (
          <p className="empty">No items yet. Choose a product above to start the sale.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="num">Price</th>
                    <th className="num">Qty</th>
                    <th className="num">Line total</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const product = byId.get(line.productId);
                    if (!product) return null;
                    return (
                      <tr key={line.productId}>
                        <td>{product.name}</td>
                        <td className="mono">{product.sku}</td>
                        <td className="num">{formatMoney(product.price)}</td>
                        <td className="num">{line.quantity}</td>
                        <td className="num">{formatMoney(product.price * line.quantity)}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className="button-quiet"
                            aria-label={`Remove ${product.name}`}
                            onClick={() => setLines((current) => current.filter((l) => l.productId !== line.productId))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sale-footer">
              <span className="sale-total">
                Total <strong>{formatMoney(total)}</strong>
              </span>
              <button type="button" className="button-primary" disabled={submitting} onClick={completeSale}>
                {submitting ? 'Saving…' : 'Complete sale'}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
