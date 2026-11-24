import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const client = createClient({
  url: REDIS_URL
});

client.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

await client.connect();

export default client;