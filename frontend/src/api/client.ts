// One typed client for the whole app. The access token lives in this module's
// memory only: never localStorage or sessionStorage.

export interface User {
  id: string
  email: string
}

export interface Endpoint {
  id: string
  url: string
  createdAt: string
  expiresAt: string
  owned: boolean
}

export interface CapturedRequest {
  // BIGSERIAL arrives as a string from the backend.
  id: string
  method: string
  query: unknown
  headers: unknown
  body: string | null
  contentType: string | null
  ip: string | null
  sizeBytes: number
  createdAt: string
}

export interface HistoryPage {
  requests: CapturedRequest[]
  nextBefore: string | null
}

interface AuthResponse {
  accessToken: string
  user: User
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.'
}

let accessToken: string | null = null
let refreshPromise: Promise<AuthResponse> | null = null
let sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || 'request failed'
  try {
    const data: unknown = await response.json()
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const value = (data as { error?: unknown }).error
      if (typeof value === 'string') {
        message = value
      }
    }
  } catch {
    // The body was not JSON; the status text is the best message we have.
  }
  return new ApiError(response.status, message)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  return (await response.json()) as T
}

// Two parallel requests can both get a 401. They must share one refresh call,
// otherwise the second rotation sees a revoked token and ends the session.
export function refresh(): Promise<AuthResponse> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await toApiError(response)
        }
        const data = (await response.json()) as AuthResponse
        accessToken = data.accessToken
        return data
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, init)
  } catch (error) {
    // Only an existing session can be refreshed. A 401 from login is a real
    // "wrong password", not an expired token.
    if (!(error instanceof ApiError) || error.status !== 401 || accessToken === null) {
      throw error
    }

    try {
      await refresh()
    } catch {
      accessToken = null
      sessionExpiredHandler?.()
      throw error
    }

    try {
      return await request<T>(path, init)
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        accessToken = null
        sessionExpiredHandler?.()
      }
      throw retryError
    }
  }
}

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const data = await api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  accessToken = data.accessToken
  return data
}

export async function registerRequest(email: string, password: string): Promise<User> {
  const data = await api<{ user: User }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return data.user
}

export async function logoutRequest(): Promise<void> {
  try {
    await api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
  } finally {
    accessToken = null
  }
}

export function createEndpoint(): Promise<Endpoint> {
  return api<Endpoint>('/api/endpoints', { method: 'POST' })
}

export function getEndpoint(id: string): Promise<Endpoint> {
  return api<Endpoint>(`/api/endpoints/${encodeURIComponent(id)}`)
}

export function listMyEndpoints(): Promise<{ endpoints: Endpoint[] }> {
  return api<{ endpoints: Endpoint[] }>('/api/me/endpoints')
}

export function deleteEndpoint(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/endpoints/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function getRequests(
  id: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<HistoryPage> {
  const search = new URLSearchParams()
  search.set('limit', String(options.limit ?? 50))
  if (options.before) {
    search.set('before', options.before)
  }
  return api<HistoryPage>(
    `/api/endpoints/${encodeURIComponent(id)}/requests?${search.toString()}`,
  )
}

export function clearRequests(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/endpoints/${encodeURIComponent(id)}/requests`, {
    method: 'DELETE',
  })
}

export function createStreamTicket(id: string): Promise<{ ticket: string; expiresIn: number }> {
  return api<{ ticket: string; expiresIn: number }>(
    `/api/endpoints/${encodeURIComponent(id)}/stream-ticket`,
    { method: 'POST' },
  )
}
