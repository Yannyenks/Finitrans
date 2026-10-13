import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/permissions";
import { telechargerCsv } from "@/lib/csv";
import { toast } from "@/hooks/use-toast";
import { BookUser, Download, Loader2, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES: Record<string, string> = {
  client: "Clients", fournisseur: "Fournisseurs", compagnie: "Compagnies maritimes", transporteur: "Transporteurs",
  administration: "Administrations", banque: "Banques", autre: "Autres",
};

const TYPE_SINGULIER: Record<string, string> = {
  client: "Client", fournisseur: "Fournisseur", compagnie: "Compagnie", transporteur: "Transporteur",
  administration: "Administration", banque: "Banque", autre: "Autre",
};

type Contact = {
  id: string; type: string; nom: string; societe?: string | null; fonction?: string | null; telephone?: string | null;
  telephone2?: string | null; email?: string | null; adresse?: string | null; niu?: string | null; notes?: string | null;
  createdById?: string | null; createdBy?: { nom: string } | null;
};

const VIDE = { type: "client", nom: "", societe: "", fonction: "", telephone: "", telephone2: "", email: "", adresse: "", niu: "", notes: "" };

const Repertoire = () => {
  const qc = useQueryClient();
  const { user, superviseur } = useAuth();
  const [type, setType] = useState("tous");
  const [q, setQ] = useState("");
  const [edition, setEdition] = useState<{ id?: string; valeurs: typeof VIDE } | null>(null);

  const params = new URLSearchParams();
  if (type !== "tous") params.set("type", type);
  if (q.trim()) params.set("q", q.trim());
  const { data, isLoading } = useQuery({
    queryKey: ["repertoire", type, q.trim()],
    queryFn: () => api.get<{ contacts: Contact[]; parType: Record<string, number> }>(`/api/repertoire?${params}`),
  });
  const contacts = data?.contacts ?? [];
  const total = Object.values(data?.parType ?? {}).reduce((s, n) => s + n, 0);

  const erreur = (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" });
  const enregistrer = useMutation({
    mutationFn: ({ id, valeurs }: { id?: string; valeurs: typeof VIDE }) => {
      const corps = Object.fromEntries(Object.entries(valeurs).map(([k, v]) => [k, k === "type" || k === "nom" ? v : (v.trim() || null)]));
      return id ? api.patch(`/api/repertoire/${id}`, corps) : api.post("/api/repertoire", corps);
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["repertoire"] }); setEdition(null); toast({ title: v.id ? "Contact mis à jour" : "Contact ajouté" }); },
    onError: erreur,
  });
  const supprimer = useMutation({
    mutationFn: (id: string) => api.delete(`/api/repertoire/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["repertoire"] }); toast({ title: "Contact supprimé" }); },
    onError: erreur,
  });

  const ouvrir = (c?: Contact) => setEdition(c
    ? { id: c.id, valeurs: Object.fromEntries(Object.keys(VIDE).map(k => [k, (c as any)[k] ?? ""])) as typeof VIDE }
    : { valeurs: { ...VIDE, type: type !== "tous" ? type : "client" } });
  const champ = (k: keyof typeof VIDE) => ({
    value: edition?.valeurs[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdition(ed => ed && { ...ed, valeurs: { ...ed.valeurs, [k]: e.target.value } }),
  });

  return (
    <AppLayout title="Répertoire" subtitle="Contacts partagés : clients, compagnies, transporteurs, administrations…">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher un nom, une société, un téléphone…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[200px]" aria-label="Catégorie"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Toutes catégories ({total})</SelectItem>
              {Object.entries(TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l} ({data?.parType?.[k] ?? 0})</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-1.5" disabled={contacts.length === 0}
            onClick={() => telechargerCsv("repertoire.csv", contacts.map(c => ({
              Catégorie: TYPES[c.type] ?? c.type, Nom: c.nom, Société: c.societe ?? "", Fonction: c.fonction ?? "",
              Téléphone: c.telephone ?? "", "Téléphone 2": c.telephone2 ?? "", Email: c.email ?? "", Adresse: c.adresse ?? "", NIU: c.niu ?? "",
            })))}><Download className="w-4 h-4" /> Export</Button>
          <Button className="gap-1.5" onClick={() => ouvrir()}><Plus className="w-4 h-4" /> Nouveau contact</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : contacts.length === 0 ? (
          <div className="stat-card text-center py-14 text-muted-foreground">
            <BookUser className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Aucun contact{q || type !== "tous" ? " pour ce filtre" : " pour l'instant — ajoutez le premier"}.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {contacts.map(c => {
              const peutSupprimer = superviseur || c.createdById === user?.id;
              return (
                <div key={c.id} className="stat-card p-4 space-y-2" data-testid="contact">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.nom}</p>
                      <p className="text-xs text-muted-foreground truncate">{[c.fonction, c.societe].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className="status-badge bg-muted text-muted-foreground text-[10px] shrink-0">{TYPE_SINGULIER[c.type] ?? c.type}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {[c.telephone, c.telephone2].filter(Boolean).map(t => (
                      <a key={t!} href={`tel:${t!.replace(/\s/g, "")}`} className="flex items-center gap-2 text-secondary hover:underline"><Phone className="w-3.5 h-3.5" /> {t}</a>
                    ))}
                    {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-secondary hover:underline break-all"><Mail className="w-3.5 h-3.5 shrink-0" /> {c.email}</a>}
                    {c.adresse && <p className="text-xs text-muted-foreground">{c.adresse}</p>}
                    {c.niu && <p className="text-xs text-muted-foreground">NIU : {c.niu}</p>}
                    {c.notes && <p className="text-xs text-muted-foreground italic whitespace-pre-line">{c.notes}</p>}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/60">
                    <span className="text-[10px] text-muted-foreground">{c.createdBy?.nom ? `Ajouté par ${c.createdBy.nom}` : ""}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Modifier" onClick={() => ouvrir(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                      {peutSupprimer && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" title="Supprimer" disabled={supprimer.isPending}
                          onClick={() => { if (window.confirm(`Supprimer ${c.nom} du répertoire ?`)) supprimer.mutate(c.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!edition} onOpenChange={o => !o && setEdition(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edition?.id ? "Modifier le contact" : "Nouveau contact"}</DialogTitle></DialogHeader>
          <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); if (edition) enregistrer.mutate(edition); }}>
            <div className="col-span-2 sm:col-span-1">
              <Label>Catégorie</Label>
              <Select value={edition?.valeurs.type} onValueChange={v => setEdition(ed => ed && { ...ed, valeurs: { ...ed.valeurs, type: v } })}>
                <SelectTrigger aria-label="Catégorie du contact"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-1"><Label htmlFor="ct-nom">Nom *</Label><Input id="ct-nom" required minLength={2} {...champ("nom")} /></div>
            <div><Label htmlFor="ct-soc">Société</Label><Input id="ct-soc" {...champ("societe")} /></div>
            <div><Label htmlFor="ct-fn">Fonction</Label><Input id="ct-fn" {...champ("fonction")} /></div>
            <div><Label htmlFor="ct-tel">Téléphone</Label><Input id="ct-tel" type="tel" {...champ("telephone")} /></div>
            <div><Label htmlFor="ct-tel2">Téléphone 2</Label><Input id="ct-tel2" type="tel" {...champ("telephone2")} /></div>
            <div className="col-span-2"><Label htmlFor="ct-mail">Email</Label><Input id="ct-mail" type="email" {...champ("email")} /></div>
            <div><Label htmlFor="ct-adr">Adresse</Label><Input id="ct-adr" {...champ("adresse")} /></div>
            <div><Label htmlFor="ct-niu">NIU</Label><Input id="ct-niu" {...champ("niu")} /></div>
            <div className="col-span-2"><Label htmlFor="ct-notes">Notes</Label><Textarea id="ct-notes" rows={2} {...champ("notes")} /></div>
            <div className="col-span-2 flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEdition(null)}>Annuler</Button>
              <Button type="submit" disabled={enregistrer.isPending}>{enregistrer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Enregistrer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Repertoire;
