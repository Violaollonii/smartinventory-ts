# SmartInventory

An inventory and sales management system. Staff record sales, stock decreases automatically, and nobody can sell more than is on the shelf. Admins manage products and users. A dashboard shows revenue per day, top products and low-stock alerts.

## Stack

| Part | Technology |
|---|---|
| Backend | NestJS 12, TypeScript, Mongoose 9 |
| Database | MongoDB (Atlas) |
| Auth | JWT (`@nestjs/jwt`), bcrypt password hashes, role guards |
| Validation | `class-validator` DTOs with a global `ValidationPipe` |
| Tests | Jest (`ts-jest`) |
| Frontend | React 19, TypeScript, Vite 8, React Router, Recharts |

## Project layout

```
backend/
  src/
    common/      auth.ts (guards, @Roles, @Public, @CurrentUser), env.ts (env validation)
    auth/        login + /auth/me
    users/       user schema, admin-only user management
    products/    product CRUD, search, low-stock list
    sales/       sale creation with atomic stock decrease (+ tests)
    reports/     MongoDB aggregations: sales per day, top products, summary
    testing/     in-memory model fakes used by the tests
    seed.ts      creates the first accounts and sample data
frontend/
  src/
    api.ts       typed API client
    auth.tsx     login state (React context)
    pages/       Login, Dashboard, Products, NewSale
    components/  Layout (navigation + route protection)
```

## Setup

Requirements: Node.js 22+ and npm. A MongoDB Atlas cluster (the free tier is enough). Nothing needs to be installed globally.

### 1. Database (MongoDB Atlas)

1. Create a cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. **Database Access**: add a database user with a password.
3. **Network Access**: add your current IP address.
4. **Connect > Drivers**: copy the connection string.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

- `MONGODB_URI`: your Atlas connection string, with `/smartinventory` as the database name
- `JWT_SECRET`: a long random string. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SEED_ADMIN_*` and `SEED_STAFF_*`: the email and password for the first two accounts

Then:

```bash
npm run seed        # creates the admin + staff accounts, sample products and sample sales
npm run start:dev   # API on http://localhost:3000/api
```

The API refuses to start if `MONGODB_URI` or `JWT_SECRET` is missing or still a placeholder.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Sign in with the admin or staff account from your `.env`. The Vite dev server forwards `/api` to the backend, so no extra configuration is needed.

### Tests

```bash
cd backend
npm test
```

The tests need no database:

- `sales/sales.service.spec.ts`: the sales and stock rules (stock decrease, blocking sales below 0, competing sales, all-or-nothing rollback, low-stock alerts). Runs the real `SalesService` against small in-memory models.
- `reports/reports.service.spec.ts`: date ranges and zero-filling for the reports.
- `app.http.spec.ts`: boots the whole app and checks that routes require a token, that staff cannot use admin routes, and that invalid input is rejected.

The aggregation pipelines themselves run only against a real MongoDB, so they are not covered by these tests.

## Roles

| Action | Admin | Staff |
|---|---|---|
| Sign in, view products, search | ✓ | ✓ |
| Record a sale, view sales | ✓ | ✓ |
| Dashboard and reports | ✓ | ✓ |
| Create, edit, delete products | ✓ | |
| Create and list users | ✓ | |

Every route requires a valid token unless it is explicitly marked `@Public()` (only login is). Role limits use `@Roles(Role.Admin)`.

## API

All routes are under `/api`. Send `Authorization: Bearer <token>` on everything except login.

| Method | Route | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Returns `{ accessToken, user }` |
| GET | `/auth/me` | any | The signed-in user |
| GET | `/products?search=&category=&limit=` | any | List and search products |
| GET | `/products/low-stock` | any | Products at or below their threshold |
| GET | `/products/:id` | any | One product |
| POST | `/products` | admin | Create a product |
| PATCH | `/products/:id` | admin | Update a product |
| DELETE | `/products/:id` | admin | Delete a product |
| POST | `/sales` | any | Record a sale: `{ items: [{ productId, quantity }] }` |
| GET | `/sales` | any | Latest 50 sales |
| GET | `/sales/:id` | any | One sale |
| GET | `/reports/sales-per-day?from=&to=` | any | Revenue, sales and units per day |
| GET | `/reports/top-products?from=&to=&limit=` | any | Best sellers by units sold |
| GET | `/reports/summary` | any | Headline numbers for the dashboard |
| POST | `/users` | admin | Create a user |
| GET | `/users` | admin | List users |

## How the stock rule works

"Never sell below 0" is enforced inside MongoDB, not by checking first and updating afterwards. Each sale line runs one atomic update:

```ts
productModel.findOneAndUpdate(
  { _id: productId, stock: { $gte: quantity } }, // only matches if enough stock
  { $inc: { stock: -quantity } },
);
```

If two people try to sell the last unit at the same moment, only one update matches. The other gets `409 Conflict` with a message such as `Not enough stock for "Mouse": requested 3, available 2`.

A sale with several lines is all-or-nothing: if one line fails, the stock already taken for earlier lines is given back and no sale is saved.

Other details:

- The client sends only product ids and quantities. Prices always come from the database.
- Each sale line stores a copy of the product name, SKU and price, so past sales stay correct when a product changes.
- The sale response includes `lowStockAlerts` for products that reached their threshold.

## Reports

Both reports are MongoDB aggregation pipelines in `backend/src/reports/reports.service.ts`:

- **Sales per day**: `$match` the date range, `$group` by day with `$dateToString`, `$sort`. Days without sales are filled with zeros.
- **Top products**: `$match`, `$unwind` the line items, `$group` by product, `$sort` by units sold, `$limit`.

Days are UTC days. The default range is the last 30 days.

## Security notes

- `.env` files are ignored by git. Only `.env.example` files are committed.
- Passwords are stored as bcrypt hashes and never returned by the API.
- Request bodies are validated, and unknown fields are rejected.
- The frontend keeps the token in `localStorage`. That is simple and common, but any script running on the page could read it. For a production deployment, consider an `httpOnly` cookie, plus HTTPS and rate limiting on login.
- A role change takes effect when the user's current token expires (`JWT_EXPIRES_IN`, 8 hours by default).
