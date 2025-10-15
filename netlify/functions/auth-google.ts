import type { Handler } from '@netlify/functions'
import crypto from 'node:crypto'
import { userService, sessionService } from '../../server/db/service'

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const json = (status: number, body: any, headers: Record<string, string> = {}) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})
const setSessionCookie = (token: string, maxAgeSeconds: number) => `pf_session=${token}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax; Secure`

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
    const { email, name } = JSON.parse(event.body || '{}')
    if (!email) return json(400, { error: 'Email required' })

    let user = await userService.getByEmail(email)
    if (!user) {
      user = await userService.create({ id: crypto.randomUUID(), email, name: name || null } as any)
    }

    // Issue session
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hash(token)
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await sessionService.create(user.id, { sessionToken: tokenHash, expiresAt: expires } as any)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setSessionCookie(token, 24 * 60 * 60),
      },
      body: JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }),
    }
  } catch (e) {
    console.error('auth-google error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
