import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsMongoId, Max, Min, ValidateNested } from 'class-validator';

export class SaleItemDto {
  @IsMongoId()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;
}

/**
 * The client only sends product ids and quantities. Prices are always read
 * from the database, so a client can't choose its own price.
 */
export class CreateSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
