import type { Handler } from '@netlify/functions'
import crypto from 'node:crypto'
import { userService, sessionService } from '../../server/db/service'

// Helpers
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const json = (status: number, body: any, headers: Record<string, string> = {}) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

const setSessionCookie = (token: string, maxAgeSeconds: number) => {
  const secure = 'Secure'
  const sameSite = 'SameSite=Lax'
  const httpOnly = 'HttpOnly'
  const path = 'Path=/'
  return `pf_session=${token}; Max-Age=${maxAgeSeconds}; ${path}; ${httpOnly}; ${sameSite}; ${secure}`
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' })
    }
    const { email, password, name } = JSON.parse(event.body || '{}')
    if (!email || !password) return json(400, { error: 'Email and password required' })

    // Check by email
    const existing = await userService.getByEmail(email)
    if (existing) return json(409, { error: 'Email already in use' })

    // Hash password using scrypt
    const salt = crypto.randomBytes(16)
    const derivedKey = crypto.scryptSync(password, salt, 64)
    const hashed = `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`

    // Create user
    const user = await userService.create({ id: crypto.randomUUID(), email, name: name || null, hashedPassword: hashed } as any)

    // Create session (24 hours)
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
  } catch (e: any) {
    console.error('signup error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
