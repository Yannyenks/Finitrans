import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export type DIAlerteNiveau = "ok" | "warning" | "critical";

export interface DIEnriched {
  id:            string;
  numero:        string;
  client:        string;
  devise:        string;
  statut:        "actif" | "cloture" | "suspendu";
  montant:       string;
  soldeActuel:   string;
  seuilAlerte1:  number;
  seuilAlerte2:  number;
  montantNum:    number;
  soldeNum:      number;
  utiliseNum:    number;
  tauxRestant:   number;
  tauxUtilise:   number;
  alerte1:       boolean;
  alerte2:       boolean;
  alerteNiveau:  DIAlerteNiveau;
  gestionnaire?: { nom: string };
  mouvements?:   DIMovement[];
  dossiers?:     any[];
  createdAt:     string;
  dateExpiration?: string;
}

export interface DIMovement {
  id:         string;
  type:       "credit" | "debit";
  categorie:  string;
  montant:    string;
  motif:      string;
  createdAt:  string;
  auteur?:    { nom: string };
  dossier?:   { numero: string; client: string };
}

export interface DICreateInput {
  numero:          string;
  client:          string;
  montant:         number;
  devise?:         string;
  compagnie?:      "MSC" | "COSCO" | "MAERSK" | "CMA_CGM";
  dateEmission:    string;
  dateExpiration?: string;
  seuilAlerte1?:   number;
  seuilAlerte2?:   number;
  notes?:          string;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useDI(diId: string | null | undefined) {
  const qc = useQueryClient();

  const { data: di, isLoading, error } = useQuery<DIEnriched>({
    queryKey:  ["di", diId],
    queryFn:   () => api.get<DIEnriched>(`/api/di/${diId}`),
    enabled:   !!diId,
    staleTime: 15_000,
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<any>({
    queryKey:  ["di-dashboard", diId],
    queryFn:   () => api.get<any>(`/api/di/${diId}/tableau-de-bord`),
    enabled:   !!diId,
    staleTime: 15_000,
  });

  // ── Décrémenter (débit) ──────────────────────────────────────
  const decrement = useMutation({
    mutationFn: ({
      montant, motif, dossierId, categorie, referenceFacture,
    }: {
      montant: number; motif: string; dossierId?: string; referenceFacture?: string;
      categorie?: "droits_douane" | "tva" | "honoraires" | "redevances" | "penalites" | "frais_divers";
    }) =>
      api.post<any>(`/api/di/${diId}/mouvements`, {
        type: "debit",
        montant,
        motif,
        dossierId,
        referenceFacture,
        categorie: categorie ?? "frais_divers",
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["di", diId] });
      qc.invalidateQueries({ queryKey: ["di-dashboard", diId] });
      qc.invalidateQueries({ queryKey: ["di-list"] });
      const niveau = data?.di?.alerteNiveau ?? "ok";
      if (niveau === "critical") {
        toast({
          title:       "🔴 Solde DI critique",
          description: `Solde restant : ${Number(data.di?.soldeActuel).toLocaleString("fr-FR")} FCFA — moins de ${data.di?.seuilAlerte2}% disponible`,
          variant:     "destructive",
        });
      } else if (niveau === "warning") {
        toast({
          title:       "⚠️ Solde DI faible",
          description: `Solde restant : ${Number(data.di?.soldeActuel).toLocaleString("fr-FR")} FCFA — moins de ${data.di?.seuilAlerte1}% disponible`,
        });
      } else {
        toast({
          title:       "DI débitée",
          description: `Nouveau solde : ${Number(data.di?.soldeActuel).toLocaleString("fr-FR")} FCFA`,
        });
      }
    },
    onError: (err: any) => {
      const isDuplicate = err.message?.includes("déjà été enregistrée") || err.message?.includes("FACTURE_DUPLIQUEE");
      toast({
        title:       isDuplicate ? "Facture déjà enregistrée" : "Solde insuffisant ou erreur DI",
        description: err.message ?? "Opération impossible",
        variant:     "destructive",
      });
    },
  });

  // ── Ajustement / recharge ────────────────────────────────────
  const recharge = useMutation({
    mutationFn: ({ montant, motif }: { montant: number; motif: string }) =>
      api.post<any>(`/api/di/${diId}/recharge`, { montant, motif }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["di", diId] });
      qc.invalidateQueries({ queryKey: ["di-dashboard", diId] });
      qc.invalidateQueries({ queryKey: ["di-list"] });
      toast({
        title:       "DI rechargée",
        description: `Nouveau solde : ${Number(data.soldeActuel).toLocaleString("fr-FR")} FCFA`,
      });
    },
    onError: (err: any) =>
      toast({ title: "Erreur recharge", description: err.message, variant: "destructive" }),
  });

