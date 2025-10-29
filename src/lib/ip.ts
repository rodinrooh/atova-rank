import { createHash } from 'crypto'

export function extractClientIP(request: Request): string {
  // Extract IP from x-forwarded-for header (first value)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  
  // Fallback to connection remote address (not available in Next.js Request)
  // This would need to be handled differently in actual implementation
  throw new Error('Unable to extract client IP')
}

export function hashIP(clientIP: string, seasonId: string, matchupId: string): string {
  const salt = process.env.ATOVA_IP_SALT!
  const input = `${clientIP}${seasonId}${matchupId}${salt}`
  return createHash('sha256').update(input).digest('hex')
}
