"use server"

export interface ScribeTokenResult {
  token?: string
  error?: string
}

export async function getScribeToken(): Promise<ScribeTokenResult> {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY

    if (!apiKey) {
      return { error: "Service not configured" }
    }

    const response = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Failed to get Scribe token:", errorText)
      return { error: "Failed to get transcription token" }
    }

    const data = await response.json()

    if (!data.token) {
      return { error: "Invalid token response" }
    }

    return { token: data.token }
  } catch (error) {
    console.error("Error getting Scribe token:", error)
    return {
      error: error instanceof Error ? error.message : "Failed to get token",
    }
  }
}
