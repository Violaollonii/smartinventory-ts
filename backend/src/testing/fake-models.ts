/**
 * In-memory stand-ins for the Mongoose models used by SalesService, so the
 * sales/stock tests run without any database.
 *
 * The product fake implements the one MongoDB behaviour the stock rule
 * depends on: `findOneAndUpdate` checks the filter (`stock >= n`) and applies
 * `$inc` as a single step — exactly like the real, atomic operation.
 */
import { Types } from 'mongoose';

export interface FakeProduct {
  _id: Types.ObjectId;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
}

/** Mimics a Mongoose query: the result is produced when `.exec()` is called. */
function query<T>(run: () => T) {
  return { exec: async (): Promise<T> => run() };
}

export class FakeProductModel {
  private readonly docs = new Map<string, FakeProduct>();

  add(product: Partial<FakeProduct> & { stock: number }): FakeProduct {
    const doc: FakeProduct = {
      _id: new Types.ObjectId(),
      name: 'Test product',
      sku: `SKU-${this.docs.size + 1}`,
      category: 'Test',
      price: 10,
      lowStockThreshold: 0,
      ...product,
    };
    this.docs.set(String(doc._id), doc);
    return doc;
  }

  stockOf(product: FakeProduct): number {
    return this.docs.get(String(product._id))!.stock;
  }

  findOneAndUpdate(
    filter: { _id: unknown; stock?: { $gte: number } },
    update: { $inc: { stock: number } },
    _options?: unknown,
  ) {
    return query(() => {
      const doc = this.docs.get(String(filter._id));
      if (!doc) return null;
      if (filter.stock && doc.stock < filter.stock.$gte) return null;
      doc.stock += update.$inc.stock;
      return { ...doc }; // a snapshot, like the document Mongo returns
    });
  }

  findById(id: unknown) {
    return query(() => {
      const doc = this.docs.get(String(id));
      return doc ? { ...doc } : null;
    });
  }

  updateOne(filter: { _id: unknown }, update: { $inc: { stock: number } }) {
    return query(() => {
      const doc = this.docs.get(String(filter._id));
      if (doc) doc.stock += update.$inc.stock;
      return { modifiedCount: doc ? 1 : 0 };
    });
  }
}

export class FakeSaleModel {
  readonly saved: Record<string, unknown>[] = [];
  /** Set to make the next `create` fail, simulating a database error. */
  failNextCreate = false;

  async create(doc: Record<string, unknown>) {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('Simulated database failure');
    }
    const saved = { _id: new Types.ObjectId(), createdAt: new Date(), ...doc };
    this.saved.push(saved);
    return saved;
  }
}
