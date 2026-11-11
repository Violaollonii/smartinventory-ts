import { Controller, Get, Module, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ProductsModule } from '../products/products.module';
import { SalesModule } from '../sales/sales.module';
import { ReportsService } from './reports.service';

export class ReportQueryDto {
  /** First day, e.g. 2026-11-01. Default: 30 days back. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Last day (inclusive). Default: today. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Only used by top-products. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Reports are read-only and available to both roles (they feed the dashboard). */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales-per-day')
  salesPerDay(@Query() query: ReportQueryDto) {
    return this.reports.salesPerDay(query.from, query.to);
  }

  @Get('top-products')
  topProducts(@Query() query: ReportQueryDto) {
    return this.reports.topProducts(query.from, query.to, query.limit);
  }

  @Get('summary')
  summary() {
    return this.reports.summary();
  }
}

@Module({
  imports: [SalesModule, ProductsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
