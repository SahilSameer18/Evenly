const BASE = '/api/v1'

// The access token lives in memory only, so a page reload gets a new one from the refresh cookie.
let accessToken = null
let signedOutHandler = () => {}
let refreshInFlight = null

export const config = { retryDelayMs: 300 }

export const setAccessToken = (token) => { accessToken = token }
export const getAccessToken = () => accessToken
export const onSignedOut = (handler) => { signedOutHandler = handler }
export const newIdempotencyKey = () => crypto.randomUUID()

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

async function send(path, { method = 'GET', body, idempotencyKey, auth = true, cookie = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (cookie) headers['X-Evenly-Client'] = 'web' // the server's CSRF guard needs this on cookie endpoints
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  let res
  try {
    res = await fetch(BASE + path, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK', message: "Can't reach the server. Check your connection and try again." })
  }

  let json = null
  try { json = await res.json() } catch { /* an empty or non-JSON body is handled below */ }
  const requestId = json?.meta?.requestId ?? res.headers?.get?.('x-request-id') ?? undefined
  if (res.ok) return { data: json?.data, meta: json?.meta ?? {} }
  throw new ApiError({
    status: res.status,
    code: json?.error?.code ?? 'UNKNOWN',
    message: json?.error?.message ?? 'Something went wrong. Try again.',
    details: json?.error?.details,
    requestId,
  })
}

// Only reads are retried, and only when the network or the server failed: a 4xx will not change by asking again.
async function withRetry(call, method = 'GET') {
  const attempts = method === 'GET' ? 3 : 1
  for (let i = 1; ; i++) {
    try {
      return await call()
    } catch (err) {
      const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500)
      if (!retryable || i >= attempts) throw err
      await new Promise((r) => setTimeout(r, config.retryDelayMs * 2 ** (i - 1)))
    }
  }
}

// Concurrent callers share one refresh: the server rotates the cookie, so a second parallel refresh would fail.
export function refreshSession() {
  refreshInFlight ??= send('/auth/refresh', { method: 'POST', auth: false, cookie: true })
    .then(({ data }) => {
      accessToken = data.accessToken
      return data
    })
    .finally(() => { refreshInFlight = null })
  return refreshInFlight
}

/** Calls the API and returns { data, meta }. A 401 triggers one refresh and one retry; if that fails the user is signed out. */
export async function request(path, options = {}) {
  try {
    return await withRetry(() => send(path, options), options.method)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || options.auth === false) throw err
    try {
      await refreshSession()
    } catch {
      accessToken = null
      signedOutHandler()
      throw err
    }
    return send(path, options)
  }
}
