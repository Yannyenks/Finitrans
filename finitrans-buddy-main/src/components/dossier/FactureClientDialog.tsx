import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Nature = "honoraires" | "debours";
interface Ligne { libelle: string; montant: string; nature: Nature }

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

/**
 * Facture client (étape « Facturation client ») : lignes pré-remplies depuis le dossier
 * (honoraires, droits et taxes, frais compagnie, redevances), modifiables, avec totaux en direct.
 */
export default function FactureClientDialog({ dossierId, loading, onConfirm, onCancel }: {
  dossierId: string;
  loading: boolean;
  onConfirm: (metadata: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { data: prop, isLoading } = useQuery({
    queryKey: ["facturation-proposition", dossierId],
    queryFn: () => api.get<any>(`/api/facturation/dossiers/${dossierId}/proposition`),
  });
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [taux, setTaux] = useState("19.25");
  useEffect(() => {
    if (!prop) return;
    setLignes((prop.lignes ?? []).map((l: any) => ({ libelle: l.libelle, montant: String(Math.round(l.montant)), nature: l.nature })));
    setTaux(String(prop.tauxTVA ?? 19.25));
  }, [prop]);

  const n = (v: string) => Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0;
  const ht = lignes.filter(l => l.nature === "honoraires").reduce((s, l) => s + n(l.montant), 0);
  const debours = lignes.filter(l => l.nature === "debours").reduce((s, l) => s + n(l.montant), 0);
  const tva = Math.round(ht * n(taux) / 100);
  const ttc = ht + tva + debours;
  const acomptes = Number(prop?.acomptes ?? 0);
  const net = Math.max(0, ttc - acomptes);
  const valide = lignes.some(l => n(l.montant) > 0 && l.libelle.trim());
  const maj = (i: number, patch: Partial<Ligne>) => setLignes(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl w-full max-w-3xl shadow-2xl border border-border max-h-[94vh] overflow-y-auto" role="dialog" aria-label="Facture client">
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary via-[hsl(213,55%,22%)] to-[hsl(213,60%,10%)] px-6 py-5 text-primary-foreground">
          <div className="absolute -right-10 -top-16 w-48 h-48 rounded-full bg-secondary/25 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shadow-lg"><Receipt className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-secondary font-semibold">Facturation client</p>
              <h3 className="font-display text-lg font-bold">Facture — {prop?.client?.nom ?? "…"}</h3>
              <p className="text-xs text-primary-foreground/70">La facture est numérotée, enregistrée en Finance et générée en PDF aux couleurs FINITRANS.</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
        ) : (
          <div className="p-6 space-y-5">
            {prop?.facturesExistantes?.length > 0 && (
              <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                Déjà facturé : {prop.facturesExistantes.map((f: any) => `${f.numero} (${fcfa(f.montant)})`).join(", ")}. Une nouvelle facture sera ajoutée.
              </p>
            )}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="grid grid-cols-[1fr_150px_150px_36px] gap-2 bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Désignation</span><span>Nature</span><span className="text-right">Montant (FCFA)</span><span />
              </div>
              <div className="divide-y divide-border/50">
                {lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_150px_150px_36px] gap-2 px-3 py-2 items-center">
                    <Input value={l.libelle} onChange={e => maj(i, { libelle: e.target.value })} className="h-8 text-sm bg-card" aria-label={`Désignation ligne ${i + 1}`} />
                    <Select value={l.nature} onValueChange={v => maj(i, { nature: v as Nature })}>
                      <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="honoraires">Prestation (TVA)</SelectItem>
                        <SelectItem value="debours">Débours (hors TVA)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={l.montant} onChange={e => maj(i, { montant: e.target.value })} className="h-8 text-sm text-right font-mono bg-card" aria-label={`Montant ligne ${i + 1}`} />
                    <button type="button" onClick={() => setLignes(ls => ls.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Supprimer la ligne">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-border/50">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs gap-1 text-secondary" onClick={() => setLignes(ls => [...ls, { libelle: "", montant: "", nature: "honoraires" }])}>
                  <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
                </Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-[1fr_300px] gap-5 items-start">
              <div className="space-y-1.5 max-w-[180px]">
                <Label className="text-xs font-semibold">Taux de TVA (%)</Label>
                <Input type="number" min={0} max={100} step={0.25} value={taux} onChange={e => setTaux(e.target.value)} className="font-mono bg-muted/40" />
                <p className="text-[10px] text-muted-foreground">Appliquée aux prestations uniquement ; les débours sont refacturés hors TVA.</p>
              </div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                {[["Prestations HT", fcfa(ht)], [`TVA ${taux || 0} %`, fcfa(tva)], ["Débours refacturés", fcfa(debours)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-1.5 text-sm"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>
                ))}
                <div className="flex justify-between px-4 py-2 border-t border-border/60 font-semibold"><span>Total TTC</span><span className="font-mono">{fcfa(ttc)}</span></div>
                {acomptes > 0 && <div className="flex justify-between px-4 py-1.5 text-sm text-success"><span>Acomptes reçus</span><span className="font-mono">- {fcfa(acomptes)}</span></div>}
                <div className="flex justify-between px-4 py-3 bg-secondary text-secondary-foreground font-display font-bold">
                  <span>Net à payer</span><span className="font-mono">{fcfa(net)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={onCancel}>Annuler</Button>
              <Button disabled={!valide || loading} className="gap-1.5 bg-secondary text-secondary-foreground"
                onClick={() => onConfirm({
                  facture_tva_taux: n(taux),
                  facture_lignes: lignes.filter(l => l.libelle.trim()).map(l => ({ libelle: l.libelle.trim(), montant: n(l.montant), nature: l.nature })),
                  facture_total_ttc: ttc,
                })}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Émettre la facture
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
