require('dotenv').config();

// Instance 1: API <-> Engine (messages queue + sendToApi pubsub)
export const redisApiEngineUrl = process.env.REDIS_API_ENGINE_URL;

// Instance 2: Engine -> WebSocket pubsub + db_processor queue
export const redisEngineDownstreamUrl = process.env.REDIS_ENGINE_DOWNSTREAM_URL;

export const redisUrl = redisApiEngineUrl;
export const redisToken = "";