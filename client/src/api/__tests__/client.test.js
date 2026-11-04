import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError, config, getAccessToken, onSignedOut, request, setAccessToken } from '../client.js'

const reply = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => {
    if (body === undefined) throw new Error('no body')
    return body
  },
})
const ok = (data) => reply(200, { data, meta: { requestId: 'r1' } })
const fail = (status, code, extra = {}) => reply(status, { error: { code, message: `${code} message`, ...extra }, meta: { requestId: 'r2' } })

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  config.retryDelayMs = 0
  setAccessToken('old-token')
  onSignedOut(() => {})
})
const calls = (path) => fetchMock.mock.calls.filter(([url]) => url.endsWith(path))

describe('request', () => {
  it('sends the bearer token and cookies, and unwraps data and meta', async () => {
    fetchMock.mockResolvedValue(ok({ households: [] }))
    const res = await request('/households')
    expect(res).toEqual({ data: { households: [] }, meta: { requestId: 'r1' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/households')
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
    expect(init.headers.Authorization).toBe('Bearer old-token')
  })

  it('sends a JSON body and an idempotency key', async () => {
    fetchMock.mockResolvedValue(ok({}))
    await request('/x', { method: 'POST', body: { a: 1 }, idempotencyKey: 'key-12345678' })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': 'key-12345678' })
  })

  it('throws an ApiError with code, details and request id', async () => {
    fetchMock.mockResolvedValue(fail(400, 'VALIDATION_FAILED', { details: [{ field: 'name', message: 'Required' }] }))
    const err = await request('/x', { method: 'POST', body: {} }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', requestId: 'r2', details: [{ field: 'name', message: 'Required' }] })
  })

  it('copes with a non-JSON error body, taking the request id from the header', async () => {
    fetchMock.mockResolvedValue(reply(502, undefined, { 'x-request-id': 'hdr' }))
    const err = await request('/x', { method: 'POST' }).catch((e) => e)
    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN', requestId: 'hdr' })
    expect(err.message).toBe('Something went wrong. Try again.')
  })

  it('turns a network failure into a friendly ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const err = await request('/x', { method: 'POST' }).catch((e) => e)
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' })
    expect(err.message).not.toContain('fetch failed')
  })
})

describe('retries', () => {
  it('retries a GET up to three attempts when the server fails', async () => {
    fetchMock.mockResolvedValue(fail(503, 'INTERNAL'))
    await expect(request('/x')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('succeeds if a retry works', async () => {
    fetchMock.mockResolvedValueOnce(fail(500, 'INTERNAL')).mockResolvedValueOnce(ok({ fine: true }))
    expect((await request('/x')).data).toEqual({ fine: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never retries a 4xx', async () => {
    fetchMock.mockResolvedValue(fail(404, 'NOT_FOUND'))
    await expect(request('/x')).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never retries a write', async () => {
    fetchMock.mockResolvedValue(fail(500, 'INTERNAL'))
    await expect(request('/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('401 handling', () => {
  const refreshed = () => ok({ accessToken: 'new-token', expiresIn: 900 })

  it('refreshes once, then retries once with the new token', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/refresh')) return refreshed()
      return init.headers.Authorization === 'Bearer new-token' ? ok({ done: true }) : fail(401, 'UNAUTHENTICATED')
    })
    expect((await request('/households')).data).toEqual({ done: true })
    expect(calls('/auth/refresh')).toHaveLength(1)
    expect(calls('/households')).toHaveLength(2)
    expect(getAccessToken()).toBe('new-token')
    expect(calls('/auth/refresh')[0][1].headers['X-Evenly-Client']).toBe('web')
  })

  it('shares one refresh between simultaneous 401s', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/refresh')) { await gate; return refreshed() }
      return init.headers.Authorization === 'Bearer new-token' ? ok({}) : fail(401, 'UNAUTHENTICATED')
    })
    const all = Promise.all([1, 2, 3, 4, 5].map((i) => request(`/r${i}`)))
    await vi.waitFor(() => expect(calls('/auth/refresh')).toHaveLength(1))
    release()
    await all
    expect(calls('/auth/refresh')).toHaveLength(1)
  })

  it('signs the user out when the refresh fails, and gives back the original error', async () => {
    const out = vi.fn()
    onSignedOut(out)
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? fail(401, 'UNAUTHENTICATED') : fail(401, 'UNAUTHENTICATED')))
    await expect(request('/households')).rejects.toMatchObject({ status: 401 })
    expect(out).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBeNull()
  })

  it('does not refresh for a call made without credentials, such as a wrong password', async () => {
    fetchMock.mockResolvedValue(fail(401, 'INVALID_CREDENTIALS'))
    await expect(request('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(calls('/auth/refresh')).toHaveLength(0)
  })

  it('does not loop: a second 401 after the refresh is returned as an error', async () => {
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? refreshed() : fail(401, 'UNAUTHENTICATED')))
    await expect(request('/households')).rejects.toMatchObject({ status: 401 })
    expect(calls('/households')).toHaveLength(2)
    expect(calls('/auth/refresh')).toHaveLength(1)
  })
})
