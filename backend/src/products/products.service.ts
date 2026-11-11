import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductDocument } from './product.schema';

/** Escapes user input so it is matched literally inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  async create(dto: CreateProductDto): Promise<ProductDocument> {
    try {
      return await this.productModel.create(dto);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictException(`SKU "${dto.sku.toUpperCase()}" already exists`);
      throw error;
    }
  }

  findAll(query: ProductQueryDto = {}): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {};
    if (query.category) filter.category = query.category;
    if (query.search?.trim()) {
      const pattern = new RegExp(escapeRegExp(query.search.trim()), 'i');
      filter.$or = [{ name: pattern }, { sku: pattern }, { category: pattern }];
    }
    return this.productModel
      .find(filter)
      .sort({ name: 1 })
      .limit(query.limit ?? 200)
      .exec();
  }

  /** Low-stock alert list: products whose stock is at or below their own threshold. */
  findLowStock(): Promise<ProductDocument[]> {
    return this.productModel
      .find({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
      .sort({ stock: 1, name: 1 })
      .exec();
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    try {
      const product = await this.productModel
        .findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after', runValidators: true })
        .exec();
      if (!product) throw new NotFoundException('Product not found');
      return product;
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictException(`SKU "${dto.sku?.toUpperCase()}" already exists`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.productModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) throw new NotFoundException('Product not found');
  }
}
