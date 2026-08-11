import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Ship, MapPin, User, Package, Calendar, FileText, Loader2, Banknote } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";

const COMPAGNIE_MAP: Record<string, string> = {
  MSC: "MSC", COSCO: "COSCO", MAERSK: "MAERSK", CMA_CGM: "CMA-CGM",
};

const NouveauDossierDialog = () => {
  const qc = useQueryClient();
  const user = getStoredUser();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client: "", compagnie: "", conteneur: "", marchandise: "",
    site: "Douala", dateArrivee: "", priorite: "moyenne",
    responsableId: "", notes: "",
    montantDI: "",
  });

  // Don't render the button if user can only read
  const canCreate = user?.permDossier === "complet" || user?.permDossier === "partiel";
  if (!canCreate) return null;

  // Pre-fetch at component mount so data is ready when dialog opens
  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["employes-list"],
    queryFn: () => api.get<any>("/api/employes?limit=50&actif=true"),
    staleTime: 5 * 60_000,
  });
  const employes: any[] = empData?.data ?? [];

  const createDossier = useMutation({
    mutationFn: async (payload: any) => {
      const dossier = await api.post<any>("/api/dossiers", payload);
      // Si un montant DI a été saisi, créer la DI et la lier immédiatement
      if (payload.montantDI) {
        try {
          const di = await api.post<any>("/api/di", {
            numero:       `DI-${dossier.numero}`,
            client:       dossier.client,
            montant:      payload.montantDI,
            devise:       "XAF",
            compagnie:    dossier.compagnie,
            dateEmission: new Date().toISOString(),
          });
          await api.post(`/api/di/${di.id}/lier-dossier`, { dossierId: dossier.id });
        } catch {
          // DI non bloquante — le dossier est créé même si la DI échoue
          toast({ title: "Dossier créé", description: "La DI n'a pas pu être liée, à compléter depuis le dossier." });
        }
      }
      return dossier;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      toast({ title: "Dossier créé", description: `${res.numero} — ${res.client}${form.montantDI ? ` · DI ${Number(form.montantDI).toLocaleString("fr-FR")} FCFA` : ""}` });
      setOpen(false);
      setForm({ client: "", compagnie: "", conteneur: "", marchandise: "", site: "Douala", dateArrivee: "", priorite: "moyenne", responsableId: "", notes: "", montantDI: "" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message ?? "Création échouée", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client || !form.compagnie || !form.conteneur || !form.marchandise || !form.responsableId || !form.dateArrivee) {
      toast({ title: "Champs requis", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }
    createDossier.mutate({
      client:        form.client,
      compagnie:     form.compagnie,
      conteneur:     form.conteneur,
      marchandise:   form.marchandise,
      site:          form.site,
      responsableId: form.responsableId,
      dateArrivee:   new Date(form.dateArrivee).toISOString(),
      priorite:      form.priorite,
      notes:         form.notes || undefined,
      montantDI:     form.montantDI ? parseFloat(form.montantDI) : undefined,
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
                  {Object.entries(COMPAGNIE_MAP).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" /> N° Conteneur *
              </Label>
              <Input placeholder="Ex: MSCU7654321" value={form.conteneur} onChange={e => setForm({...form, conteneur: e.target.value})} className="bg-muted/50 font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-muted-foreground" /> Type de marchandise *
              </Label>
              <Input placeholder="Ex: Matériaux de construction" value={form.marchandise} onChange={e => setForm({...form, marchandise: e.target.value})} className="bg-muted/50" />
            </div>
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
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" /> Responsable *
            </Label>
            <Select value={form.responsableId} onValueChange={v => setForm({...form, responsableId: v})}>
              <SelectTrigger className="bg-muted/50">
                {empLoading
                  ? <span className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement...</span>
                  : <SelectValue placeholder="Assigner un responsable..." />
                }
              </SelectTrigger>
              <SelectContent>
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

          {/* Montant DI */}
          <div className="rounded-xl border border-dashed border-secondary/40 bg-secondary/5 p-4 space-y-2">
            <Label className="text-xs font-semibold text-secondary flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" /> Montant DI — Déclaration d'Importation (optionnel)
            </Label>
            <Input
              type="number"
              min={1}
              placeholder="Ex : 45 000 000"
              value={form.montantDI}
              onChange={e => setForm({...form, montantDI: e.target.value})}
              className="bg-card h-9 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground leading-tight">
              Budget enveloppe autorisé pour ce dossier (FCFA). Une alerte sera déclenchée à 20% restant.
              Ce montant peut être ajusté ultérieurement depuis la fiche dossier.
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
