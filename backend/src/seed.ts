/**
 * Seed script: `npm run seed`
 *
 * - Creates the admin and staff accounts from SEED_* variables in .env
 * - Adds sample products (only if there are no products yet)
 * - Adds two weeks of sample sales (only if there are no sales yet)
 *
 * It only ever adds data, never deletes, and is safe to run twice.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from './app.module';
import { Role } from './common/auth';
import { Product } from './products/product.schema';
import { Sale } from './sales/sale.schema';
import { roundMoney } from './sales/sales.service';
import { User } from './users/user.schema';
import { UsersService } from './users/users.service';

const logger = new Logger('Seed');

const SAMPLE_PRODUCTS = [
  { name: 'Wireless Mouse', sku: 'ACC-MOUSE-01', category: 'Accessories', price: 24.9, stock: 42, lowStockThreshold: 10 },
  { name: 'Mechanical Keyboard', sku: 'ACC-KEYB-02', category: 'Accessories', price: 89.0, stock: 18, lowStockThreshold: 5 },
  { name: 'USB-C Cable 1m', sku: 'CBL-USBC-1M', category: 'Cables', price: 9.5, stock: 120, lowStockThreshold: 25 },
  { name: 'HDMI Cable 2m', sku: 'CBL-HDMI-2M', category: 'Cables', price: 12.0, stock: 4, lowStockThreshold: 15 },
  { name: '27" Monitor', sku: 'MON-27-QHD', category: 'Displays', price: 319.0, stock: 7, lowStockThreshold: 3 },
  { name: 'Laptop Stand', sku: 'ACC-STAND-03', category: 'Accessories', price: 39.9, stock: 3, lowStockThreshold: 5 },
  { name: 'Webcam 1080p', sku: 'CAM-1080-01', category: 'Cameras', price: 59.0, stock: 15, lowStockThreshold: 5 },
  { name: 'Noise-Cancelling Headset', sku: 'AUD-HEAD-01', category: 'Audio', price: 149.0, stock: 9, lowStockThreshold: 4 },
  { name: 'USB Hub 7-port', sku: 'ACC-HUB-07', category: 'Accessories', price: 34.5, stock: 0, lowStockThreshold: 5 },
  { name: 'External SSD 1TB', sku: 'STO-SSD-1TB', category: 'Storage', price: 109.0, stock: 22, lowStockThreshold: 6 },
];

async function ensureUser(users: UsersService, email: string | undefined, password: string | undefined, name: string, role: Role) {
  if (!email || !password || password.startsWith('replace-with')) {
    logger.warn(`Skipping ${role} account: set SEED_${role.toUpperCase()}_EMAIL and SEED_${role.toUpperCase()}_PASSWORD in .env`);
    return null;
  }
  const existing = await users.findByEmailWithPassword(email);
  if (existing) {
    logger.log(`${role} account already exists: ${email}`);
    return existing;
  }
  const created = await users.create({ email, password, name, role });
  logger.log(`Created ${role} account: ${email}`);
  return created;
}

/** Small deterministic random generator, so every seed run produces the same sample sales. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const users = app.get(UsersService);
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const productModel = app.get<Model<Product>>(getModelToken(Product.name));
    const saleModel = app.get<Model<Sale>>(getModelToken(Sale.name));

    const admin = await ensureUser(users, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'Admin', Role.Admin);
    const staff = await ensureUser(users, process.env.SEED_STAFF_EMAIL, process.env.SEED_STAFF_PASSWORD, 'Staff', Role.Staff);

    if ((await productModel.countDocuments()) === 0) {
      await productModel.insertMany(SAMPLE_PRODUCTS);
      logger.log(`Added ${SAMPLE_PRODUCTS.length} sample products`);
    } else {
      logger.log('Products already exist, not adding samples');
    }

    const seller = staff ?? admin ?? (await userModel.findOne());
    if ((await saleModel.countDocuments()) === 0 && seller) {
      // Historical sample sales. They are back-dated and do not change stock:
      // the stock numbers above describe the shelf as it is today.
      const products = await productModel.find().sort({ sku: 1 });
      const random = createRandom(42);
      const sales = [];
      for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
        const salesThatDay = 2 + Math.floor(random() * 5);
        for (let n = 0; n < salesThatDay; n++) {
          const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
          createdAt.setUTCHours(8 + Math.floor(random() * 9), Math.floor(random() * 60), 0, 0);
          if (createdAt > new Date()) createdAt.setTime(Date.now() - 60_000);

          const lineCount = 1 + Math.floor(random() * 3);
          const picked = new Map<string, { product: (typeof products)[number]; quantity: number }>();
          for (let i = 0; i < lineCount; i++) {
            // Squaring skews the pick towards the first products, so there are clear best sellers.
            const product = products[Math.floor(random() ** 2 * products.length)];
            const quantity = 1 + Math.floor(random() * 3);
            picked.set(product.id, { product, quantity: (picked.get(product.id)?.quantity ?? 0) + quantity });
          }
          const items = [...picked.values()].map(({ product, quantity }) => ({
            product: product._id,
            name: product.name,
            sku: product.sku,
            unitPrice: product.price,
            quantity,
            lineTotal: roundMoney(product.price * quantity),
          }));
          sales.push({
            items,
            total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
            soldBy: seller._id,
            soldByName: seller.name,
            createdAt,
            updatedAt: createdAt,
          });
        }
      }
      await saleModel.insertMany(sales);
      logger.log(`Added ${sales.length} sample sales over the last 14 days`);
    } else {
      logger.log('Sales already exist (or no user to attribute them to), not adding samples');
    }
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  logger.error(error);
  process.exit(1);
});
