import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { MongooseModule, ParseObjectIdPipe } from '@nestjs/mongoose';
import { Role, Roles } from '../common/auth';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductSchema } from './product.schema';
import { ProductsService } from './products.service';

/** Everyone signed in can read products; only admins can change them. */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  // Declared before ':id' so "low-stock" is not treated as an id.
  @Get('low-stock')
  findLowStock() {
    return this.products.findLowStock();
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.products.findOne(String(id));
  }

  @Roles(Role.Admin)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Roles(Role.Admin)
  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(String(id), dto);
  }

  @Roles(Role.Admin)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.products.remove(String(id));
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [MongooseModule],
})
export class ProductsModule {}
