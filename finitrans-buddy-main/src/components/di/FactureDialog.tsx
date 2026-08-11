import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText, AlertTriangle, Receipt, TrendingDown, Bell } from "lucide-react";
import { useDI } from "@/hooks/useDI";
import { uploadFile } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { notif } from "@/hooks/useNotification";
import { motion } from "framer-motion";

interface Props {
  open:        boolean;
  onClose:     () => void;
  diId:        string;
  dossierId:   string;
  diNumero:    string;
  soldeActuel: number;
  devise?:     string;
}

const CATEGORIES = [
  { value: "droits_douane", label: "Droits de douane" },
  { value: "tva",           label: "TVA" },
  { value: "honoraires",    label: "Honoraires" },
  { value: "redevances",    label: "Redevances" },
  { value: "penalites",     label: "Pénalités" },
  { value: "frais_divers",  label: "Frais divers" },
];

export default function FactureDialog({ open, onClose, diId, dossierId, diNumero, soldeActuel, devise = "XAF" }: Props) {
  const { decrement } = useDI(diId);

  const [file,      setFile]      = useState<File | null>(null);
  const [montant,   setMontant]   = useState("");
  const [motif,     setMotif]     = useState("");
  const [categorie, setCategorie] = useState("frais_divers");
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const montantNum     = parseFloat(montant) || 0;
  const soldeApres     = soldeActuel - montantNum;
  const pct20          = soldeActuel * 0.2;
  const insufficient   = montantNum > soldeActuel;
  const willTrigger20  = montantNum > 0 && !insufficient && soldeApres <= pct20;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!montantNum || montantNum <= 0) {
      toast({ title: "Montant requis", variant: "destructive" }); return;
    }
    if (!motif.trim()) {
      toast({ title: "Motif / référence requis", variant: "destructive" }); return;
    }
    if (!file) {
      toast({
        title: "Document obligatoire",
        description: "La facture PDF ou l'image justificative est requise pour valider la déduction.",
        variant: "destructive",
      }); return;
    }
    if (insufficient) {
      toast({ title: "Solde insuffisant", variant: "destructive" }); return;
    }

    setUploading(true);
    try {
      // Upload PDF — obligatoire (enregistré comme document du dossier)
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("etape", "facture_di");
        await uploadFile(`/api/dossiers/${dossierId}/upload`, fd);
      } catch {
        notif.erreur("Le document n'a pas pu être enregistré. Réessayez.");
        setUploading(false);
        return;
      }

      await decrement.mutateAsync({
        montant:   montantNum,
        motif:     motif.trim(),
        dossierId,
        categorie: categorie as any,
      });

      notif.factureAppliquee(montantNum, devise);

      if (willTrigger20) {
        notif.erreur(`Solde DI ${diNumero} passe sous 20% du montant initial — vérifiez l'enveloppe disponible.`);
      }

      setFile(null);
      setMontant("");
      setMotif("");
      setCategorie("frais_divers");
      if (fileRef.current) fileRef.current.value = "";
      onClose();
    } catch {
      // handled by mutation
    } finally {
      setUploading(false);
    }
  };

  const isPending = uploading || decrement.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-secondary" />
            </div>
            Ajouter une facture — {diNumero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">

          {/* ── Solde info ────────────────────────────────────── */}
          <div className="rounded-xl bg-muted/40 border border-border p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Solde disponible</p>
              <p className={`text-xl font-display font-black ${
                soldeActuel <= pct20 ? "text-warning" : "text-success"
              }`}>
                {soldeActuel.toLocaleString("fr-FR")}
                <span className="text-xs font-normal text-muted-foreground ml-1">{devise}</span>
              </p>
            </div>
            {soldeActuel <= pct20 && (
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-1.5 text-warning text-xs font-semibold bg-warning/10 px-2.5 py-1.5 rounded-lg border border-warning/20"
              >
                <Bell className="w-3.5 h-3.5" />
                Moins de 20% restant
              </motion.div>
            )}
          </div>

          {/* ── Zone drag-and-drop PDF ────────────────────────── */}
          <div>
            <Label className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
              <Upload className="w-3.5 h-3.5 text-secondary" />
              Document justificatif <span className="text-destructive">*</span>
              <span className="text-[10px] text-muted-foreground font-normal ml-1">(obligatoire)</span>
            </Label>
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                dragging ? "border-secondary bg-secondary/5 scale-[1.01]" :
                file      ? "border-success/50 bg-success/5" :
                "border-destructive/30 hover:border-secondary/50 hover:bg-muted/30"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-success">
                  <FileText className="w-5 h-5" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} Ko</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                  >×</button>
                </div>
              ) : (
                <>
                  <Upload className="w-7 h-7 text-destructive/30 mx-auto mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">
                    Glisser la facture PDF ici ou cliquer pour sélectionner
                  </p>
                  <p className="text-[10px] text-destructive/60 mt-0.5 font-medium">
                    PDF, JPG, PNG — Preuve obligatoire avant validation
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Montant ───────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-orange-500" />
              Montant de la facture ({devise}) *
            </Label>
            <Input
              type="number" min={1}
              value={montant}
              onChange={e => setMontant(e.target.value)}
              placeholder={`Max : ${soldeActuel.toLocaleString("fr-FR")}`}
              className={`bg-muted/50 font-mono text-lg h-11 ${insufficient ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
            {montantNum > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${
                  insufficient    ? "bg-destructive/10 text-destructive" :
                  willTrigger20   ? "bg-warning/10 text-warning" :
                  "bg-success/10 text-success"
                }`}
              >
                <span>Solde après déduction :</span>
                <span className="font-display font-black">
                  {soldeApres.toLocaleString("fr-FR")} {devise}
                  {willTrigger20 && !insufficient && (
                    <span className="ml-1 text-[10px]">⚠ seuil 20% atteint</span>
                  )}
                </span>
              </motion.div>
            )}
          </div>

          {/* ── Catégorie ─────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Catégorie</Label>
            <Select value={categorie} onValueChange={setCategorie}>
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ── Motif / référence ─────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Motif / référence facture *</Label>
            <Input
              value={motif}
              onChange={e => setMotif(e.target.value)}
              placeholder="Ex : Facture INV-2025-0847 — droits de douane réception"
              className="bg-muted/50"
            />
          </div>

          {/* ── Alerte 20% info ───────────────────────────────── */}
          {willTrigger20 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-warning/30 bg-warning/10 p-3 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-warning">Notification automatique activée</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cette déduction fera passer le solde sous le seuil de 20%. Une alerte sera automatiquement
                  générée et visible dans le module Alertes.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Boutons ─────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={handleSubmit}
              disabled={!montantNum || !motif.trim() || !file || insufficient || isPending}
              className="bg-secondary text-secondary-foreground gap-2 px-6"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Appliquer la déduction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
