import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { Product } from '../products/product.schema';
import { Sale } from '../sales/sale.schema';

export interface SalesPerDayRow {
  date: string; // YYYY-MM-DD (UTC)
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

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Turns optional from/to strings into a concrete range of whole UTC days.
 * Default: the last 30 days including today.
 */
export function resolveRange(from?: string, to?: string, now = new Date()): { start: Date; end: Date } {
  const lastDay = startOfUtcDay(to ? new Date(to) : now);
  const start = from ? startOfUtcDay(new Date(from)) : new Date(lastDay.getTime() - 29 * DAY_MS);
  const end = new Date(lastDay.getTime() + DAY_MS); // exclusive
  if (start >= end) throw new BadRequestException('"from" must not be after "to"');
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new BadRequestException(`Date range is limited to ${MAX_RANGE_DAYS} days`);
  }
  return { start, end };
}

/** Adds zero rows for days without sales, so a chart shows a continuous axis. */
export function fillMissingDays(rows: SalesPerDayRow[], start: Date, end: Date): SalesPerDayRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const filled: SalesPerDayRow[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    filled.push(byDate.get(date) ?? { date, revenue: 0, salesCount: 0, unitsSold: 0 });
  }
  return filled;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  /** Revenue, number of sales and units sold for each day in the range. */
  async salesPerDay(from?: string, to?: string): Promise<SalesPerDayRow[]> {
    const { start, end } = resolveRange(from, to);

    const pipeline: PipelineStage[] = [
      // 1. Keep only sales in the date range (uses the createdAt index).
      { $match: { createdAt: { $gte: start, $lt: end } } },
      // 2. Bucket by calendar day and add up the numbers.
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          revenue: { $sum: '$total' },
          salesCount: { $sum: 1 },
          unitsSold: { $sum: { $sum: '$items.quantity' } },
        },
      },
      // 3. Oldest day first.
      { $sort: { _id: 1 } },
      // 4. Shape the output.
      { $project: { _id: 0, date: '$_id', revenue: { $round: ['$revenue', 2] }, salesCount: 1, unitsSold: 1 } },
    ];

    const rows = await this.saleModel.aggregate<SalesPerDayRow>(pipeline).exec();
    return fillMissingDays(rows, start, end);
  }

  /** Best-selling products in the range, ranked by units sold. */
  async topProducts(from?: string, to?: string, limit = 5): Promise<TopProductRow[]> {
    const { start, end } = resolveRange(from, to);

    const pipeline: PipelineStage[] = [
      { $match: { createdAt: { $gte: start, $lt: end } } },
      // One document per sale line, so lines can be grouped per product.
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $last: '$items.name' },
          sku: { $last: '$items.sku' },
          unitsSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { unitsSold: -1, revenue: -1, _id: 1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          productId: { $toString: '$_id' },
          name: 1,
          sku: 1,
          unitsSold: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ];

    return this.saleModel.aggregate<TopProductRow>(pipeline).exec();
  }

  /** Headline numbers for the dashboard tiles. */
  async summary() {
    const today = startOfUtcDay(new Date());
    const [todayTotals, productCount, lowStockCount, inventory] = await Promise.all([
      this.saleModel
        .aggregate<{ revenue: number; salesCount: number }>([
          { $match: { createdAt: { $gte: today } } },
          { $group: { _id: null, revenue: { $sum: '$total' }, salesCount: { $sum: 1 } } },
        ])
        .exec(),
      this.productModel.countDocuments().exec(),
      this.productModel.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).exec(),
      this.productModel
        .aggregate<{ value: number; units: number }>([
          { $group: { _id: null, value: { $sum: { $multiply: ['$price', '$stock'] } }, units: { $sum: '$stock' } } },
        ])
        .exec(),
    ]);

    return {
      revenueToday: Math.round((todayTotals[0]?.revenue ?? 0) * 100) / 100,
      salesToday: todayTotals[0]?.salesCount ?? 0,
      productCount,
      lowStockCount,
      unitsInStock: inventory[0]?.units ?? 0,
      inventoryValue: Math.round((inventory[0]?.value ?? 0) * 100) / 100,
    };
  }
}
