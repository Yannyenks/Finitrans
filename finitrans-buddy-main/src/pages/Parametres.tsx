import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Settings, Bell, Shield, Database, Globe, Save, Timer, Users, ChevronRight } from "lucide-react";
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
  bon_compagnie:    "Bon Compagnie",
  operations_kribi: "Kribi",
  cloture:          "Clôture",
};

const DEFAULT_SLA: Record<string, number> = {
  reception:        24,
  soumission_sgs:   48,
  codage:           24,
  validation:       48,
  paiement:         72,
  bon_compagnie:    48,
  operations_kribi: 72,
  cloture:          24,
};

const Parametres = () => {
  const qc = useQueryClient();
  const { data: configData } = useQuery({
    queryKey: ["alertes-config"],
    queryFn:  () => api.get<any[]>("/api/alertes/config"),
  });
  const [alerts, setAlerts] = useState<any[]>([]);
  useEffect(() => { if (configData) setAlerts(configData); }, [configData]);

  // SLA local state (stored in localStorage for persistence)
  const [slaConfig, setSlaConfig] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("finitrans_sla_config");
      return saved ? { ...DEFAULT_SLA, ...JSON.parse(saved) } : DEFAULT_SLA;
    } catch { return DEFAULT_SLA; }
  });

  const saveSlaConfig = () => {
    localStorage.setItem("finitrans_sla_config", JSON.stringify(slaConfig));
    toast({ title: "SLA sauvegardés", description: "Les délais cibles ont été mis à jour." });
  };

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

        <TabsContent value="sla">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-1">Délais SLA par étape</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Définissez le temps cible (en heures) pour chaque étape du workflow dossier.
              Le système signale automatiquement les dépassements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {Object.entries(slaConfig).map(([step, h]) => (
                <div key={step} className="flex items-center gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/50">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{STEP_LABELS[step] ?? step}</p>
                    <p className="text-xs text-muted-foreground">Délai cible actuel : <span className="font-mono font-semibold">{h}h</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={h}
                      onChange={e => setSlaConfig(prev => ({ ...prev, [step]: Number(e.target.value) || 1 }))}
                      className="w-16 text-center bg-card font-mono text-sm h-9"
                    />
                    <span className="text-xs text-muted-foreground w-3">h</span>
                  </div>
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
              <Button onClick={saveSlaConfig} className="gap-2 bg-primary text-primary-foreground">
                <Save className="w-4 h-4" /> Enregistrer les SLA
              </Button>
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

        <TabsContent value="securite">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-4">
            <h3 className="font-display font-semibold text-foreground mb-1">Politique de sécurité</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Double authentification (2FA)</p>
                  <p className="text-xs text-muted-foreground">Ajouter une couche de sécurité supplémentaire</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Expiration mot de passe</p>
                  <p className="text-xs text-muted-foreground">Forcer le changement tous les 90 jours</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Journal d'audit</p>
                  <p className="text-xs text-muted-foreground">Enregistrer toutes les actions utilisateurs</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Sauvegarde automatique</p>
                  <p className="text-xs text-muted-foreground">Sauvegarde quotidienne des données</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="general">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-4">
            <h3 className="font-display font-semibold text-foreground mb-1">Paramètres généraux</h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium text-foreground mb-2">Nom de l'entreprise</p>
                <Input defaultValue="FINITRANS — Transit & Dédouanement" className="bg-card" />
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium text-foreground mb-2">Devise par défaut</p>
                <Input defaultValue="FCFA" className="bg-card w-32" />
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium text-foreground mb-2">Fuseau horaire</p>
                <Input defaultValue="Africa/Douala (UTC+1)" className="bg-card" disabled />
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium text-foreground mb-2">Format numéro dossier</p>
                <Input defaultValue="DOS-{ANNEE}-{SEQUENCE}" className="bg-card font-mono text-sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} className="gap-2 bg-primary text-primary-foreground">
                <Save className="w-4 h-4" /> Enregistrer
              </Button>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Parametres;
