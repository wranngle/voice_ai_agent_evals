"use server"

import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

/** Player is considered inactive after 10 seconds without a heartbeat */
const PLAYER_TIMEOUT_MS = 10_000

/** Redis key for the sorted set storing player timestamps */
const PLAYERS_KEY = "pong:players"

/**
 * Updates a player's heartbeat and returns the current count of active players.
 *
 * @param playerId - Unique identifier for the player
 * @returns The total number of currently active players
 *
 * @remarks
 * This function performs three operations:
 * 1. Updates or adds the player's timestamp in Redis
 * 2. Removes players who haven't sent a heartbeat in 10 seconds
 * 3. Returns the count of remaining active players
 *
 * Uses Redis sorted sets with timestamps as scores for efficient
 * range-based cleanup of stale entries.
 */
export async function updatePlayerHeartbeat(playerId: string): Promise<number> {
  if (!playerId || typeof playerId !== "string") {
    throw new Error("Invalid playerId")
  }

  const now = Date.now()

  await redis.zadd(PLAYERS_KEY, { score: now, member: playerId })

  await redis.zremrangebyscore(PLAYERS_KEY, 0, now - PLAYER_TIMEOUT_MS)

  const count = await redis.zcard(PLAYERS_KEY)

  return count
}