  // ── Crédit manuel ────────────────────────────────────────────
  const credit = useMutation({
    mutationFn: ({ montant, motif, categorie }: { montant: number; motif: string; categorie?: string }) =>
      api.post<any>(`/api/di/${diId}/mouvements`, {
        type: "credit",
        montant,
        motif,
        categorie: categorie ?? "remboursement",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["di", diId] });
      qc.invalidateQueries({ queryKey: ["di-dashboard", diId] });
      toast({ title: "Crédit enregistré sur la DI" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  // ── Lier un dossier ──────────────────────────────────────────
  const lierDossier = useMutation({
    mutationFn: (dossierId: string) =>
      api.post<any>(`/api/di/${diId}/lier-dossier`, { dossierId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["di", diId] });
      qc.invalidateQueries({ queryKey: ["di-dashboard", diId] });
      toast({ title: "Dossier lié à la DI" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur liaison", description: err.message, variant: "destructive" }),
  });

  // ── Mettre à jour les seuils ─────────────────────────────────
  const updateSeuils = useMutation({
    mutationFn: ({ seuilAlerte1, seuilAlerte2 }: { seuilAlerte1: number; seuilAlerte2: number }) =>
      api.patch<any>(`/api/di/${diId}/alertes`, { seuilAlerte1, seuilAlerte2 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["di", diId] });
      toast({ title: "Seuils d'alerte mis à jour" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return {
    di,
    dashboard,
    isLoading,
    dashboardLoading,
    error,
    decrement,
    recharge,
    credit,
    lierDossier,
    updateSeuils,
  };
}

// ── Hook liste DI ────────────────────────────────────────────────────────────

export function useDIList(params?: {
  page?: number; limit?: number; statut?: string;
  client?: string; compagnie?: string; alerte?: boolean;
}) {
  const search = new URLSearchParams();
  if (params?.page)      search.set("page",      String(params.page));
  if (params?.limit)     search.set("limit",      String(params.limit));
  if (params?.statut)    search.set("statut",     params.statut);
  if (params?.client)    search.set("client",     params.client);
  if (params?.compagnie) search.set("compagnie",  params.compagnie);
  if (params?.alerte !== undefined) search.set("alerte", String(params.alerte));

  return useQuery<{ data: DIEnriched[]; meta: { total: number; page: number; limit: number; totalPages: number } }>({
    queryKey:  ["di-list", params],
    queryFn:   () => api.get(`/api/di?${search.toString()}`),
    staleTime: 15_000,
  });
}

// ── Hook stats DI ────────────────────────────────────────────────────────────

export function useDIStats() {
  return useQuery<any>({
    queryKey: ["di-stats-resume"],
    queryFn:  () => api.get("/api/di/stats/resume"),
    staleTime: 30_000,
  });
}

// ── Hook mise à jour DI ──────────────────────────────────────────────────────

export function useDIUpdate(diId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<DIEnriched>(`/api/di/${diId}`, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["di", diId] });
      qc.invalidateQueries({ queryKey: ["di-list"] });
      qc.invalidateQueries({ queryKey: ["di-stats-resume"] });
      qc.invalidateQueries({ queryKey: ["di-stats"] });
      toast({ title: "DI modifiée", description: `${data.numero}` });
    },
    onError: (err: any) =>
      toast({ title: "Erreur modification DI", description: err.message, variant: "destructive" }),
  });
}

// ── Hook suppression DI ──────────────────────────────────────────────────────

export function useDIDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (diId: string) => api.delete<void>(`/api/di/${diId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["di-list"] });
      qc.invalidateQueries({ queryKey: ["di-stats-resume"] });
      qc.invalidateQueries({ queryKey: ["di-stats"] });
      toast({ title: "DI supprimée avec succès" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur suppression DI", description: err.message, variant: "destructive" }),
  });
}

// ── Hook création DI ─────────────────────────────────────────────────────────

export function useDICreate() {
  const qc = useQueryClient();
  return useMutation<DIEnriched, Error, DICreateInput>({
    mutationFn: (body) => api.post<DIEnriched>("/api/di", body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["di-list"] });
      qc.invalidateQueries({ queryKey: ["di-stats-resume"] });
      toast({ title: "DI créée", description: `${data.numero} — ${data.client}` });
    },
    onError: (err: any) =>
      toast({ title: "Erreur création DI", description: err.message, variant: "destructive" }),
  });
}
