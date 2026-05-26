// Client-side in-memory stub of the upstream Upstash Redis multiplayer
// presence action. Sufficient for single-tab demos (count always = 1).
const PLAYER_TIMEOUT_MS = 10_000
const players = new Map<string, number>()

export async function updatePlayerHeartbeat(playerId: string): Promise<number> {
  if (!playerId || typeof playerId !== "string") throw new Error("Invalid playerId")
  const now = Date.now()
  players.set(playerId, now)
  for (const [id, ts] of players) if (now - ts > PLAYER_TIMEOUT_MS) players.delete(id)
  return players.size
}
