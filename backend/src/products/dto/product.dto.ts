import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const MAX_PRICE = 1_000_000;
const MAX_STOCK = 1_000_000;

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, {
    message: 'sku must be 2-40 characters: letters, digits, dot, dash or underscore',
  })
  sku: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  price: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  lowStockThreshold?: number;
}

/** Same rules as create, but every field is optional. */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, {
    message: 'sku must be 2-40 characters: letters, digits, dot, dash or underscore',
  })
  sku?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  lowStockThreshold?: number;
}

export class ProductQueryDto {
  /** Free-text search over name, SKU and category. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
