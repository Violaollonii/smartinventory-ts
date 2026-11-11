/**
 * Boots the whole application (without a database) and checks the parts that
 * sit in front of every route: authentication, role checks and DTO validation.
 *
 * The MongoDB connection is replaced by an unconnected one, so these tests
 * only call routes that are rejected before any database access.
 */
import './testing/test-env';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import { AppModule } from './app.module';
import { Role, type JwtPayload } from './common/auth';

describe('HTTP: auth, roles and validation', () => {
  let app: INestApplication;
  let baseUrl: string;
  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getConnectionToken())
      .useValue(mongoose.createConnection()) // never connects
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    const jwt = app.get(JwtService);
    const user = (role: Role): JwtPayload => ({ sub: '507f1f77bcf86cd799439011', email: `${role}@example.com`, name: role, role });
    adminToken = await jwt.signAsync(user(Role.Admin));
    staffToken = await jwt.signAsync(user(Role.Staff));
  });

  afterAll(async () => {
    await app?.close();
  });

  const call = (method: string, path: string, options: { token?: string; body?: unknown } = {}) =>
    fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  const validProduct = { name: 'Mouse', sku: 'M-1', category: 'Accessories', price: 9.99, stock: 5 };

  describe('authentication', () => {
    it.each([
      ['GET', '/products'],
      ['GET', '/products/low-stock'],
      ['POST', '/sales'],
      ['GET', '/reports/sales-per-day'],
      ['GET', '/reports/top-products'],
      ['GET', '/users'],
      ['GET', '/auth/me'],
    ])('%s %s requires a token', async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    });

    it('rejects a token that was not signed by this server', async () => {
      const forged = adminToken.slice(0, -4) + 'AAAA';
      expect((await call('GET', '/auth/me', { token: forged })).status).toBe(401);
    });

    it('accepts a valid token', async () => {
      const response = await call('GET', '/auth/me', { token: staffToken });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ email: 'staff@example.com', role: 'staff' });
    });

    it('login is public but validates its input', async () => {
      const response = await call('POST', '/auth/login', { body: { email: 'not-an-email' } });
      expect(response.status).toBe(400);
    });
  });

  describe('roles', () => {
    it('staff cannot create products', async () => {
      expect((await call('POST', '/products', { token: staffToken, body: validProduct })).status).toBe(403);
    });

    it('staff cannot edit or delete products', async () => {
      const id = '507f1f77bcf86cd799439011';
      expect((await call('PATCH', `/products/${id}`, { token: staffToken, body: { stock: 999 } })).status).toBe(403);
      expect((await call('DELETE', `/products/${id}`, { token: staffToken })).status).toBe(403);
    });

    it('staff cannot manage users', async () => {
      expect((await call('GET', '/users', { token: staffToken })).status).toBe(403);
      const body = { email: 'x@example.com', name: 'X', password: 'long-enough-pw', role: 'admin' };
      expect((await call('POST', '/users', { token: staffToken, body })).status).toBe(403);
    });

    it('admin passes the role check (and then hits validation)', async () => {
      const response = await call('POST', '/products', { token: adminToken, body: { ...validProduct, price: -1 } });
      expect(response.status).toBe(400);
    });
  });

  describe('validation', () => {
    const postSale = (body: unknown) => call('POST', '/sales', { token: staffToken, body });
    const productId = '507f1f77bcf86cd799439011';

    it('rejects a sale with no items', async () => {
      expect((await postSale({ items: [] })).status).toBe(400);
    });

    it.each([0, -2, 1.5, '3'])('rejects quantity %p', async (quantity) => {
      expect((await postSale({ items: [{ productId, quantity }] })).status).toBe(400);
    });

    it('rejects an invalid product id', async () => {
      expect((await postSale({ items: [{ productId: 'abc', quantity: 1 }] })).status).toBe(400);
    });

    it('rejects a client-supplied price', async () => {
      expect((await postSale({ items: [{ productId, quantity: 1, unitPrice: 0.01 }] })).status).toBe(400);
    });

    it('rejects negative stock and fractional stock on products', async () => {
      const create = (stock: number) => call('POST', '/products', { token: adminToken, body: { ...validProduct, stock } });
      expect((await create(-1)).status).toBe(400);
      expect((await create(2.5)).status).toBe(400);
    });

    it('rejects a malformed id in the URL', async () => {
      expect((await call('GET', '/products/not-an-id', { token: staffToken })).status).toBe(400);
    });
  });
});
