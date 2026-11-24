import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Ship, MapPin, User, Package, Calendar, FileText, Loader2, Banknote, Building2, Hash } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useCompagnies, couleurCompagnie } from "@/lib/compagnies";
import { ListeConteneurs, LigneConteneur } from "@/components/ListeConteneurs";

export { TAILLES_CONTENEUR } from "@/components/ListeConteneurs";

// Taux de change vers XAF (approximatifs — à ajuster selon cours du jour)
const TAUX_CHANGE: Record<string, number> = {
  XAF: 1,
  EUR: 655.96,
  USD: 605,
};

const FOURNISSEURS_FREQUENTS = [
  "CHINA SHIPPING", "COSCO SHIPPING", "EVERGREEN", "HAPAG-LLOYD",
  "MEDITERRANEAN SHIPPING", "MAERSK LINE", "CMA CGM GROUP",
  "YANG MING", "ONE (Ocean Network Express)", "ZIM INTEGRATED",
  "BOLLORÉ LOGISTICS", "SDV CAMEROUN", "TRANSITEX", "DHL GLOBAL",
  "PANALPINA CAMEROUN", "GEODIS WILSON", "KUEHNE+NAGEL",
];

const NouveauDossierDialog = () => {
  const { actives: compagnies } = useCompagnies();
  const qc = useQueryClient();
  const user = getStoredUser();
  const [open, setOpen] = useState(false);
  const [diDevise, setDiDevise] = useState<"XAF" | "EUR" | "USD">("XAF");
  const [conteneurs, setConteneurs] = useState<LigneConteneur[]>([{ numero: "", taille: "" }]);
  const [form, setForm] = useState({
    client: "", compagnie: "", conteneur: "", nombreConteneurs: "1", tailleConteneur: "", marchandise: "",
    site: "Douala", dateArrivee: "", priorite: "moyenne",
    responsableId: "", notes: "",
    montantDI: "",
    fournisseur: "",
    numeroBL: "",
  });
  // DI obligatoire : DI existante (débit sur son solde restant) ou nouvelle DI ouverte avec le dossier
  const [modeDI, setModeDI] = useState<"existante" | "nouvelle">("existante");
  const [diId, setDiId] = useState("");
  const [numeroNouvelleDI, setNumeroNouvelleDI] = useState("");
  const [montantFacture, setMontantFacture] = useState("");
  const [referenceFacture, setReferenceFacture] = useState("");
  const { data: disData } = useQuery({
    queryKey: ["di-actives-creation"],
    queryFn: () => api.get<any>("/api/di?limit=100&statut=actif"),
    enabled: open,
    staleTime: 30_000,
  });
  const disActives: any[] = disData?.data ?? [];
  const diSelectionnee = disActives.find(d => d.id === diId);
  const facture = Math.round(Number(montantFacture) || 0);
  const soldeAvant = modeDI === "existante" ? (diSelectionnee ? Number(diSelectionnee.soldeNum ?? diSelectionnee.soldeActuel) : null) : montantEnXAFNouvelle();
  function montantEnXAFNouvelle() { return form.montantDI ? Math.round(parseFloat(form.montantDI) * TAUX_CHANGE[diDevise]) : null; }
  const soldeApres = soldeAvant !== null ? soldeAvant - facture : null;

  const montantEnXAF = form.montantDI
    ? Math.round(parseFloat(form.montantDI) * TAUX_CHANGE[diDevise])
    : 0;

  const canCreate = can(user, "permDossier", "partiel");

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["employes-actifs"],
    queryFn: () => api.get<any>("/api/employes?limit=100&actif=true"),
    staleTime: 5 * 60_000,
    enabled: canCreate && open,
  });
  const employes: any[] = empData?.data ?? [];

  const createDossier = useMutation({
    mutationFn: async (payload: any) => {
      const dossier = await api.post<any>("/api/dossiers", payload);
      return dossier;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      toast({ title: "Dossier créé", description: `${res.numero} — ${res.client} · facture débitée sur sa DI` });
      qc.invalidateQueries({ queryKey: ["di-list"] });
      qc.invalidateQueries({ queryKey: ["di-actives-creation"] });
      setDiId(""); setNumeroNouvelleDI(""); setMontantFacture(""); setReferenceFacture(""); setModeDI("existante");
      setOpen(false);
      setDiDevise("XAF");
      setConteneurs([{ numero: "", taille: "" }]);
      setForm({ client: "", compagnie: "", conteneur: "", nombreConteneurs: "1", tailleConteneur: "", marchandise: "", site: "Douala", dateArrivee: "", priorite: "moyenne", responsableId: "", notes: "", montantDI: "", fournisseur: "", numeroBL: "" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message ?? "Création échouée", variant: "destructive" });
    },
  });

  // Bouton masqué pour les comptes en lecture seule (après les hooks : ordre des hooks constant)
  if (!canCreate) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tcs = conteneurs.map(c => ({ numero: c.numero.trim(), taille: c.taille })).filter(c => c.numero);
    if (!form.client || !form.compagnie || tcs.length === 0 || !form.marchandise || !form.dateArrivee) {
      toast({ title: "Champs requis", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }
    if (modeDI === "existante" ? !diId : (numeroNouvelleDI.trim().length < 3 || !(montantEnXAF > 0))) {
      toast({ title: "DI requise", description: "Chaque dossier doit être rattaché à une DI (existante ou nouvelle).", variant: "destructive" });
      return;
    }
    if (!(facture > 0)) {
      toast({ title: "Montant requis", description: "Indiquez le montant de la facture fournisseur à débiter sur la DI.", variant: "destructive" });
      return;
    }
    if (soldeApres !== null && soldeApres < 0) {
      toast({ title: "Solde de la DI insuffisant", description: `Il reste ${(soldeAvant ?? 0).toLocaleString("fr-FR")} FCFA sur la DI.`, variant: "destructive" });
      return;
    }
    createDossier.mutate({
      client:        form.client,
      compagnie:     form.compagnie,
      conteneurs:    tcs,
      marchandise:   form.marchandise,
      site:          form.site,
      responsableId: form.responsableId && form.responsableId !== "__auto__" ? form.responsableId : undefined,
      dateArrivee:   new Date(form.dateArrivee).toISOString(),
      priorite:      form.priorite,
      notes:         form.notes || undefined,
      fournisseur:   form.fournisseur || undefined,
      numeroBL:      form.numeroBL || undefined,
      ...(modeDI === "existante"
        ? { diId }
        : { nouvelleDI: { numero: numeroNouvelleDI.trim(), montant: montantEnXAF, devise: "XAF" } }),
      montantFacture: facture,
      referenceFacture: referenceFacture.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground font-display font-semibold gap-2 hover:opacity-90">
          <Plus className="w-4 h-4" /> Nouveau dossier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Créer un nouveau dossier</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" /> Client *
              </Label>
              <Input placeholder="Nom du client" value={form.client} onChange={e => setForm({...form, client: e.target.value})} className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Ship className="w-3.5 h-3.5 text-muted-foreground" /> Compagnie maritime *
              </Label>
              <Select value={form.compagnie} onValueChange={v => setForm({...form, compagnie: v})}>
                <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {compagnies.map(c => <SelectItem key={c.code} value={c.code}>{c.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-muted-foreground" /> Type de marchandise *
            </Label>
            <Input placeholder="Ex: Matériaux de construction" value={form.marchandise} onChange={e => setForm({...form, marchandise: e.target.value})} className="bg-muted/50" />
          </div>

          <ListeConteneurs lignes={conteneurs} onChange={setConteneurs} />

          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" /> N° de BL — Bill of Lading (optionnel)
            </Label>
            <Input
              placeholder="Ex: MSC123456789"
              value={form.numeroBL}
              onChange={e => setForm({...form, numeroBL: e.target.value})}
              className="bg-muted/50 font-mono"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Site
              </Label>
              <Select value={form.site} onValueChange={v => setForm({...form, site: v})}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Douala">Douala</SelectItem>
                  <SelectItem value="Kribi">Kribi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Arrivée estimée *
              </Label>
              <Input type="date" value={form.dateArrivee} onChange={e => setForm({...form, dateArrivee: e.target.value})} className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Priorité</Label>
              <Select value={form.priorite} onValueChange={v => setForm({...form, priorite: v})}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="haute">Haute</SelectItem>
                  <SelectItem value="moyenne">Moyenne</SelectItem>
                  <SelectItem value="basse">Basse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground leading-snug">
              Les tâches de chaque étape sont attribuées automatiquement aux comptes concernés (selon le rôle, le site et la compagnie).
            </p>
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" /> Responsable de la réception
            </Label>
            <Select value={form.responsableId} onValueChange={v => setForm({...form, responsableId: v})}>
              <SelectTrigger className="bg-muted/50">
                {empLoading
                  ? <span className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement...</span>
                  : <SelectValue placeholder="Attribution automatique (Service administratif)" />
                }
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Attribution automatique selon les rôles</SelectItem>
                {employes.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="font-medium">{e.nom}</span>
                    <span className="text-muted-foreground ml-1">— {e.role}</span>
                  </SelectItem>
                ))}
                {employes.length === 0 && !empLoading && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Aucun employé disponible</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Fournisseur */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Fournisseur (optionnel)
            </Label>
            <div className="flex gap-2">
              <Input
                list="fournisseurs-list"
                placeholder="Ex : CHINA SHIPPING, MSC..."
                value={form.fournisseur}
                onChange={e => setForm({...form, fournisseur: e.target.value})}
                className="bg-muted/50 flex-1"
              />
              <datalist id="fournisseurs-list">
                {FOURNISSEURS_FREQUENTS.map(f => <option key={f} value={f} />)}
              </datalist>
            </div>
          </div>

          {/* DI obligatoire : la facture fournisseur du dossier est débitée sur le solde restant */}
          <div className="rounded-xl border border-secondary/40 bg-secondary/5 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-secondary flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" /> DI — Déclaration d'Importation *
              </Label>
              <div className="inline-flex rounded-lg bg-muted p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="DI du dossier">
                {([["existante", "DI existante"], ["nouvelle", "Nouvelle DI"]] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={modeDI === v} onClick={() => setModeDI(v)}
                    className={`px-2.5 py-1 rounded-md ${modeDI === v ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
            </div>
            {modeDI === "existante" ? (
              <Select value={diId} onValueChange={setDiId}>
                <SelectTrigger className="bg-card" aria-label="DI existante"><SelectValue placeholder="Choisir la DI du dossier…" /></SelectTrigger>
                <SelectContent>
                  {disActives.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.numero} — {d.client} · reste {Math.round(Number(d.soldeNum ?? d.soldeActuel)).toLocaleString("fr-FR")} FCFA{d._count?.dossiers ? ` · ${d._count.dossiers} dossier(s)` : ""}
                    </SelectItem>
                  ))}
                  {disActives.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Aucune DI active : créez-en une nouvelle.</div>}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2">
                <Input placeholder="N° de la DI" value={numeroNouvelleDI} onChange={e => setNumeroNouvelleDI(e.target.value)} className="bg-card font-mono" aria-label="Numéro de la nouvelle DI" />
                <Select value={diDevise} onValueChange={(v: any) => setDiDevise(v)}>
                  <SelectTrigger className="bg-card w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XAF">FCFA</SelectItem>
                    <SelectItem value="EUR">EUR €</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" min={1} placeholder="Montant de la DI" value={form.montantDI} onChange={e => setForm({...form, montantDI: e.target.value})} className="bg-card font-mono" aria-label="Montant de la nouvelle DI" />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Montant de la facture fournisseur (FCFA) *</Label>
                <Input type="number" min={1} value={montantFacture} onChange={e => setMontantFacture(e.target.value)} placeholder="Ex : 12 500 000" className="bg-card font-mono" aria-label="Montant de la facture fournisseur" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">N° de la facture fournisseur</Label>
                <Input value={referenceFacture} onChange={e => setReferenceFacture(e.target.value)} placeholder="Ex : PI-2026-0042" className="bg-card" />
              </div>
            </div>
            {soldeAvant !== null && (
              <p className={`text-[11px] font-semibold ${soldeApres !== null && soldeApres < 0 ? "text-destructive" : "text-secondary"}`}>
                Solde de la DI : {soldeAvant.toLocaleString("fr-FR")} FCFA
                {facture > 0 && soldeApres !== null && <> → après débit : {soldeApres.toLocaleString("fr-FR")} FCFA{soldeApres < 0 ? " (insuffisant)" : ""}</>}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground leading-tight">
              Le dossier débite uniquement sa DI. Si la DI a déjà servi à d'autres dossiers, la facture est débitée sur le montant qui reste.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Notes (optionnel)</Label>
            <Textarea placeholder="Informations complémentaires..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="bg-muted/50 h-20" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" className="bg-primary text-primary-foreground gap-2" disabled={createDossier.isPending}>
              {createDossier.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Création...</> : "Créer le dossier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NouveauDossierDialog;
