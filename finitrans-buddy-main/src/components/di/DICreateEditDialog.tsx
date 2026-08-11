import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Search, X, FolderOpen, Banknote,
  RefreshCw, AlertTriangle, Upload, FileText, CheckCircle2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, uploadFile } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useDICreate, useDIUpdate, useDI, DIEnriched } from "@/hooks/useDI";

interface Props {
  open:    boolean;
  onClose: () => void;
  di?:     DIEnriched;
}

export default function DICreateEditDialog({ open, onClose, di }: Props) {
  const isEdit = !!di;
  const qc     = useQueryClient();

  const [form, setForm] = useState({
    numero:         "",
    client:         "",
    montant:        "",
    devise:         "XAF",
    compagnie:      "",
    dateEmission:   new Date().toISOString().split("T")[0],
    dateExpiration: "",
    seuilAlerte1:   "20",
    seuilAlerte2:   "10",
    notes:          "",
  });
  const [montantAjust, setMontantAjust] = useState("");
  const [motifAjust,   setMotifAjust]   = useState("");
  const [showAjust,    setShowAjust]    = useState(false);
  const [dossierSearch, setDossierSearch] = useState("");
  const [linkedIds,    setLinkedIds]    = useState<string[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [diFile,       setDiFile]       = useState<File | null>(null);
  const [dragOver,     setDragOver]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createDI = useDICreate();
  const updateDI = useDIUpdate(di?.id);
  const { recharge } = useDI(di?.id ?? null);

  // ── Fetch all dossiers for the multi-select ──────────────────
  const { data: dossiersData } = useQuery({
    queryKey: ["dossiers-all-di-select"],
    queryFn:  () => api.get<any>("/api/dossiers?limit=300"),
    staleTime: 2 * 60_000,
    enabled:   open,
  });
  const allDossiers: any[] = dossiersData?.data ?? [];
  const filteredDossiers = allDossiers.filter(d =>
    !dossierSearch ||
    d.numero?.toLowerCase().includes(dossierSearch.toLowerCase()) ||
    d.client?.toLowerCase().includes(dossierSearch.toLowerCase()),
  );

  // ── Reset form on open / di change ──────────────────────────
  useEffect(() => {
    if (!open) return;
    if (di) {
      setForm({
        numero:         di.numero,
        client:         di.client,
        montant:        String(di.montantNum),
        devise:         di.devise ?? "XAF",
        compagnie:      "",
        dateEmission:   new Date().toISOString().split("T")[0],
        dateExpiration: di.dateExpiration ? di.dateExpiration.split("T")[0] : "",
        seuilAlerte1:   String(di.seuilAlerte1),
        seuilAlerte2:   String(di.seuilAlerte2),
        notes:          "",
      });
      setLinkedIds((di.dossiers ?? []).map((d: any) => d.id));
    } else {
      setForm({
        numero:         `DI-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
        client:         "",
        montant:        "",
        devise:         "XAF",
        compagnie:      "",
        dateEmission:   new Date().toISOString().split("T")[0],
        dateExpiration: "",
        seuilAlerte1:   "20",
        seuilAlerte2:   "10",
        notes:          "",
      });
      setLinkedIds([]);
    }
    setDossierSearch("");
    setShowAjust(false);
    setMontantAjust("");
    setMotifAjust("");
    setDiFile(null);
    setDragOver(false);
  }, [di, open]);

  const toggleDossier = (id: string) =>
    setLinkedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!form.client.trim()) {
      toast({ title: "Client requis", variant: "destructive" }); return;
    }
    const montant = parseFloat(form.montant);
    if (!isEdit && (isNaN(montant) || montant <= 0)) {
      toast({ title: "Montant invalide", variant: "destructive" }); return;
    }
    if (!isEdit && !diFile) {
      toast({
        title: "Document obligatoire",
        description: "Veuillez joindre le document DI (PDF ou image) avant de créer la déclaration.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && di) {
        // Update metadata
        await updateDI.mutateAsync({
          client:         form.client,
          seuilAlerte1:   parseInt(form.seuilAlerte1) || 20,
          seuilAlerte2:   parseInt(form.seuilAlerte2) || 10,
          dateExpiration: form.dateExpiration ? new Date(form.dateExpiration).toISOString() : undefined,
          notes:          form.notes || undefined,
        });
        // Handle montant adjustment
        if (showAjust && montantAjust && motifAjust.trim().length >= 5) {
          await recharge.mutateAsync({ montant: parseFloat(montantAjust), motif: motifAjust });
        }
        // Add new dossier links
        const existingIds = (di.dossiers ?? []).map((d: any) => d.id);
        const toAdd = linkedIds.filter(id => !existingIds.includes(id));
        if (toAdd.length > 0) {
          await Promise.all(toAdd.map(id => api.post(`/api/di/${di.id}/lier-dossier`, { dossierId: id })));
          qc.invalidateQueries({ queryKey: ["di", di.id] });
        }
      } else {
        // Create
        const newDI = await createDI.mutateAsync({
          numero:         form.numero,
          client:         form.client,
          montant,
          devise:         form.devise as any,
          compagnie:      form.compagnie as any || undefined,
          dateEmission:   new Date(form.dateEmission).toISOString(),
          dateExpiration: form.dateExpiration ? new Date(form.dateExpiration).toISOString() : undefined,
          seuilAlerte1:   parseInt(form.seuilAlerte1) || 20,
          seuilAlerte2:   parseInt(form.seuilAlerte2) || 10,
          notes:          form.notes || undefined,
        });
        // Upload document obligatoire
        if (diFile) {
          try {
            const fd = new FormData();
            fd.append("file", diFile);
            fd.append("categorie", "document_di");
            fd.append("motif", `Document DI — ${form.numero}`);
            await uploadFile(`/api/di/${newDI.id}/factures`, fd);
          } catch {
            toast({
              title: "DI créée — document non joint",
              description: "La DI a été créée mais le document n'a pas pu être uploadé. Ajoutez-le manuellement.",
              variant: "destructive",
            });
          }
        }
        if (linkedIds.length > 0) {
          await Promise.all(linkedIds.map(id => api.post(`/api/di/${newDI.id}/lier-dossier`, { dossierId: id })));
          qc.invalidateQueries({ queryKey: ["di-list"] });
        }
      }
      onClose();
    } catch {
      // handled by mutations
    } finally {
      setSaving(false);
    }
  };

  const isPending = saving || createDI.isPending || updateDI.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] bg-card max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-secondary" />
            </div>
            {isEdit ? `Modifier — ${di?.numero}` : "Nouvelle Déclaration d'Importation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-1 pb-2">

          {/* ── N° DI + Client ───────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N° DI</Label>
              <Input
                value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value })}
                disabled={isEdit}
                className={`bg-muted/50 font-mono text-sm ${isEdit ? "opacity-60" : ""}`}
                placeholder="DI-2025-00001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Client *</Label>
              <Input
                value={form.client}
                onChange={e => setForm({ ...form, client: e.target.value })}
                placeholder="Nom du client importateur"
                className="bg-muted/50"
              />
            </div>
          </div>

          {/* ── Montant (create) ou ajustement (edit) ──────── */}
          {!isEdit ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Montant enveloppe (FCFA) *</Label>
                <Input
                  type="number" min={1}
                  value={form.montant}
                  onChange={e => setForm({ ...form, montant: e.target.value })}
                  placeholder="45 000 000"
                  className="bg-muted/50 font-mono"
                />
                {form.montant && !isNaN(parseFloat(form.montant)) && (
                  <p className="text-[11px] text-muted-foreground">
                    = {parseFloat(form.montant).toLocaleString("fr-FR")} FCFA
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Devise</Label>
                <Select value={form.devise} onValueChange={v => setForm({ ...form, devise: v })}>
                  <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XAF">XAF — FCFA</SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="USD">USD — Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Enveloppe actuelle</p>
                  <p className="text-lg font-display font-black text-foreground">
                    {di?.montantNum.toLocaleString("fr-FR")} {di?.devise}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAjust(v => !v)}
                  className="gap-1.5 text-xs h-8">
                  <RefreshCw className="w-3.5 h-3.5" />
                  {showAjust ? "Annuler ajustement" : "Ajuster montant"}
                </Button>
              </div>
              {showAjust && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-xs text-warning flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    L'ajustement ajoute au solde existant (recharge uniquement, non déductible ici)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Montant à créditer ({di?.devise})</Label>
                      <Input type="number" min={1} value={montantAjust}
                        onChange={e => setMontantAjust(e.target.value)}
                        placeholder="5 000 000" className="bg-card font-mono text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Motif (min 5 car.)</Label>
                      <Input value={motifAjust} onChange={e => setMotifAjust(e.target.value)}
                        placeholder="Motif de l'ajustement..." className="bg-card text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Compagnie + Dates (create only) ─────────────── */}
          {!isEdit && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Compagnie maritime</Label>
                <Select value={form.compagnie} onValueChange={v => setForm({ ...form, compagnie: v })}>
                  <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MSC">MSC</SelectItem>
                    <SelectItem value="COSCO">COSCO</SelectItem>
                    <SelectItem value="MAERSK">MAERSK</SelectItem>
                    <SelectItem value="CMA_CGM">CMA-CGM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date d'émission *</Label>
                <Input type="date" value={form.dateEmission}
                  onChange={e => setForm({ ...form, dateEmission: e.target.value })}
                  className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date d'expiration</Label>
                <Input type="date" value={form.dateExpiration}
                  onChange={e => setForm({ ...form, dateExpiration: e.target.value })}
                  className="bg-muted/50" />
              </div>
            </div>
          )}

          {/* ── Seuils d'alerte ──────────────────────────────── */}
          <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4 space-y-3">
            <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Seuils d'alerte budgétaire
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alerte jaune (% restant)</Label>
                <Input type="number" min={1} max={99}
                  value={form.seuilAlerte1}
                  onChange={e => setForm({ ...form, seuilAlerte1: e.target.value })}
                  className="bg-card font-mono" />
                <p className="text-[10px] text-muted-foreground">
                  Notification à {form.seuilAlerte1}% restant
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alerte rouge (% restant)</Label>
                <Input type="number" min={1} max={50}
                  value={form.seuilAlerte2}
                  onChange={e => setForm({ ...form, seuilAlerte2: e.target.value })}
                  className="bg-card font-mono" />
                <p className="text-[10px] text-muted-foreground">
                  Alerte critique à {form.seuilAlerte2}% restant
                </p>
              </div>
            </div>
          </div>

          {/* ── Dossiers associés ────────────────────────────── */}
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-secondary" />
              Dossiers associés à cette DI
            </Label>

            {/* Chips sélectionnés */}
            {linkedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-secondary/5 border border-secondary/10">
                {linkedIds.map(id => {
                  const d = allDossiers.find(x => x.id === id);
                  return (
                    <span key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/15 text-secondary text-xs font-semibold">
                      {d?.numero ?? id.slice(0, 8)}
                      <span className="text-muted-foreground font-normal ml-0.5">{d?.client ? `· ${d.client}` : ""}</span>
                      <button onClick={() => toggleDossier(id)}
                        className="ml-0.5 hover:text-destructive transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Liste dossiers */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <Input
                  placeholder="Rechercher par numéro ou client..."
                  value={dossierSearch}
                  onChange={e => setDossierSearch(e.target.value)}
                  className="border-0 p-0 h-auto bg-transparent text-sm focus-visible:ring-0 shadow-none"
                />
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-border/30">
                {filteredDossiers.slice(0, 25).map(d => {
                  const selected = linkedIds.includes(d.id);
                  return (
                    <button key={d.id} onClick={() => toggleDossier(d.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${selected ? "bg-secondary/5" : ""}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? "bg-secondary border-secondary" : "border-border"}`}>
                        {selected && <span className="text-white text-[8px] font-black">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-foreground">{d.numero}</span>
                        <span className="text-xs text-muted-foreground ml-2">{d.client}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">{d.site}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          d.status === "cloture" ? "bg-gray-100 text-gray-600" : "bg-secondary/10 text-secondary"
                        }`}>{d.status}</span>
                      </div>
                    </button>
                  );
                })}
                {filteredDossiers.length === 0 && (
                  <div className="text-center py-5 text-xs text-muted-foreground">Aucun dossier trouvé</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Document DI obligatoire (create only) ───────────── */}
          {!isEdit && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-secondary" />
                Document DI *
                <span className="text-[10px] text-red-500 font-normal">(obligatoire)</span>
              </Label>

              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={e => setDiFile(e.target.files?.[0] ?? null)}
              />

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setDiFile(f);
                }}
                className={`cursor-pointer rounded-xl border-2 border-dashed transition-all p-4 text-center ${
                  diFile
                    ? "border-success/40 bg-success/5"
                    : dragOver
                    ? "border-secondary bg-secondary/5"
                    : "border-border hover:border-secondary/50 hover:bg-muted/30"
                }`}
              >
                {diFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                      {diFile.name.endsWith(".pdf")
                        ? <FileText className="w-4 h-4 text-red-600" />
                        : <FileText className="w-4 h-4 text-success" />
                      }
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate max-w-[280px]">{diFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(diFile.size / 1024).toFixed(0)} Ko — cliquer pour changer
                      </p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                  </div>
                ) : (
                  <div className="py-2">
                    <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      Glisser-déposer le document DI ici
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ou <span className="text-secondary font-semibold">cliquer pour parcourir</span> — PDF, JPG, PNG, DOC (max 10 Mo)
                    </p>
                  </div>
                )}
              </div>

              {!diFile && (
                <p className="text-[11px] text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Le document DI est requis pour valider la création
                </p>
              )}
            </div>
          )}

          {/* ── Notes ───────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes (optionnel)</Label>
            <Textarea
              placeholder="Informations complémentaires..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="bg-muted/50 h-20 resize-none"
            />
          </div>

          {/* ── Boutons ─────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || (!isEdit && !diFile)}
              className="bg-primary text-primary-foreground gap-2 px-6"
              title={!isEdit && !diFile ? "Document obligatoire" : undefined}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {!isPending && !isEdit && !diFile && <Upload className="w-4 h-4" />}
              {isEdit ? "Enregistrer" : "Créer la DI"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
