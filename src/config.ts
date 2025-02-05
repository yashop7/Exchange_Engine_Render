require('dotenv').config();
export const redisUrl = process.env.UPSTASH_REDIS_REST_URL; // Your Upstash Redis URL
export const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN; // Your Upstash Redis token

export const appId =  process.env.PUSHER_APP_ID
export const key =  process.env.PUSHER_KEY
export const secret =  process.env.PUSHER_SECRET
export const cluster =  process.env.PUSHER_CLUSTER
export const useTLS =  process.env.PUSHER_USE_TLS === "true"
