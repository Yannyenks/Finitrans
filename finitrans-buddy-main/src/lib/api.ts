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

// 'ok'           = refresh réussi
// 'invalid'      = token invalide/révoqué → déconnecter
// 'server_error' = problème serveur transitoire (5xx/réseau) → garder la session
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
      if (data.user) storeUser(data.user)
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

// Un seul refresh à la fois, même si plusieurs requêtes reçoivent 401 simultanément
let refreshing: Promise<'ok' | 'invalid' | 'server_error'> | null = null
function refreshOnce() {
  if (!refreshing) refreshing = tryRefresh().finally(() => { refreshing = null })
  return refreshing
}

function sessionExpired(): never {
  clearTokens()
  window.location.href = '/'
  throw new Error('SESSION_EXPIRED')
}

/** Requête authentifiée brute (gère le renouvellement du jeton). */
async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  if (res.status !== 401) return res

  const result = await refreshOnce()
  if (result === 'ok') {
    const retryHeaders = new Headers(init.headers)
    retryHeaders.set('Authorization', `Bearer ${getAccessToken()}`)
    return fetch(`${BASE_URL}${path}`, { ...init, headers: retryHeaders })
  }
  if (result === 'invalid') sessionExpired()
  throw new Error('Erreur serveur temporaire — réessayez')
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) sessionExpired()
  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) {
    if (!res.ok) throw new ApiError(`Erreur ${res.status}`, res.status)
    return undefined as T
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    if (!res.ok) throw new ApiError(`Erreur ${res.status}`, res.status)
    return text as unknown as T
  }

  if (!res.ok) throw new ApiError(data?.message ?? `Erreur ${res.status}`, res.status, data?.error)
  return data
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Core fetch ───────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await authFetch(path, { ...options, headers })
  return parseResponse<T>(res)
}

// ── HTTP verbs ───────────────────────────────────────────────

export const api = {
  get:    <T>(path: string)                   => apiFetch<T>(path),
  post:   <T>(path: string, body?: unknown)   => apiFetch<T>(path, { method: 'POST',   body: JSON.stringify(body ?? {}) }),
  patch:  <T>(path: string, body?: unknown)   => apiFetch<T>(path, { method: 'PATCH',  body: JSON.stringify(body ?? {}) }),
  put:    <T>(path: string, body?: unknown)   => apiFetch<T>(path, { method: 'PUT',    body: JSON.stringify(body ?? {}) }),
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
  profilLabel?:        string
  site:                string
  telephone?:          string
  avatarUrl?:          string
  permDossier:         string
  permValidation:      string
  permFinancier:       string
  permRapports:        string
  permAdministration:  string
  compagniesAssignees: string[]
  superviseur?:        boolean
  modules?:            string[]
}

const USER_EVENT = 'ft-user-updated'

function storeUser(user: AuthUser) {
  localStorage.setItem('ft_user', JSON.stringify(user))
  window.dispatchEvent(new Event(USER_EVENT))
}

export function onUserChange(cb: () => void) {
  window.addEventListener(USER_EVENT, cb)
  return () => window.removeEventListener(USER_EVENT, cb)
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<LoginResponse>('/api/auth/login', { email, password })
  setTokens(data.accessToken, data.refreshToken)
  storeUser(data.user)
  return data.user
}

/** Recharge le profil (rôle, modules) depuis le serveur — après une attribution de rôle. */
export async function refreshSessionUser(): Promise<AuthUser | null> {
  if (!getAccessToken()) return null
  try {
    const user = await api.get<AuthUser>('/api/auth/me')
    if (user) storeUser(user)
    return user
  } catch {
    return getStoredUser()
  }
}

export async function logout() {
  const refreshToken = localStorage.getItem('ft_refresh_token') ?? undefined
  try { await api.post('/api/auth/logout', { refreshToken }) } catch { /* ignore */ }
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
  const res = await authFetch(path, { method: 'POST', body: formData })
  return parseResponse<T>(res)
}

// ── Documents protégés (nécessitent le jeton) ────────────────

export async function fetchBlob(path: string): Promise<Blob> {
  const res = await authFetch(path)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `Erreur ${res.status}`
    try { message = JSON.parse(text).message ?? message } catch { /* texte brut */ }
    throw new ApiError(message, res.status)
  }
  return res.blob()
}

/** Ouvre un document protégé dans un nouvel onglet. */
export async function openDocument(path: string) {
  // Ouvrir l'onglet tout de suite (sinon bloqué par le navigateur après un await)
  const win = window.open('', '_blank')
  try {
    const blob = await fetchBlob(path)
    const url = URL.createObjectURL(blob)
    if (win) win.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    win?.close()
    throw err
  }
}

/** Télécharge un fichier protégé (CSV, export…) avec un nom donné. */
export async function downloadFile(path: string, filename: string) {
  const blob = await fetchBlob(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
