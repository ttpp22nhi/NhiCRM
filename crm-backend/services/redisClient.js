import { createClient } from 'redis'

let client = null
let connecting = null
let disabled = false

function getRedisUrl() {
  const url = process.env.REDIS_URL
  return url && String(url).trim() ? String(url).trim() : null
}

export async function getRedisClient() {
  if (disabled) return null
  const url = getRedisUrl()
  if (!url) return null

  if (client) return client
  if (connecting) return connecting

  connecting = (async () => {
    const c = createClient({
      url,
      socket: {
        // Fail fast: tránh treo request API khi Redis không sẵn sàng.
        connectTimeout: 1000,
        reconnectStrategy: () => false
      }
    })
    c.on('error', (err) => {
      // Avoid crashing the app on Redis transient errors
      console.error('[redis] error:', err?.message || err)
    })
    await c.connect()
    client = c
    connecting = null
    console.log('[redis] connected')
    return client
  })().catch((err) => {
    connecting = null
    disabled = true
    console.error('[redis] connect failed:', err?.message || err)
    console.error('[redis] disabled for this process; caching is bypassed')
    return null
  })

  return connecting
}

