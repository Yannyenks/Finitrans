import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DureeJHM } from "@/components/DureeJHM";
import { TAUX_DEFAUT } from "@/lib/devise";
import { delaiJHM } from "@/lib/temps";
import { Bell, Shield, Globe, Save, Timer, Link2, Plus, Trash2, CheckCircle2, Ship, Coins } from "lucide-react";
import CompagniesMaritimes from "@/components/CompagniesMaritimes";
import { useNavigate } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIENS_DEFAUT, LienExterne, urlValide } from "@/lib/liens";
import { useAuth } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const STEP_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "Soumission SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon compagnie (Douala)",
  operations_douala: "Douala", operations_kribi: "Kribi",
  cloture:          "Clôture", facturation: "Facturation client",
};

/** Délais cibles par étape, en jours (paramètre serveur « sla_jours » utilisé par le workflow). */
const DEFAULT_SLA: Record<string, number> = {
  reception:        1,
  soumission_sgs:   2,
  codage:           1,
  validation:       2,
  paiement:         3,
  bon_compagnie:    2,
  operations_kribi: 3,
  cloture:          1, facturation: 2,
};

type SlaSousEtape = { cle: string; etape: string; etapeLabel: string; label: string; sites: string[] | null; heures: number; defaut: number };

const Parametres = () => {
  const qc = useQueryClient();
  const { data: configData } = useQuery({
    queryKey: ["alertes-config"],
    queryFn:  () => api.get<any[]>("/api/alertes/config"),
  });
  const [alerts, setAlerts] = useState<any[]>([]);
  useEffect(() => { if (configData) setAlerts(configData); }, [configData]);

  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: params } = useQuery({ queryKey: ["parametres"], queryFn: () => api.get<Record<string, any>>("/api/parametres") });

  // SLA : paramètre serveur « sla_jours » (durée prévue de chaque étape)
  const [slaConfig, setSlaConfig] = useState<Record<string, number>>(DEFAULT_SLA);
  useEffect(() => { if (params?.sla_jours) setSlaConfig({ ...DEFAULT_SLA, ...params.sla_jours }); }, [params]);
  const saveSla = useMutation({
    mutationFn: () => api.patch("/api/parametres/sla_jours", { valeur: slaConfig }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parametres"] }); toast({ title: "Délais enregistrés", description: "Appliqués aux prochaines étapes démarrées." }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  const saveSlaConfig = () => saveSla.mutate();

  // SLA de chaque sous-étape (heures, précision à la minute) — paramètre « sla_sous_etapes »
  const { superviseur } = useAuth();
  const { data: slaSE } = useQuery({ queryKey: ["sla-sous-etapes"], queryFn: () => api.get<SlaSousEtape[]>("/api/parametres/sla-sous-etapes") });
  const [slaTaches, setSlaTaches] = useState<Record<string, number>>({});
  useEffect(() => { if (slaSE) setSlaTaches(Object.fromEntries(slaSE.map(l => [l.cle, l.heures]))); }, [slaSE]);
  const saveSlaTaches = useMutation({
    mutationFn: () => api.patch("/api/parametres/sla_sous_etapes", { valeur: slaTaches }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sla-sous-etapes"] }); toast({ title: "SLA des tâches enregistrés", description: "Ils s'appliquent aux tâches des prochaines étapes démarrées." }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  const groupesSla = (slaSE ?? []).reduce<Record<string, SlaSousEtape[]>>((acc, l) => { (acc[l.etape] ??= []).push(l); return acc; }, {});
  const majSla = (cle: string, minutes: number) => setSlaTaches(p => ({ ...p, [cle]: Math.max(0, Math.round(minutes)) / 60 }));

  // Taux de change (FCFA pour 1 USD / 1 EUR) — affichage des montants en dollar ou en euro
  const [taux, setTaux] = useState<{ USD: string; EUR: string }>({ USD: String(TAUX_DEFAUT.USD), EUR: String(TAUX_DEFAUT.EUR) });
  useEffect(() => {
    if (params?.taux_change) setTaux({ USD: String(params.taux_change.USD ?? TAUX_DEFAUT.USD), EUR: String(params.taux_change.EUR ?? TAUX_DEFAUT.EUR) });
  }, [params]);
  const tauxValides = Number(taux.USD) > 0 && Number(taux.EUR) > 0;
  const saveTaux = useMutation({
    mutationFn: () => api.patch("/api/parametres/taux_change", { valeur: { USD: Number(taux.USD), EUR: Number(taux.EUR), majLe: new Date().toISOString() } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parametres"] }); toast({ title: "Taux de change enregistrés", description: "Les montants en dollar et en euro sont recalculés." }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Liens externes (portails ouverts depuis une sous-étape)
  const { data: attribution } = useQuery({ queryKey: ["roles-attribution"], queryFn: () => api.get<any>("/api/roles/attribution") });
  const sousEtapes: { cle: string; label: string }[] = (attribution?.etapes ?? []).flatMap((e: any) =>
    e.sousEtapes.map((x: any) => ({ cle: `${e.etape}.${x.cle}`, label: `${STEP_LABELS[e.etape] ?? e.etape} — ${x.label}` })));
  const [liens, setLiens] = useState<{ cle: string; label: string; url: string }[]>([]);
  useEffect(() => {
    const src: Record<string, LienExterne> = params?.liens_externes ?? LIENS_DEFAUT;
    setLiens(Object.entries(src).map(([cle, l]) => ({ cle, ...l })));
  }, [params]);
  const liensValides = liens.every(l => l.cle && l.label.trim() && urlValide(l.url));
  const saveLiens = useMutation({
    mutationFn: () => api.patch("/api/parametres/liens_externes", {
      valeur: Object.fromEntries(liens.map(l => [l.cle, { label: l.label.trim(), url: l.url.trim() }])),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parametres"] }); toast({ title: "Liens enregistrés" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const saveConfig = useMutation({
    mutationFn: (cfg: any) => api.patch(`/api/alertes/config/${cfg.id}`, { seuil: cfg.seuil, actif: cfg.actif }),
  });

  const handleSave = async () => {
    await Promise.all(alerts.map(cfg => saveConfig.mutateAsync(cfg)));
    qc.invalidateQueries({ queryKey: ["alertes-config"] });
    toast({ title: "Paramètres sauvegardés", description: "Les modifications ont été appliquées." });
  };

  return (
    <AppLayout title="Paramètres" subtitle="Configuration de la plateforme">
      <Tabs defaultValue="alertes" className="max-w-3xl">
        <TabsList className="mb-6 flex-wrap gap-1">
          <TabsTrigger value="alertes"  className="gap-1.5"><Bell   className="w-3.5 h-3.5" /> Alertes</TabsTrigger>
          <TabsTrigger value="sla"      className="gap-1.5"><Timer  className="w-3.5 h-3.5" /> SLA &amp; Délais</TabsTrigger>
          <TabsTrigger value="compagnies" className="gap-1.5"><Ship className="w-3.5 h-3.5" /> Compagnies maritimes</TabsTrigger>
          <TabsTrigger value="devises"  className="gap-1.5"><Coins  className="w-3.5 h-3.5" /> Devises</TabsTrigger>
          <TabsTrigger value="liens"    className="gap-1.5"><Link2  className="w-3.5 h-3.5" /> Liens &amp; portails</TabsTrigger>
          <TabsTrigger value="securite" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Sécurité</TabsTrigger>
          <TabsTrigger value="general"  className="gap-1.5"><Globe  className="w-3.5 h-3.5" /> Général</TabsTrigger>
        </TabsList>

        <TabsContent value="alertes">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-1">Seuils d'alertes automatiques</h3>
            <p className="text-sm text-muted-foreground mb-6">Configurez les déclencheurs de chaque type d'alerte</p>
            <div className="space-y-4">
              {alerts.map((cfg, i) => (
                <div key={cfg.id} className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <Switch
                    checked={cfg.actif}
                    onCheckedChange={v => {
                      const next = [...alerts];
                      next[i] = { ...cfg, actif: v };
                      setAlerts(next);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">{cfg.unite}</p>
                  </div>
                  <Input
                    type="number"
                    value={cfg.seuil}
                    onChange={e => {
                      const next = [...alerts];
                      next[i] = { ...cfg, seuil: Number(e.target.value) };
                      setAlerts(next);
                    }}
                    className="w-20 text-center bg-card"
                    disabled={!cfg.actif}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <Button onClick={handleSave} className="gap-2 bg-primary text-primary-foreground">
                <Save className="w-4 h-4" /> Enregistrer
              </Button>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="devises">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-1">Taux de change</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Les montants sont enregistrés en FCFA. Le sélecteur <strong>FCFA · $ · €</strong> de l'en-tête les affiche en dollar ou en euro avec ces taux.
              {!superviseur && <strong> Modifiable par la Direction et le Responsable Exploitation.</strong>}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {([["USD", "1 dollar US ($)"], ["EUR", "1 euro (€)"]] as const).map(([code, libelle]) => (
                <div key={code} className="p-3.5 rounded-xl bg-muted/40 border border-border/50 space-y-1.5">
                  <Label className="text-xs">{libelle} =</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} step="0.001" inputMode="decimal" value={taux[code]} disabled={!superviseur} aria-label={`Taux ${code}`}
                      onChange={e => setTaux(t => ({ ...t, [code]: e.target.value }))} className="bg-card font-mono" />
                    <span className="text-sm font-semibold text-muted-foreground">FCFA</span>
                  </div>
                  {Number(taux[code]) > 0 && (
                    <p className="text-[11px] text-muted-foreground">1 000 000 FCFA ≈ {(1_000_000 / Number(taux[code])).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} {code === "USD" ? "$" : "€"}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">L'euro est à parité fixe avec le franc CFA (655,957 FCFA). {params?.taux_change?.majLe && <>Dernière mise à jour : {new Date(params.taux_change.majLe).toLocaleString("fr-FR")}.</>}</p>
            <div className="flex justify-end">
              <Button onClick={() => saveTaux.mutate()} disabled={!superviseur || !tauxValides || saveTaux.isPending} className="gap-2 bg-primary text-primary-foreground">
                <Save className="w-4 h-4" /> Enregistrer les taux
              </Button>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="sla">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-1">Délais SLA par étape</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Définissez la durée cible de chaque étape du workflow dossier, en jours, heures et minutes.
              Elle s'applique aux étapes démarrées après l'enregistrement et alimente la Supervision.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
              {Object.entries(slaConfig).filter(([step]) => step !== "operations_douala").map(([step, h]) => (
                <div key={step} className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-muted/40 border border-border/50" data-testid={`sla-etape-${step}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{STEP_LABELS[step] ?? step}</p>
                    <p className="text-xs text-muted-foreground">Délai cible : <span className="font-mono font-semibold">{delaiJHM(h * 1440)}</span></p>
                  </div>
                  <DureeJHM minutes={h * 1440} minimum={1} disabled={!superviseur} libelle={STEP_LABELS[step] ?? step}
                    onChange={min => setSlaConfig(prev => ({ ...prev, [step]: min / 1440 }))} />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setSlaConfig(DEFAULT_SLA); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Réinitialiser les valeurs par défaut
              </button>
              <Button onClick={saveSlaConfig} disabled={saveSla.isPending || !superviseur} className="gap-2 bg-primary text-primary-foreground">
                <Save className="w-4 h-4" /> Enregistrer les SLA
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-border/60">
              <h3 className="font-display font-semibold text-foreground mb-1">SLA de chaque tâche (sous-étape)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Délai cible de chaque tâche, à la minute près. Quand le dossier entre dans une étape, le chronomètre de ses tâches démarre
                et leur échéance est calculée automatiquement. {!superviseur && <strong>Modifiable par la Direction et le Responsable Exploitation.</strong>}
              </p>
              <div className="space-y-4">
                {Object.entries(groupesSla).map(([etape, lignes]) => (
                  <div key={etape} className="rounded-xl border border-border/60 overflow-hidden">
                    <p className="px-4 py-2 bg-muted/50 text-xs font-bold text-foreground uppercase tracking-wide">{lignes[0].etapeLabel}</p>
                    <div className="divide-y divide-border/50">
                      {lignes.map(l => {
                        const total = Math.round((slaTaches[l.cle] ?? l.heures) * 60);
                        return (
                          <div key={l.cle} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5" data-testid={`sla-${l.cle}`}>
                            <div className="flex-1 min-w-[10rem]">
                              <p className="text-sm text-foreground truncate">{l.label}{l.sites && <span className="text-[10px] text-muted-foreground ml-1.5">({l.sites.join(", ")})</span>}</p>
                              <p className="text-[10px] text-muted-foreground">Actuel : {delaiJHM(total)} · par défaut : {delaiJHM(l.defaut * 60)}</p>
                            </div>
                            <DureeJHM minutes={total} disabled={!superviseur} libelle={l.label} onChange={min => majSla(l.cle, min)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={() => saveSlaTaches.mutate()} disabled={saveSlaTaches.isPending || !superviseur} className="gap-2 bg-primary text-primary-foreground">
                  <Save className="w-4 h-4" /> Enregistrer les SLA des tâches
                </Button>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5" /> Comment fonctionnent les SLA ?
              </p>
              <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                <li>Chaque étape déclenche un chronomètre à partir de son activation</li>
                <li>À 80% du délai : indicateur orange "Risque" affiché</li>
                <li>À 100% du délai : indicateur rouge "Retard" + motif requis pour avancer</li>
                <li>Les données alimentent le tableau de bord Performance</li>
              </ul>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="compagnies">
          <CompagniesMaritimes />
        </TabsContent>

        <TabsContent value="liens">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-4">
            <div>
              <h3 className="font-display font-semibold text-foreground mb-1">Liens & portails externes</h3>
              <p className="text-sm text-muted-foreground">Un bouton de redirection vers le site apparaît sur la sous-étape choisie (ex. soumission SGS, déclaration en douane).</p>
            </div>
            {liens.map((l, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded-xl bg-muted/40">
                <div className="md:col-span-4 space-y-1">
                  <Label className="text-[10px]">Sous-étape</Label>
                  <Select value={l.cle} onValueChange={v => setLiens(ls => ls.map((x, j) => j === i ? { ...x, cle: v } : x))}>
                    <SelectTrigger className="bg-card h-9 text-xs"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>{sousEtapes.map(se => <SelectItem key={se.cle} value={se.cle}>{se.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-[10px]">Libellé du bouton</Label>
                  <Input value={l.label} onChange={e => setLiens(ls => ls.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="bg-card h-9 text-xs" />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <Label className="text-[10px]">Adresse du site (https://…)</Label>
                  <Input value={l.url} onChange={e => setLiens(ls => ls.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} className={`bg-card h-9 text-xs font-mono ${l.url && !urlValide(l.url) ? "border-destructive" : ""}`} />
                </div>
                <Button variant="ghost" size="sm" className="md:col-span-1 h-9 text-destructive" onClick={() => setLiens(ls => ls.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLiens(ls => [...ls, { cle: "", label: "Ouvrir le portail", url: "https://" }])}><Plus className="w-3.5 h-3.5" /> Ajouter un lien</Button>
              <Button onClick={() => saveLiens.mutate()} disabled={!liensValides || saveLiens.isPending} className="gap-2 bg-primary text-primary-foreground"><Save className="w-4 h-4" /> Enregistrer les liens</Button>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="securite">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-foreground mb-1">Sécurité en place</h3>
            {[
              "Mots de passe chiffrés (bcrypt), 8 caractères minimum",
              "Sessions de 8 h renouvelées automatiquement ; changement de mot de passe = déconnexion des autres sessions",
              "Limitation des tentatives de connexion (anti-bruteforce)",
              "Accès par rôle : chaque page et chaque action sont vérifiées par le serveur",
              "Journal d'activité et historique complet de chaque dossier (Administration → Journal)",
              "Comptes désactivables sans perte d'historique",
            ].map(t => (
              <div key={t} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" /> {t}
              </div>
            ))}
          </motion.div>
        </TabsContent>

        <TabsContent value="general">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-foreground mb-1">Paramètres généraux</h3>
            <p className="text-sm text-muted-foreground">
              La fiche de l'entreprise (raison sociale, NIU, RCCM, devise, TVA…) se gère dans Administration → Entreprise.
              Les rôles et l'attribution des étapes se gèrent dans Administration → Rôles et Attribution des étapes.
            </p>
            {user?.profil === "dg" && (
              <Button variant="outline" onClick={() => navigate("/administration?onglet=entreprise")}>Ouvrir la fiche entreprise</Button>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Parametres;
