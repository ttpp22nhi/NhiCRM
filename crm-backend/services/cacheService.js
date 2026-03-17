import crypto from 'crypto'
import { getRedisClient } from './redisClient.js'

const PREFIX = 'crm:cache:'

function sha1(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex')
}

export function buildScopeCacheKey(scopeOptions) {
  if (scopeOptions == null) return 'scope=global'
  if (typeof scopeOptions === 'string') return `scopePath=${scopeOptions}`
  if (typeof scopeOptions === 'object') {
    if (scopeOptions.scopePath) return `scopePath=${scopeOptions.scopePath}`
    if (Array.isArray(scopeOptions.employeeIds)) {
      const ids = [...scopeOptions.employeeIds].map(String).sort()
      return `employeeIds=${sha1(ids.join(','))}`
    }
  }
  return 'scope=unknown'
}

export function buildDateRangeCacheKey(dateRange) {
  if (!dateRange) return 'dateRange=none'
  return `from=${Number(dateRange.fromTs) || 0}&to=${Number(dateRange.toTs) || 0}`
}

export async function getJson(key) {
  const redis = await getRedisClient()
  if (!redis) return null
  const raw = await redis.get(PREFIX + key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

export async function setJson(key, value, ttlSeconds = 60) {
  const redis = await getRedisClient()
  if (!redis) return false
  await redis.set(PREFIX + key, JSON.stringify(value), { EX: Math.max(1, Number(ttlSeconds) || 60) })
  return true
}

export async function getOrSetJson(key, ttlSeconds, loaderFn) {
  const cached = await getJson(key)
  if (cached != null) return { hit: true, value: cached }
  const value = await loaderFn()
  await setJson(key, value, ttlSeconds)
  return { hit: false, value }
}

