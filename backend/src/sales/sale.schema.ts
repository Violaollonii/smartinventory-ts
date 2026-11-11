import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One line of a sale. Name, SKU and price are copied from the product at the
 * moment of sale, so old sales stay correct if the product is later renamed,
 * repriced or deleted.
 */
@Schema({ _id: false })
export class SaleItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  lineTotal: number;
}

const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

@Schema({ timestamps: true })
export class Sale {
  @Prop({ type: [SaleItemSchema], required: true })
  items: SaleItem[];

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  soldBy: Types.ObjectId;

  @Prop({ required: true })
  soldByName: string;

  createdAt: Date;
  updatedAt: Date;
}

export type SaleDocument = HydratedDocument<Sale>;
export const SaleSchema = SchemaFactory.createForClass(Sale);

// Reports filter and sort by date.
SaleSchema.index({ createdAt: -1 });
