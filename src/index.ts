import { createClient } from "redis";
import { Engine } from "./trade/Engine";
import { redisApiEngineUrl } from "./config";
import * as cron from 'node-cron';
import express from 'express';

async function main() {
    const engine = new Engine();

    if (!redisApiEngineUrl) {
        throw new Error("REDIS_API_ENGINE_URL must be set in environment variables.");
    }

    const redisClient = createClient({
        url: redisApiEngineUrl,
        socket: {
            reconnectStrategy: (retries) => Math.min(retries * 500, 10000),
        },
    });

    redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
    });

    await redisClient.connect();
    console.log("Waiting for events from Redis Queue which will be pushed by API server");

    const waitForReady = (): Promise<void> =>
        new Promise((resolve) => {
            if (redisClient.isReady) return resolve();
            redisClient.once('ready', resolve);
        });

    const processMessages = async () => {
        try {
            if (!redisClient.isReady) {
                await waitForReady();
            }

            const result = await redisClient.brPop('messages', 0);

            if (result) {
                const { element: message } = result;
                engine.process(JSON.parse(message));
            }

            setImmediate(processMessages);
        } catch (error) {
            console.error('Error processing message:', error);
            setTimeout(processMessages, 1000);
        }
    };

    // Start processing messages
    await processMessages();
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

const app = express();
const port = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
    console.log("Health check - server is alive from the HTTP");
    res.status(200).json({ status: 'healthy' });
});

// Cron job to keep the server alive
cron.schedule('*/12 * * * *', () => {
    console.log('Health check - server is alive');
});

app.listen(port, () => {
    console.log(`Health check server running on port ${port}`);
});