import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, uploadFile } from '@/lib/api'

export type SousEtapeStatut = 'todo' | 'en_cours' | 'valide' | 'rejete'

export interface SousEtape {
  id:            string
  dossierId:     string
  etape:         string
  cle:           string
  statut:        SousEtapeStatut
  responsableId: string | null
  deadline:      string | null
  completedAt:   string | null
  completedById: string | null
  notes:         string | null
  metadata:      Record<string, unknown> | null
  createdAt:     string
  updatedAt:     string
  responsable?: {
    id:       string
    nom:      string
    profil:   string
    role:     string
    avatarUrl?: string | null
  } | null
  completedBy?: { id: string; nom: string } | null
}

export interface UpdateSousEtapeInput {
  statut?:        SousEtapeStatut
  responsableId?: string | null
  deadline?:      string | null
  notes?:         string | null
  metadata?:      Record<string, unknown>
}

export function useSousEtapes(dossierId: string) {
  const qc  = useQueryClient()
  const key = ['sous-etapes', dossierId]

  const query = useQuery<SousEtape[]>({
    queryKey: key,
    queryFn:  () => api.get<SousEtape[]>(`/api/dossiers/${dossierId}/sous-etapes`),
    enabled:  !!dossierId,
    staleTime: 30_000,
  })

  const update = useMutation({
    mutationFn: ({ etape, cle, data }: { etape: string; cle: string; data: UpdateSousEtapeInput }) =>
      api.put<SousEtape>(`/api/dossiers/${dossierId}/sous-etapes/${etape}/${cle}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const uploadPreuve = useMutation({
    mutationFn: ({ etape, cle, file }: { etape: string; cle: string; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return uploadFile<SousEtape>(`/api/dossiers/${dossierId}/sous-etapes/${etape}/${cle}/preuve`, fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const byEtape = (etape: string): SousEtape[] =>
    (query.data ?? []).filter(s => s.etape === etape)

  const allValidated = (etape: string, total: number): boolean => {
    const rows = byEtape(etape)
    const done = rows.filter(r => r.statut === 'valide').length
    return done >= total
  }

  return { query, update, uploadPreuve, byEtape, allValidated }
}
