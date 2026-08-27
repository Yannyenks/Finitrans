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

// null  = refresh réussi
// true  = refresh échoué car token invalide/révoqué → déconnecter
// false = refresh échoué pour raison serveur (5xx/réseau) → garder la session
async function tryRefresh(): Promise<'ok' | 'invalid' | 'server_error'> {
  const rt = localStorage.getItem('ft_refresh_token')
  if (!rt) return 'invalid'
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })
    if (res.ok) {
      const data = await res.json()
      setTokens(data.accessToken, data.refreshToken)
      return 'ok'
    }
    // 401 = token révoqué ou expiré → vraie déconnexion
    if (res.status === 401) return 'invalid'
    // 5xx ou autre = problème serveur transitoire → ne pas déconnecter
    return 'server_error'
  } catch {
    // Réseau coupé, timeout → ne pas déconnecter
    return 'server_error'
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
    const result = await tryRefresh()
    if (result === 'ok') return apiFetch(path, options)
    if (result === 'invalid') {
      clearTokens()
      window.location.href = '/'
      throw new Error('SESSION_EXPIRED')
    }
    // server_error → on laisse l'erreur remonter sans déconnecter
    throw new Error('Erreur serveur temporaire — réessayez')
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
    const result = await tryRefresh()
    if (result === 'ok') return uploadFile(path, formData)
    if (result === 'invalid') {
      clearTokens()
      window.location.href = '/'
      throw new Error('SESSION_EXPIRED')
    }
    throw new Error('Erreur serveur temporaire — réessayez')
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
