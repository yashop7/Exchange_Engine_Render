import { DEPTH_UPDATE, TICKER_UPDATE } from "./trade/events";
import { RedisClientType, createClient } from "redis";
import { ORDER_UPDATE, TRADE_ADDED } from "./types";
import { WsMessage } from "./types/toWs";
import { MessageToApi } from "./types/toApi";
import {
  redisUrl as apiredisurl,
  appId,
  key,
  secret,
  cluster,
  useTLS,
  api_pusher_id,
  api_pusher_key,
  api_pusher_tls,
  api_pusher_cluster,
  api_pusher_secret,
} from "./config";
import Pusher from "pusher";

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

export class RedisManager {
  // private client: RedisClientType;
  private apiclient: RedisClientType;
  private static instance: RedisManager;
  private APIpusher: any;
  private WSpusher: any;

  constructor() {
    if (!apiredisurl) {
      console.log(
        "Redis URL and token must be provided in environment variables."
      );
      throw new Error(
        "Redis URL and token must be provided in environment variables."
      );
    }
    // this.client = createClient();
    // this.client.connect();

    this.WSpusher = new Pusher({
      appId: appId || "",
      key: key || "",
      secret: secret || "",
      cluster: cluster || "",
      useTLS: useTLS,
    });
    this.APIpusher = new Pusher({
      appId: api_pusher_id || "",
      key: api_pusher_key || "",
      secret: api_pusher_secret || "",
      cluster: api_pusher_cluster || "",
      useTLS: api_pusher_tls === "true",
    });

    this.apiclient = createClient({
      url: apiredisurl,
    });
    this.apiclient.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }

  public pushMessage(message: DbMessage) {
    //This is here we are Pushing into the Queue which is reaching the DB
    console.log("----------------------");
    console.log("PUSHING MESSAGE TO THE QUEUE", message);
    console.log("----------------------");
    this.apiclient.lPush("db_processor", JSON.stringify(message));
  }

  public publishMessage(channel: string, message: WsMessage) {
    console.log("PUBLISHING MESSAGE TO WS PubSub CHANNEL", channel, message);
    // this.client.publish(channel, JSON.stringify(message));

    // Using Pusher to trigger an event on the channel.
    this.WSpusher
      .trigger(channel, "my-event", message)
      .then(() => {
        console.log("Message published to WS Server successfully");
      })
      .catch((error: any) => {
        console.error("Error publishing message:", error);
      });
  }
  //SEARCH FOR THIS LINE IN WS SERVER
  // this.redisClient.subscribe(subscription, this.redisCallbackHandler);

  public sendToApi(clientId: string, message: MessageToApi) {
    //This is the First PubSub which Talks to the API Server
    // console.log("SENDING MESSAGE TO API", clientId, message);
    // this.apiclient.publish(clientId, JSON.stringify(message));
    
    this.APIpusher
      .trigger(clientId, "my-event", message)
      .then(() => {
        console.log("Message published to successfully");
      })
      .catch((error: any) => {
        console.error("Error publishing message:", error);
      });
  }
}
