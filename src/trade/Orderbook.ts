import { BASE_CURRENCY } from "./Engine";

export interface Order {
  price: number;
  quantity: number;
  orderId: string;
  filled: number;
  side: "buy" | "sell";
  userId: string;
}

export interface Fill {
  price: string;
  qty: number;
  tradeId: number;
  otherUserId: string;
  markerOrderId: string; //This is the orderId of the other user
}

export class Orderbook {
  bids: Order[];
  asks: Order[];
  baseAsset: string;
  quoteAsset: string = BASE_CURRENCY;
  lastTradeId: number;
  currentPrice: number;

  constructor(
    baseAsset: string,
    bids: Order[],
    asks: Order[],
    lastTradeId: number,
    currentPrice: number
  ) {
    this.bids = bids;
    this.asks = asks;
    this.baseAsset = baseAsset;
    this.lastTradeId = lastTradeId || 0;
    this.currentPrice = currentPrice || 0;
  }

  ticker() {
    return `${this.baseAsset}_${this.quoteAsset}`;
  }

  getSnapshot() {
    return {
      baseAsset: this.baseAsset,
      bids: this.bids,
      asks: this.asks,
      lastTradeId: this.lastTradeId,
      currentPrice: this.currentPrice,
    };
  }

  //TODO: Add self trade prevention

  // Order = {
  //     price: Number(price),
  //     quantity: Number(quantity),
  //     orderId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
  //     filled: 0,
  //     side,
  //     userId
  // }

  addOrder(order: Order): {
    executedQty: number;
    fills: Fill[];
  } {
    if (order.side === "buy") {
      const { executedQty, fills } = this.matchBid(order);
      order.filled = executedQty;
      if (executedQty === order.quantity) {
        return {
          executedQty,
          fills,
        };
      }
      this.bids.push(order); //If the the order is Not fully Filled then we will push the order in the bids table
      return {
        executedQty,
        fills,
      };
    } else {
      const { executedQty, fills } = this.matchAsk(order);
      order.filled = executedQty;
      if (executedQty === order.quantity) {
        return {
          executedQty,
          fills,
        };
      }
      this.asks.push(order); //If the the order is Not fully Filled then we will push the order in the Asks table
      return {
        executedQty,
        fills,
      };
    }
  }

  // Optimized matchBid: Using a while loop to process and remove filled orders inline.
  matchBid(order: Order): { fills: Fill[]; executedQty: number } {
    const fills: Fill[] = [];
    let executedQty = 0;

    // Sort asks ascending by price so that lowest price orders are processed first.
    this.asks.sort((a, b) => a.price - b.price);

    let i = 0;
    // Process orders until order is fully filled or no matching ask remains.
    while (i < this.asks.length && executedQty < order.quantity) {
      const ask = this.asks[i];
      // Asks are sorted; if this ask's price is above the order's price, no further match is possible.
      if (ask.price > order.price) break;
      
      // If ask's quantity is zero, remove it immediately and continue.
      if (ask.quantity <= 0) {
        this.asks.splice(i, 1);
        continue;
      }
      
      // Calculate fill quantity.
      const fillQty = Math.min(order.quantity - executedQty, ask.quantity);
      executedQty += fillQty;
      ask.filled += fillQty;
      ask.quantity -= fillQty;
      
      // Record the fill.
      fills.push({
        price: ask.price.toString(),
        qty: fillQty,
        tradeId: this.lastTradeId++,
        otherUserId: ask.userId,
        markerOrderId: ask.orderId,
      });
      
      // If the ask is fully filled, remove it; otherwise, move to the next ask.
      if (ask.quantity === 0) {
        this.asks.splice(i, 1);
      } else {
        i++;
      }
    }
    return { fills, executedQty };
  }

  // Optimized matchAsk: Using a while loop to process and remove filled orders inline.
  matchAsk(order: Order): { fills: Fill[]; executedQty: number } {
    const fills: Fill[] = [];
    let executedQty = 0;

    // Sort bids descending by price so that highest price orders are processed first.
    this.bids.sort((a, b) => b.price - a.price);

    let i = 0;
    // Process orders until order is fully filled or no matching bid remains.
    while (i < this.bids.length && executedQty < order.quantity) {
      const bid = this.bids[i];
      // If the bid's price is lower than the order's price, no further match is possible.
      if (bid.price < order.price) break;
      
      // If bid's quantity is zero, remove it immediately and continue.
      if (bid.quantity <= 0) {
        this.bids.splice(i, 1);
        continue;
      }
      
      // Calculate fill quantity.
      const fillQty = Math.min(order.quantity - executedQty, bid.quantity);
      executedQty += fillQty;
      bid.filled += fillQty;
      bid.quantity -= fillQty;
      
      // Record the fill.
      fills.push({
        price: bid.price.toString(),
        qty: fillQty,
        tradeId: this.lastTradeId++,
        otherUserId: bid.userId,
        markerOrderId: bid.orderId,
      });
      
      // If the bid is fully filled, remove it; otherwise, move to the next bid.
      if (bid.quantity === 0) {
        this.bids.splice(i, 1);
      } else {
        i++;
      }
    }
    return { fills, executedQty };
  }

  //TODO: Can you make this faster? Can you compute this during order matches?
  getDepth() {
    const bids: [string, string][] = [];
    const asks: [string, string][] = [];

    const bidsObj: { [key: string]: number } = {};
    const asksObj: { [key: string]: number } = {};

    // {
    //     "100.5": 15,
    //     "101.0": 20,
    //     "102.5": 30
    // }

    for (let i = 0; i < this.bids.length; i++) {
      const order = this.bids[i];
      if (!bidsObj[order.price]) {
        bidsObj[order.price] = 0;
      }
      bidsObj[order.price] += order.quantity;
    }

    for (let i = 0; i < this.asks.length; i++) {
      const order = this.asks[i];
      if (!asksObj[order.price]) {
        asksObj[order.price] = 0;
      }
      asksObj[order.price] += order.quantity;
    }

    for (const price in bidsObj) {
      //Or we can Do also Object.Keys.bidsObj to run the Loop in the Object
      bids.push([price, bidsObj[price].toString()]);
      // If bidsObj is { "100.5": 15, "101.0": 20 },
      // This will result in bids being [['100.5', '15'], ['101.0', '20']]
    }

    for (const price in asksObj) {
      asks.push([price, asksObj[price].toString()]);
    }

    //Sort the Bids in the Descending Order
    bids.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    //Sort the Asks in the Ascending Order
    asks.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

    return {
      bids,
      asks,
    };
  }

  getOpenOrders(userId: string): Order[] {
    //To know which Order of the user are in the OrderBook
    const asks = this.asks.filter((x) => x.userId === userId);
    const bids = this.bids.filter((x) => x.userId === userId);
    return [...asks, ...bids];
  }

  //Removing a Particular order from the Bids and the asks Table
  cancelBid(order: Order) {
    const index = this.bids.findIndex((x) => x.orderId === order.orderId);
    if (index !== -1) {
      const price = this.bids[index].price;
      this.bids.splice(index, 1);
      return price;
    }
  }

  cancelAsk(order: Order) {
    const index = this.asks.findIndex((x) => x.orderId === order.orderId);
    if (index !== -1) {
      const price = this.asks[index].price;
      this.asks.splice(index, 1);
      return price;
    }
  }
}
