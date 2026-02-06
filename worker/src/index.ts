import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";

// Redis connection
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

// Define queues
export const syncIndexQueue = new Queue("sync-index", { connection });

// Processor for sync-index queue
const worker = new Worker(
    "sync-index",
    async (job) => {
        console.log(`[Worker] Processing job ${job.id}:`, job.data);

        // Mock Meilisearch sync for MVP
        // In production: Fetch item from DB -> Upsert to Meilisearch
        const { itemId, updatedAt } = job.data;

        console.log(`[Worker] Simulating Meilisearch sync for item: ${itemId}`);
        console.log(`[Worker] Updated at: ${updatedAt}`);

        // Simulate processing time
        await new Promise((resolve) => setTimeout(resolve, 500));

        console.log(`[Worker] ✓ Job ${job.id} completed successfully`);

        return { success: true, itemId };
    },
    { connection }
);

worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job?.id} has completed`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} has failed:`, err.message);
});

console.log("[Worker] 🚀 Lifebook Worker started");
console.log("[Worker] Listening for jobs on 'sync-index' queue...");
