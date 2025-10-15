import type { Handler } from '@netlify/functions'
import crypto from 'node:crypto'
import { userService, sessionService } from '../../server/db/service'

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const json = (status: number, body: any, headers: Record<string, string> = {}) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})
const parseCookie = (cookie: string | undefined) => Object.fromEntries((cookie || '').split(';').map(v => v.trim().split('=')))
const setSessionCookie = (token: string, maxAgeSeconds: number) => `pf_session=${token}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax; Secure`

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'POST') {
      // login
      const { email, password } = JSON.parse(event.body || '{}')
      if (!email || !password) return json(400, { error: 'Email and password required' })
      const user = await userService.getByEmail(email)
      if (!user || !user.hashedPassword) return json(401, { error: 'Invalid credentials' })

      const [algo, saltHex, keyHex] = String(user.hashedPassword).split(':')
      if (algo !== 'scrypt' || !saltHex || !keyHex) return json(500, { error: 'Unsupported password format' })
      const derivedKey = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
      const ok = crypto.timingSafeEqual(derivedKey, Buffer.from(keyHex, 'hex'))
      if (!ok) return json(401, { error: 'Invalid credentials' })

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
    }

    if (event.httpMethod === 'DELETE') {
      // logout
      const cookies = parseCookie(event.headers.cookie)
      const token = cookies['pf_session']
      if (token) {
        await sessionService.deleteByTokenHash(hash(token))
      }
      return {
        statusCode: 204,
        headers: {
          'Set-Cookie': 'pf_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
        },
        body: '',
      }
    }

    if (event.httpMethod === 'GET') {
      // session
      const cookies = parseCookie(event.headers.cookie)
      const token = cookies['pf_session']
      if (!token) return json(200, { user: null })
      const session = await sessionService.getByTokenHash(hash(token))
      if (!session || (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now())) {
        return json(200, { user: null })
      }
      // Load user by id
      const user = await userService.getById(session.userId as string)
      if (!user) return json(200, { user: null })
      return json(200, { user: { id: user.id, email: user.email, name: user.name } })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e: any) {
    console.error('auth-login error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
