import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { MongooseModule, ParseObjectIdPipe } from '@nestjs/mongoose';
import { CurrentUser, type JwtPayload } from '../common/auth';
import { ProductsModule } from '../products/products.module';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Sale, SaleSchema } from './sale.schema';
import { SalesService } from './sales.service';

/** Both roles can record and view sales. */
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload) {
    return this.sales.create(dto, user);
  }

  @Get()
  findAll() {
    return this.sales.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.sales.findOne(String(id));
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Sale.name, schema: SaleSchema }]), ProductsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [MongooseModule],
})
export class SalesModule {}
