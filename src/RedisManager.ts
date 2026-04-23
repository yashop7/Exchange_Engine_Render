import { RedisClientType, createClient } from "redis";
import { ORDER_UPDATE, TRADE_ADDED } from "./types";
import { WsMessage } from "./types/toWs";
import { MessageToApi } from "./types/toApi";
import { redisApiEngineUrl, redisEngineDownstreamUrl } from "./config";

type DbMessage =
  | {
      type: typeof TRADE_ADDED;
      data: {
        id: string;
        isBuyerMaker: boolean;
        price: string;
        quantity: string;
        quoteQuantity: string;
        timestamp: number;
        market: string;
      };
    }
  | {
      type: typeof ORDER_UPDATE;
      data: {
        orderId: string;
        executedQty: number;
        market?: string;
        price?: string;
        quantity?: string;
        side?: "buy" | "sell";
      };
    };

function makeClient(url: string, label: string): RedisClientType {
  const client = createClient({
    url,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 500, 10000) },
  }) as RedisClientType;

  client.on("error", (err) => {
    console.error(`[${label}] Redis error: ${err.message}`);
  });

  client.connect().catch((err) => {
    console.error(`[${label}] Failed to connect: ${err.message}`);
  });

  return client;
}

export class RedisManager {
  // Instance 1: API <-> Engine
  private apiEngineClient: RedisClientType;
  // Instance 2: Engine -> WebSocket pubsub + DB Processor queue
  private downstreamClient: RedisClientType;

  private static instance: RedisManager;

  constructor() {
    if (!redisApiEngineUrl || !redisEngineDownstreamUrl) {
      throw new Error(
        "REDIS_API_ENGINE_URL and REDIS_ENGINE_DOWNSTREAM_URL must be set in environment variables."
      );
    }

    this.apiEngineClient = makeClient(redisApiEngineUrl, "API-Engine");
    this.downstreamClient = makeClient(redisEngineDownstreamUrl, "Downstream");
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }

  // Engine -> DB Processor queue (Instance 2)
  public pushMessage(message: DbMessage) {
    console.log("----------------------");
    console.log("PUSHING MESSAGE TO DB QUEUE", message);
    console.log("----------------------");
    this.downstreamClient.lPush("db_processor", JSON.stringify(message));
  }

  // Engine -> WebSocket pubsub (Instance 2)
  public publishMessage(channel: string, message: WsMessage) {
    console.log("PUBLISHING TO WS CHANNEL", channel, message);
    this.downstreamClient.publish(channel, JSON.stringify(message)).catch((err) => {
      console.error("Error publishing WS message:", err.message);
    });
  }

  // Engine -> API pubsub (Instance 1)
  public sendToApi(clientId: string, message: MessageToApi) {
    this.apiEngineClient.publish(clientId, JSON.stringify(message)).catch((err) => {
      console.error("Error publishing API message:", err.message);
    });
  }
}
