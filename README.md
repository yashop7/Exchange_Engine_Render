# Exchange Engine

A high-performance, in-memory order matching engine for a cryptocurrency/stock exchange platform. Built with TypeScript and designed for real-time trading with persistent state, multi-service communication via Redis, and a clean separation between the matching core and surrounding infrastructure.

## Overview

This service sits at the heart of a multi-service exchange architecture. It:

- Accepts orders from an API layer via a Redis message queue
- Matches buy and sell orders using price-time priority
- Maintains user balances (available + locked) across multiple assets
- Publishes depth updates and trade events to a WebSocket layer
- Queues trade records for a database processor
- Persists full state to a snapshot file every 3 seconds for crash recovery

```
API Layer
   │  (Redis queue: messages)
   ▼
Exchange Engine  ──────── snapshot.json (state persistence)
   │
   ├── (Redis pub/sub: clientId channel) ──────► API Layer (responses)
   ├── (Redis pub/sub: depth.200ms.MARKET) ────► WebSocket Layer
   ├── (Redis pub/sub: trade.MARKET) ──────────► WebSocket Layer
   └── (Redis queue: db_processor) ────────────► DB Processor
```

## Architecture

### Message Flow

1. The API layer pushes JSON messages onto the `messages` Redis queue, each containing a `clientId` and a typed `message` payload.
2. The engine consumes these with a blocking `BRPOP` loop — one message at a time, no concurrency.
3. After processing, responses are published back to the `clientId` pub/sub channel.
4. Trade and depth events are fanned out to the downstream WebSocket and DB processor services via a second Redis instance.

### State Management

All state lives in-memory:

- **Order books** — one `Orderbook` instance per trading pair (e.g. `TATA_INR`), holding sorted bid and ask arrays.
- **User balances** — a flat map of `userId → currency → { available, locked }`.

Every 3 seconds, the full state is serialized to `snapshot.json`. On startup with `WITH_SNAPSHOT=true`, this snapshot is restored, making restarts transparent to users.

### Order Matching

Orders are matched using **price-time priority**:

- Incoming buy orders are matched against the lowest-priced asks.
- Incoming sell orders are matched against the highest-priced bids.
- Partial fills are supported — an order can fill across multiple counterparty orders.
- Fully filled orders are removed from the book inline during the matching loop.

Before any order is placed, the required funds are **locked** from the user's available balance. After a match, both sides' balances are settled atomically.

## Project Structure

```
src/
├── index.ts            # Entry point: queue consumer loop + HTTP health check
├── config.ts           # Environment variable loading
├── RedisManager.ts     # Singleton for all Redis I/O (two instances)
├── trade/
│   ├── Engine.ts       # Message routing, balance management, snapshot I/O
│   ├── Orderbook.ts    # Order book data structure and matching algorithm
│   └── events.ts       # Event type string constants
└── types/
    ├── index.ts        # Shared core types
    ├── fromApi.ts      # Incoming message shapes (CREATE_ORDER, etc.)
    ├── toApi.ts        # Outgoing response shapes
    └── toWs.ts         # WebSocket event shapes (depth, trade, ticker)
```

## Message Types

### Incoming (from API via `messages` queue)

| Type | Payload |
|---|---|
| `CREATE_ORDER` | `market`, `price`, `quantity`, `side` (buy/sell), `userId` |
| `CANCEL_ORDER` | `orderId`, `market` |
| `GET_DEPTH` | `market` |
| `GET_OPEN_ORDERS` | `userId`, `market` |
| `GET_BALANCE` | `userId` |
| `ON_RAMP` | `userId`, `amount` |

### Outgoing (to API via pub/sub)

| Type | Payload |
|---|---|
| `ORDER_PLACED` | `orderId`, `executedQty`, `fills[]` |
| `ORDER_CANCELLED` | `orderId`, `executedQty`, `remainingQty` |
| `DEPTH` | `bids[]`, `asks[]` |
| `OPEN_ORDERS` | `Order[]` |
| `BALANCE` | `userId`, `balance`, `inr`, `openOrders` |
| `ON_RAMP` | `message` |

### Outgoing (to WebSocket layer via pub/sub)

| Channel | Payload |
|---|---|
| `depth.200ms.{MARKET}` | Aggregated price levels: `{ b: bids, a: asks }` |
| `trade.{MARKET}` | Trade event: `{ t, m, p, q, s }` |

## Data Models

### Order

```typescript
{
  price: number
  quantity: number
  orderId: string
  filled: number
  side: "buy" | "sell"
  userId: string
}
```

### User Balance

```typescript
{
  [userId: string]: {
    INR:  { available: number; locked: number }
    TATA: { available: number; locked: number }
  }
}
```

### Fill (trade match result)

```typescript
{
  price: string
  qty: number
  tradeId: number
  otherUserId: string
  markerOrderId: string
}
```

## Getting Started

### Prerequisites

- Node.js 20+
- Two Redis instances (or Upstash URLs)
- Bun (for local dev builds)

### Environment Variables

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `REDIS_API_ENGINE_URL` | Redis instance for API ↔ Engine communication |
| `REDIS_ENGINE_DOWNSTREAM_URL` | Redis instance for Engine → WebSocket/DB communication |
| `WITH_SNAPSHOT` | Set to `true` to restore state from `snapshot.json` on startup |
| `PORT` | HTTP server port (default: `3000`) |

### Running Locally

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start with snapshot restore
npm start

# Dev: build + start in one step
npm run dev
```

### Running Tests

```bash
npm test
```

Tests are written with [Vitest](https://vitest.dev/) and cover order matching scenarios including partial fills, cross-price matching, and remaining quantity tracking.

## Deployment

The engine is configured for [Railway](https://railway.app) via `railway.json`:

- **Builder**: Nixpacks
- **Region**: us-west2
- **Replicas**: 1 (single instance — required, as all state is in-memory)
- **Restart policy**: On failure, up to 10 retries
- **Sleep**: Disabled (always on)

The single-replica constraint is intentional. Because the order book and balance state live in memory, running multiple replicas would produce inconsistent state. Horizontal scaling would require a shared state layer (e.g. Redis Streams with distributed locking or an external state store).

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "healthy" }` for liveness probes |

## Known Limitations

- **Float precision**: Order prices and quantities use JavaScript `number`. For production use, a fixed-point or decimal library (e.g. `decimal.js`) is needed to avoid rounding errors.
- **Single market hardcoded**: The engine initializes with `TATA_INR` only. Multi-market support is partially implemented (the `orderbooks` map exists) but `addOrderbook()` is not yet wired up.
- **No self-trade prevention**: A user can match their own orders. This is flagged as a TODO in the source.
- **No authentication**: The engine trusts all messages from the queue; authentication and authorization live in the API layer.
