import { createClient } from "redis";
import { Engine } from "./trade/Engine";
import { redisToken, redisUrl } from "./config";
import * as cron from 'node-cron';
import express from 'express';

async function main() {
    const engine = new Engine();
    
    if (!redisUrl || !redisToken) {
        console.log("Redis URL and token must be provided in environment variables.");
        throw new Error("Redis URL and token must be provided in environment variables.");
    }

    const redisClient = createClient(
        {
        url: redisUrl,
    }
);

    // Handle Redis errors
    redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
    });

    await redisClient.connect();
    console.log("Connected to Redis Queue");

    const processMessages = async () => {
        try {
            // Use BRPOP instead of RPOP - it blocks until a message is available
            // Timeout of 0 means it will block indefinitely
            const result = await redisClient.brPop(
                'messages',
                0
            );

            if (result) {
                const { element: message } = result;
                await engine.process(JSON.parse(message));
            }

            // Process next message
            setImmediate(processMessages);
        } catch (error) {
            console.error('Error processing message:', error);
            // Wait a bit before retrying in case of errors
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