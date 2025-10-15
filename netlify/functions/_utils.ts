import type { Handler } from '@netlify/functions'
import crypto from 'node:crypto'
import { sessionService, userService } from '../../server/db/service'

export const json = (status: number, body: any, headers: Record<string, string> = {}) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

export const parseCookie = (cookie: string | undefined) => Object.fromEntries((cookie || '').split(';').map(v => v.trim().split('=')))
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export const getUserFromSession = async (event: Parameters<Handler>[0]) => {
  const cookies = parseCookie((event.headers as any).cookie)
  const token = cookies['pf_session']
  if (token) {
    const session = await sessionService.getByTokenHash(sha256(token))
    if (session && (!session.expiresAt || new Date(session.expiresAt as any).getTime() >= Date.now())) {
      const user = await userService.getById(session.userId as string)
      if (user) return user
    }
  }

  // Dev fallback: allow identifying user via headers sent by the SPA
  const headers = event.headers as any
  const headerUserId = headers['x-user-id'] || headers['X-User-Id']
  const headerEmail = headers['x-user-email'] || headers['X-User-Email']
  const headerName = headers['x-user-name'] || headers['X-User-Name']
  if (headerUserId) {
    let user = await userService.getById(headerUserId as string)
    if (!user && headerEmail) {
      try {
        user = await userService.create({ id: headerUserId as string, email: headerEmail as string, name: headerName as any })
      } catch (e) {
        // If creation failed due to existing email, try retrieving by email
        try {
          user = await userService.getByEmail(headerEmail as string)
        } catch {}
      }
    }
    return user || null
  }

  return null
}
