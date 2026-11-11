import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, formatMoney, type Product, type SalesPerDayRow, type Summary, type TopProductRow } from '../api';

interface DashboardData {
  summary: Summary;
  perDay: SalesPerDayRow[];
  top: TopProductRow[];
  lowStock: Product[];
}

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const formatDay = (isoDate: string) => shortDate.format(new Date(`${isoDate}T00:00:00Z`));

// Shared look for both charts: quiet grid and axes, so the data stands out.
const axisProps = {
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--axis)' },
} as const;

const tooltipProps = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--text-secondary)' },
  itemStyle: { color: 'var(--text)' },
} as const;

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.summary(), api.salesPerDay(), api.topProducts(5), api.lowStock()])
      .then(([summary, perDay, top, lowStock]) => {
        if (!cancelled) setData({ summary, perDay, top, lowStock });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="alert alert-error" role="alert">
        Could not load the dashboard: {error}
      </p>
    );
  }
  if (!data) return <p className="page-status">Loading dashboard…</p>;

  const { summary, perDay, top, lowStock } = data;
  const hasSales = perDay.some((day) => day.salesCount > 0);

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <Link className="button-primary" to="/sales/new">
          New sale
        </Link>
      </div>

      <section className="tiles" aria-label="Key numbers">
        <Tile label="Revenue today" value={formatMoney(summary.revenueToday)} />
        <Tile label="Sales today" value={String(summary.salesToday)} />
        <Tile label="Products" value={String(summary.productCount)} hint={`${summary.unitsInStock} units in stock`} />
        <Tile
          label="Low stock"
          value={String(summary.lowStockCount)}
          hint={summary.lowStockCount > 0 ? 'Need restocking' : 'All stocked'}
          warn={summary.lowStockCount > 0}
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Revenue per day</h2>
          <p className="muted">Last 30 days (UTC)</p>
          {hasSales ? (
            <>
              <div className="chart" role="img" aria-label="Line chart of revenue per day for the last 30 days">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={perDay} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDay} minTickGap={32} {...axisProps} />
                    <YAxis
                      width={56}
                      tickFormatter={(value: number) => `$${value.toLocaleString('en-US')}`}
                      {...axisProps}
                      axisLine={false}
                    />
                    <Tooltip
                      {...tooltipProps}
                      cursor={{ stroke: 'var(--axis)' }}
                      labelFormatter={(label) => formatDay(String(label))}
                      formatter={(value) => [formatMoney(Number(value)), 'Revenue']}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--series-1)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="table-view">
                <summary>View as table</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="num">Sales</th>
                        <th className="num">Units</th>
                        <th className="num">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perDay.map((day) => (
                        <tr key={day.date}>
                          <td>{day.date}</td>
                          <td className="num">{day.salesCount}</td>
                          <td className="num">{day.unitsSold}</td>
                          <td className="num">{formatMoney(day.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p className="empty">No sales in the last 30 days yet.</p>
          )}
        </section>

        <section className="card">
          <h2>Top products</h2>
          <p className="muted">Units sold, last 30 days</p>
          {top.length > 0 ? (
            <div
              className="chart"
              role="img"
              aria-label={`Bar chart of top products by units sold: ${top.map((p) => `${p.name} ${p.unitsSold}`).join(', ')}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axisProps} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={150} {...axisProps} />
                  <Tooltip
                    {...tooltipProps}
                    cursor={{ fill: 'var(--hover)' }}
                    formatter={(value, _name, item) => [
                      `${value} units · ${formatMoney((item.payload as TopProductRow).revenue)}`,
                      'Sold',
                    ]}
                  />
                  <Bar dataKey="unitsSold" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                    <LabelList dataKey="unitsSold" position="right" fill="var(--text-secondary)" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="empty">No products sold in the last 30 days yet.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Low-stock alerts</h2>
        {lowStock.length === 0 ? (
          <p className="empty">Every product is above its low-stock threshold.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="num">In stock</th>
                  <th className="num">Alert at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((product) => (
                  <tr key={product._id}>
                    <td>{product.name}</td>
                    <td className="mono">{product.sku}</td>
                    <td className="num">{product.stock}</td>
                    <td className="num">{product.lowStockThreshold}</td>
                    <td>
                      <StockStatus product={product} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="card tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {hint && <span className={warn ? 'tile-hint tile-hint-warn' : 'tile-hint'}>{hint}</span>}
    </div>
  );
}

/** Status is always shown as a symbol plus text, never as colour alone. */
export function StockStatus({ product }: { product: Pick<Product, 'stock' | 'lowStockThreshold'> }) {
  if (product.stock === 0) return <span className="status status-out">✕ Out of stock</span>;
  if (product.stock <= product.lowStockThreshold) return <span className="status status-low">▲ Low stock</span>;
  return <span className="status status-ok">● In stock</span>;
}
