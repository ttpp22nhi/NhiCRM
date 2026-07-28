/**
 * Lấy IP client thật (sau proxy/Nginx nếu có trust proxy).
 */
export function getClientIp(req) {
  if (!req) return null

  const xf = req.headers?.['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim()
  }
  if (Array.isArray(xf) && xf.length) {
    return String(xf[0]).trim()
  }

  const realIp = req.headers?.['x-real-ip']
  if (realIp) return String(realIp).trim()

  if (req.ip) return String(req.ip).replace(/^::ffff:/, '')

  const remote = req.socket?.remoteAddress
  if (remote) return String(remote).replace(/^::ffff:/, '')

  return null
}
