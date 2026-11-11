/** Typed client for the SmartInventory API. All calls go through `request`. */

export type Role = 'admin' | 'staff';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
}

export type ProductInput = Omit<Product, '_id'>;

export interface SaleItem {
  product: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  _id: string;
  items: SaleItem[];
  total: number;
  soldByName: string;
  createdAt: string;
}

export interface LowStockAlert {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
}

export interface SalesPerDayRow {
  date: string;
  revenue: number;
  salesCount: number;
  unitsSold: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
}

export interface Summary {
  revenueToday: number;
  salesToday: number;
  productCount: number;
  lowStockCount: number;
  unitsInStock: number;
  inventoryValue: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'smartinventory.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Called when the API says the token is missing or expired. Set by AuthProvider. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // NestJS sends { message: string | string[] }; validation errors are arrays.
    const raw = data?.message ?? `Request failed (${response.status})`;
    const message = Array.isArray(raw) ? raw.join('. ') : String(raw);
    if (response.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request<User>('/auth/me'),

  products: (search = '') => request<Product[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  lowStock: () => request<Product[]>('/products/low-stock'),
  createProduct: (input: ProductInput) => request<Product>('/products', { method: 'POST', body: input }),
  updateProduct: (id: string, input: Partial<ProductInput>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body: input }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),

  createSale: (items: { productId: string; quantity: number }[]) =>
    request<{ sale: Sale; lowStockAlerts: LowStockAlert[] }>('/sales', { method: 'POST', body: { items } }),
  sales: () => request<Sale[]>('/sales'),

  summary: () => request<Summary>('/reports/summary'),
  salesPerDay: () => request<SalesPerDayRow[]>('/reports/sales-per-day'),
  topProducts: (limit = 5) => request<TopProductRow[]>(`/reports/top-products?limit=${limit}`),
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatMoney = (value: number) => money.format(value);
