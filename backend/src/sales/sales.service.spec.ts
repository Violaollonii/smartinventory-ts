import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { JwtPayload, Role } from '../common/auth';
import { Product } from '../products/product.schema';
import { FakeProductModel, FakeSaleModel } from '../testing/fake-models';
import { Sale } from './sale.schema';
import { SalesService, mergeItems, roundMoney } from './sales.service';

const seller: JwtPayload = {
  sub: String(new Types.ObjectId()),
  email: 'staff@example.com',
  name: 'Sam Staff',
  role: Role.Staff,
};

describe('SalesService', () => {
  let service: SalesService;
  let products: FakeProductModel;
  let sales: FakeSaleModel;

  beforeEach(async () => {
    products = new FakeProductModel();
    sales = new FakeSaleModel();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getModelToken(Product.name), useValue: products },
        { provide: getModelToken(Sale.name), useValue: sales },
      ],
    }).compile();
    moduleRef.useLogger(false);
    service = moduleRef.get(SalesService);
  });

  const line = (product: { _id: Types.ObjectId }, quantity: number) => ({
    productId: String(product._id),
    quantity,
  });

  describe('successful sale', () => {
    it('decreases stock by the quantity sold', async () => {
      const mouse = products.add({ stock: 10 });

      await service.create({ items: [line(mouse, 3)] }, seller);

      expect(products.stockOf(mouse)).toBe(7);
    });

    it('stores a snapshot of each line and the total, using prices from the database', async () => {
      const mouse = products.add({ name: 'Mouse', sku: 'M-1', price: 24.9, stock: 10 });
      const cable = products.add({ name: 'Cable', sku: 'C-1', price: 9.5, stock: 10 });

      const { sale } = await service.create({ items: [line(mouse, 2), line(cable, 3)] }, seller);

      expect(sale.items).toEqual([
        { product: mouse._id, name: 'Mouse', sku: 'M-1', unitPrice: 24.9, quantity: 2, lineTotal: 49.8 },
        { product: cable._id, name: 'Cable', sku: 'C-1', unitPrice: 9.5, quantity: 3, lineTotal: 28.5 },
      ]);
      expect(sale.total).toBe(78.3);
      expect(sale.soldBy).toBe(seller.sub);
      expect(sale.soldByName).toBe('Sam Staff');
      expect(sales.saved).toHaveLength(1);
    });

    it('allows selling the entire remaining stock, down to exactly 0', async () => {
      const mouse = products.add({ stock: 4 });

      await service.create({ items: [line(mouse, 4)] }, seller);

      expect(products.stockOf(mouse)).toBe(0);
    });
  });

  describe('blocking sales below 0 stock', () => {
    it('rejects a sale that asks for more than is in stock', async () => {
      const mouse = products.add({ name: 'Mouse', stock: 2 });

      const attempt = service.create({ items: [line(mouse, 3)] }, seller);

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow('Not enough stock for "Mouse": requested 3, available 2');
      expect(products.stockOf(mouse)).toBe(2);
      expect(sales.saved).toHaveLength(0);
    });

    it('rejects any sale of a product with 0 stock', async () => {
      const hub = products.add({ stock: 0 });

      await expect(service.create({ items: [line(hub, 1)] }, seller)).rejects.toThrow(ConflictException);
      expect(products.stockOf(hub)).toBe(0);
    });

    it('adds up repeated lines for the same product before checking stock', async () => {
      const mouse = products.add({ stock: 5 });

      // 3 + 3 = 6 > 5, even though each line alone would fit.
      const attempt = service.create({ items: [line(mouse, 3), line(mouse, 3)] }, seller);

      await expect(attempt).rejects.toThrow(ConflictException);
      expect(products.stockOf(mouse)).toBe(5);
    });

    it('never oversells when several sales compete for the same stock', async () => {
      const mouse = products.add({ stock: 3 });

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => service.create({ items: [line(mouse, 1)] }, seller)),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
      expect(products.stockOf(mouse)).toBe(0);
      expect(sales.saved).toHaveLength(3);
    });
  });

  describe('all-or-nothing sales', () => {
    it('restores stock already taken when a later line has too little stock', async () => {
      const mouse = products.add({ stock: 10 });
      const cable = products.add({ stock: 1 });

      const attempt = service.create({ items: [line(mouse, 4), line(cable, 2)] }, seller);

      await expect(attempt).rejects.toThrow(ConflictException);
      expect(products.stockOf(mouse)).toBe(10);
      expect(products.stockOf(cable)).toBe(1);
      expect(sales.saved).toHaveLength(0);
    });

    it('restores stock and reports 404 when a product does not exist', async () => {
      const mouse = products.add({ stock: 10 });
      const missing = { _id: new Types.ObjectId() };

      const attempt = service.create({ items: [line(mouse, 4), line(missing, 1)] }, seller);

      await expect(attempt).rejects.toThrow(NotFoundException);
      expect(products.stockOf(mouse)).toBe(10);
    });

    it('restores stock when saving the sale itself fails', async () => {
      const mouse = products.add({ stock: 10 });
      sales.failNextCreate = true;

      await expect(service.create({ items: [line(mouse, 4)] }, seller)).rejects.toThrow('Simulated database failure');
      expect(products.stockOf(mouse)).toBe(10);
    });
  });

  describe('low-stock alerts', () => {
    it('returns an alert when a sale brings a product to its threshold', async () => {
      const cable = products.add({ name: 'Cable', sku: 'C-1', stock: 8, lowStockThreshold: 5 });

      const { lowStockAlerts } = await service.create({ items: [line(cable, 3)] }, seller);

      expect(lowStockAlerts).toEqual([
        { productId: String(cable._id), name: 'Cable', sku: 'C-1', stock: 5, lowStockThreshold: 5 },
      ]);
    });

    it('returns no alert while stock stays above the threshold', async () => {
      const cable = products.add({ stock: 8, lowStockThreshold: 5 });

      const { lowStockAlerts } = await service.create({ items: [line(cable, 2)] }, seller);

      expect(lowStockAlerts).toEqual([]);
    });

    it('only alerts for the products that are low', async () => {
      const cable = products.add({ stock: 8, lowStockThreshold: 5 });
      const mouse = products.add({ stock: 50, lowStockThreshold: 5 });

      const { lowStockAlerts } = await service.create({ items: [line(cable, 8), line(mouse, 1)] }, seller);

      expect(lowStockAlerts.map((a) => a.productId)).toEqual([String(cable._id)]);
      expect(lowStockAlerts[0].stock).toBe(0);
    });
  });
});

describe('sales helpers', () => {
  it('mergeItems sums quantities per product and keeps first-seen order', () => {
    const merged = mergeItems([
      { productId: 'a', quantity: 1 },
      { productId: 'b', quantity: 2 },
      { productId: 'a', quantity: 4 },
    ]);

    expect([...merged]).toEqual([
      ['a', 5],
      ['b', 2],
    ]);
  });

  it('roundMoney rounds to cents without floating point drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(19.99 * 3)).toBe(59.97);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});
