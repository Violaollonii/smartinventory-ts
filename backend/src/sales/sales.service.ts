import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtPayload } from '../common/auth';
import { Product, ProductDocument } from '../products/product.schema';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Sale, SaleDocument } from './sale.schema';

export interface LowStockAlert {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
}

export interface CreateSaleResult {
  sale: SaleDocument;
  /** Products that are at or below their threshold after this sale. */
  lowStockAlerts: LowStockAlert[];
}

/** Rounds to cents, avoiding floating point drift like 0.1 + 0.2. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Combines repeated lines for the same product into one quantity each. */
export function mergeItems(items: { productId: string; quantity: number }[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }
  return merged;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  /**
   * Creates a sale and decreases stock.
   *
   * The rule "stock can never go below 0" is enforced by the database, not by
   * a read-then-write in this code. Each line runs one atomic update:
   *
   *   "decrease stock by N, but only if stock >= N"
   *
   * If two sales race for the last unit, MongoDB lets exactly one of those
   * updates match. A "check, then update" in two steps would let both pass.
   *
   * If any line fails, the lines already reserved are given back, so a sale
   * is all-or-nothing.
   */
  async create(dto: CreateSaleDto, seller: JwtPayload): Promise<CreateSaleResult> {
    const wanted = mergeItems(dto.items);
    const reserved: { product: ProductDocument; quantity: number }[] = [];

    try {
      for (const [productId, quantity] of wanted) {
        const product = await this.productModel
          .findOneAndUpdate(
            { _id: productId, stock: { $gte: quantity } },
            { $inc: { stock: -quantity } },
            { returnDocument: 'after' },
          )
          .exec();

        if (!product) {
          // Nothing matched: the product is missing, or it has too little stock.
          const existing = await this.productModel.findById(productId).exec();
          if (!existing) throw new NotFoundException(`Product ${productId} not found`);
          throw new ConflictException(
            `Not enough stock for "${existing.name}": requested ${quantity}, available ${existing.stock}`,
          );
        }
        reserved.push({ product, quantity });
      }

      const items = reserved.map(({ product, quantity }) => ({
        product: product._id,
        name: product.name,
        sku: product.sku,
        unitPrice: product.price,
        quantity,
        lineTotal: roundMoney(product.price * quantity),
      }));

      const sale = await this.saleModel.create({
        items,
        total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
        soldBy: seller.sub,
        soldByName: seller.name,
      });

      const lowStockAlerts = reserved
        .filter(({ product }) => product.stock <= product.lowStockThreshold)
        .map(({ product }) => ({
          productId: String(product._id),
          name: product.name,
          sku: product.sku,
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
        }));

      return { sale, lowStockAlerts };
    } catch (error) {
      await this.release(reserved);
      throw error;
    }
  }

  /** Gives reserved stock back after a failed sale. */
  private async release(reserved: { product: ProductDocument; quantity: number }[]): Promise<void> {
    for (const { product, quantity } of reserved) {
      try {
        await this.productModel.updateOne({ _id: product._id }, { $inc: { stock: quantity } }).exec();
      } catch (error) {
        // Keep releasing the others; this one needs a manual stock correction.
        this.logger.error(`Could not restore ${quantity} units of ${product.sku} after a failed sale`, error);
      }
    }
  }

  findAll(limit = 50): Promise<SaleDocument[]> {
    return this.saleModel.find().sort({ createdAt: -1 }).limit(limit).exec();
  }

  async findOne(id: string): Promise<SaleDocument> {
    const sale = await this.saleModel.findById(id).exec();
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }
}
