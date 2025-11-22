#!/usr/bin/env -S deno run --allow-net

import amqp, { Connection, Channel } from "npm:amqplib";
import { Buffer } from "node:buffer";

// -------------------------
// Deno env vars
// -------------------------
const RABBITMQ_USER = Deno.env.get("DA_RABBITMQ_USER")!;
const RABBITMQ_PASS = Deno.env.get("DA_RABBITMQ_PASS")!;
const RABBITMQ_HOST = Deno.env.get("DA_RABBITMQ_HOST")!;
const RABBITMQ_PORT = Deno.env.get("DA_RABBITMQ_PORT")!;

const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

// -------------------------
// Connection state
// -------------------------
let connection: Connection | null = null;
let channel: Channel | null = null;
let isRabbitMQConnectionHealthy = false;

// -------------------------
// Connect & setup channel
// -------------------------
async function connectToRabbitMQ(): Promise<Connection> {
  console.log("[RabbitMQ] Connecting...");
  const conn = await amqp.connect(RABBITMQ_URL);
  connection = conn;
  channel = await conn.createChannel();
  isRabbitMQConnectionHealthy = true;

  conn.on("close", () => {
    console.warn("[RabbitMQ] Connection closed");
    isRabbitMQConnectionHealthy = false;
    connection = null;
    channel = null;
    scheduleReconnect();
  });

  // deno-lint-ignore no-explicit-any
  conn.on("error", (err: any) => {
    console.error("[RabbitMQ] Connection error:", err);
    isRabbitMQConnectionHealthy = false;
    connection = null;
    channel = null;
    scheduleReconnect();
  });

  console.log("[RabbitMQ] Connected");
  return conn;
}

let reconnectTimeout: number | null = null;
const RECONNECT_INTERVAL_MS = 60_000;

function scheduleReconnect() {
  if (reconnectTimeout) return;
  console.log(`[RabbitMQ] Reconnecting in ${RECONNECT_INTERVAL_MS / 1000}s...`);
  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    try {
      await connectToRabbitMQ();
    } catch (_) {
      // ignore
    }
  }, RECONNECT_INTERVAL_MS);
}

// -------------------------
// Export health
// -------------------------
export async function getIsRabbitMQConnectionHealthy(): Promise<boolean> {
  if (!isRabbitMQConnectionHealthy) {
    try {
      await connectToRabbitMQ();
    } catch (err) {
      console.error("[RabbitMQ] Health check failed:", err);
    }
  }
  return isRabbitMQConnectionHealthy;
}

// -------------------------
// Public API
// -------------------------
export async function getRabbitMQConnection(): Promise<Connection> {
  if (connection) return connection;
  return await connectToRabbitMQ();
}

export async function publish(queueName: string, message: unknown) {
  if (!channel) await getIsRabbitMQConnectionHealthy();
  if (!channel) throw new Error("RabbitMQ channel not available");

  await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
    contentType: "application/json",
    persistent: true,
  });
  console.log(`[RabbitMQ] Message published to queue "${queueName}"`);
}

export async function listen<T>(
  queueName: string,
  handler: (msg: T) => void | Promise<void>,
  noAck = false
) {
  if (!channel) await getIsRabbitMQConnectionHealthy();
  if (!channel) throw new Error("RabbitMQ channel not available");

  await channel.assertQueue(queueName, { durable: true });
  console.log(`[RabbitMQ] Waiting for messages in queue "${queueName}"...`);

  await channel.consume(
    queueName,
    // deno-lint-ignore no-explicit-any
    async (msg: any) => {
      if (msg) {
        const decoded: T = JSON.parse(msg.content.toString());
        try {
          await handler(decoded);
          if (!noAck) channel.ack(msg);
        } catch (err) {
          console.error("[RabbitMQ] Error in message handler:", err);
          if (!noAck) channel.nack(msg, false, true);
        }
      }
    },
    { noAck }
  );
}

// -------------------------
// Example usage
// -------------------------
if (import.meta.main) {
  await publish("hello", { hello: "world" });

  await listen("hello", (msg) => {
    console.log("[x] Received:", msg);
  });
}
