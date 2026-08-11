// En production, pointer vers le backend déployé via VITE_API_BASE_URL
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

// ── Token management ─────────────────────────────────────────

export function getAccessToken() {
  return localStorage.getItem('ft_access_token')
}

function setTokens(access: string, refresh?: string) {
  localStorage.setItem('ft_access_token', access)
  if (refresh) localStorage.setItem('ft_refresh_token', refresh)
}

export function clearTokens() {
  localStorage.removeItem('ft_access_token')
  localStorage.removeItem('ft_refresh_token')
  localStorage.removeItem('ft_user')
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem('ft_refresh_token')
  if (!rt) return false
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setTokens(data.accessToken, data.refreshToken)
    return true
  } catch {
    return false
  }
}

// ── Core fetch ───────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch(path, options)
    clearTokens()
    window.location.href = '/'
    throw new Error('SESSION_EXPIRED')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) return undefined as T

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return undefined as T
  }

  if (!res.ok) throw new Error(data?.message ?? `Erreur ${res.status}`)
  return data
}

// ── HTTP verbs ───────────────────────────────────────────────

export const api = {
  get:    <T>(path: string)                   => apiFetch<T>(path),
  post:   <T>(path: string, body?: unknown)   => apiFetch<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown)   => apiFetch<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body?: unknown)   => apiFetch<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)                   => apiFetch<T>(path, { method: 'DELETE' }),
}

// ── Auth calls ───────────────────────────────────────────────

export interface LoginResponse {
  accessToken:  string
  refreshToken: string
  user: AuthUser
}

export interface AuthUser {
  id:                  string
  email:               string
  nom:                 string
  role:                string
  profil:              string
  site:                string
  telephone?:          string
  avatarUrl?:          string
  permDossier:         string
  permValidation:      string
  permFinancier:       string
  permRapports:        string
  permAdministration:  string
  compagniesAssignees: string[]
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<LoginResponse>('/api/auth/login', { email, password })
  setTokens(data.accessToken, data.refreshToken)
  localStorage.setItem('ft_user', JSON.stringify(data.user))
  return data.user
}

export async function logout() {
  try { await api.post('/api/auth/logout') } catch { /* ignore */ }
  clearTokens()
  window.location.href = '/'
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('ft_user')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

export async function uploadFile<T = unknown>(path: string, formData: FormData): Promise<T> {
  const token = getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: formData })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) return uploadFile(path, formData)
    clearTokens()
    window.location.href = '/'
    throw new Error('SESSION_EXPIRED')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) return undefined as T

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return undefined as T
  }

  if (!res.ok) throw new Error(data?.message ?? `Erreur ${res.status}`)
  return data
}
