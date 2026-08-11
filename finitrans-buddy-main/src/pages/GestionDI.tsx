import { Fragment, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Banknote, Edit2, Trash2, Receipt,
  AlertTriangle, Loader2, FolderOpen, BarChart3,
  TrendingDown, ChevronDown, ChevronUp, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useDIList, useDIStats, useDIDelete, DIEnriched } from "@/hooks/useDI";
import { getStoredUser } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import DIBlock from "@/components/di/DIBlock";
import DICreateEditDialog from "@/components/di/DICreateEditDialog";
import FactureDialog from "@/components/di/FactureDialog";

const alerteClasses = (n: string) =>
  n === "critical" ? "bg-red-100 text-red-700 border-red-200" :
  n === "warning"  ? "bg-amber-100 text-amber-700 border-amber-200" :
  "bg-green-100 text-green-700 border-green-200";

const alerteLabel = (n: string) =>
  n === "critical" ? "Critique" : n === "warning" ? "Alerte" : "OK";

const barColor = (n: string) =>
  n === "critical" ? "bg-destructive" : n === "warning" ? "bg-warning" : "bg-success";

const GestionDI = () => {
  const navigate  = useNavigate();
  const user      = getStoredUser();
  const canEdit   = user?.permFinancier === "complet" || user?.permFinancier === "partiel";
  const canDelete = user?.permFinancier === "complet";
  const canRecharge = user?.permFinancier === "complet";

  const [search,       setSearch]       = useState("");
  const [filterAlerte, setFilterAlerte] = useState("all");
  const [page,         setPage]         = useState(1);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [createOpen,   setCreateOpen]   = useState(false);
  const [editDI,       setEditDI]       = useState<DIEnriched | null>(null);
  const [factureDI,    setFactureDI]    = useState<DIEnriched | null>(null);
  const [confirmDel,   setConfirmDel]   = useState<string | null>(null);

  const { data: diStats } = useDIStats();
  const { data: diList, isLoading } = useDIList({
    page,
    limit:  20,
    client: search || undefined,
    alerte: filterAlerte === "all" ? undefined : filterAlerte !== "ok",
  });

  const deleteDI = useDIDelete();

  const items: DIEnriched[] = diList?.data ?? [];
  const meta = diList?.meta ?? { total: 0, totalPages: 1 };

  const handleDelete = async (id: string) => {
    try {
      await deleteDI.mutateAsync(id);
      setConfirmDel(null);
      if (expandedId === id) setExpandedId(null);
    } catch { /* handled */ }
  };

  const totalMontantM = ((diStats?.totalMontant ?? 0) / 1_000_000).toFixed(1);
  const totalSoldeM   = ((diStats?.totalSolde   ?? 0) / 1_000_000).toFixed(1);

  return (
    <AppLayout
      title="Gestion DI"
      subtitle="Déclarations d'Importation — enveloppes budgétaires, factures, alertes"
    >
      {/* ── KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "DI actives",
            value: diStats?.totalActifs ?? 0,
            icon:  Banknote,
            color: "text-secondary",
            bg:    "bg-secondary/10",
            grad:  "from-orange-500/8",
            suffix: "",
          },
          {
            label: "Enveloppes totales",
            value: totalMontantM,
            icon:  BarChart3,
            color: "text-foreground",
            bg:    "bg-muted",
            grad:  "from-muted/30",
            suffix: "M FCFA",
          },
          {
            label: "Solde global restant",
            value: totalSoldeM,
            icon:  TrendingDown,
            color: "text-success",
            bg:    "bg-success/10",
            grad:  "from-green-500/8",
            suffix: "M FCFA",
          },
          {
            label: "DI en alerte",
            value: diStats?.diEnAlerte ?? 0,
            icon:  AlertTriangle,
            color: (diStats?.diEnAlerte ?? 0) > 0 ? "text-warning" : "text-success",
            bg:    (diStats?.diEnAlerte ?? 0) > 0 ? "bg-warning/10" : "bg-success/10",
            grad:  (diStats?.diEnAlerte ?? 0) > 0 ? "from-amber-500/8" : "from-green-500/8",
            suffix: "",
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            transition={{ delay: i * 0.07, type: "spring", stiffness: 200, damping: 24 }}
            className="stat-card relative overflow-hidden"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.grad} to-transparent pointer-events-none rounded-xl`} />
            <div className="relative">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className={`text-2xl font-display font-black ${s.color}`}>
                {s.value}
                {s.suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{s.suffix}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par client..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-xs">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={filterAlerte}
              onChange={e => { setFilterAlerte(e.target.value); setPage(1); }}
              className="bg-transparent border-0 text-foreground focus:outline-none text-xs"
            >
              <option value="all">Tous les états</option>
              <option value="warning">En alerte uniquement</option>
              <option value="ok">OK uniquement</option>
            </select>
          </div>
          {canEdit && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-primary text-primary-foreground font-semibold gap-2 hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Nouvelle DI
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="stat-card overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">N° DI</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dossiers</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Enveloppe</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Solde</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase min-w-[130px]">Utilisation</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">État</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((di, i) => (
                  <Fragment key={di.id}>
                    {/* ── Main row ──────────────────────────────── */}
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.025 }}
                      className={`border-b transition-colors cursor-pointer ${
                        expandedId === di.id ? "border-b-0 bg-muted/30" :
                        di.alerteNiveau === "critical" ? "border-border/50 bg-destructive/5 hover:bg-destructive/10" :
                        di.alerteNiveau === "warning"  ? "border-border/50 bg-warning/5 hover:bg-warning/10" :
                        "border-border/50 hover:bg-muted/30"
                      }`}
                      onClick={() => setExpandedId(prev => prev === di.id ? null : di.id)}
                    >
                      {/* N° DI */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-foreground">{di.numero}</span>
                          {expandedId === di.id
                            ? <ChevronUp   className="w-3.5 h-3.5 text-muted-foreground" />
                            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          }
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3.5 text-sm text-foreground">{di.client}</td>

                      {/* Dossiers */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {(di.dossiers ?? []).slice(0, 2).map((d: any) => (
                            <span
                              key={d.id}
                              onClick={e => { e.stopPropagation(); navigate(`/dossiers/${d.id}`); }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors cursor-pointer"
                            >
                              <FolderOpen className="w-2.5 h-2.5" />
                              {d.numero ?? d.id?.slice(0, 6)}
                            </span>
                          ))}
                          {(di.dossiers ?? []).length > 2 && (
                            <span className="text-[10px] text-muted-foreground self-center">
                              +{(di.dossiers?.length ?? 0) - 2}
                            </span>
                          )}
                          {(di.dossiers ?? []).length === 0 && (
                            <span className="text-[10px] text-muted-foreground/50 italic">Aucun</span>
                          )}
                        </div>
                      </td>

                      {/* Enveloppe */}
                      <td className="px-4 py-3.5 text-sm text-right font-display font-bold text-foreground">
                        {di.montantNum.toLocaleString("fr-FR")}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">{di.devise ?? "XAF"}</span>
                      </td>

                      {/* Solde */}
                      <td className={`px-4 py-3.5 text-sm text-right font-display font-black ${
                        di.alerteNiveau === "critical" ? "text-destructive" :
                        di.alerteNiveau === "warning"  ? "text-warning"    : "text-success"
                      }`}>
                        {di.soldeNum.toLocaleString("fr-FR")}
                      </td>

                      {/* Utilisation */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${barColor(di.alerteNiveau)}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(di.tauxUtilise, 100)}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground w-8 text-right flex-shrink-0">
                            {Math.round(di.tauxUtilise)}%
                          </span>
                        </div>
                      </td>

                      {/* État */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`status-badge border ${alerteClasses(di.alerteNiveau)}`}>
                          {alerteLabel(di.alerteNiveau)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          {canEdit && (
                            <button
                              title="Ajouter une facture"
                              onClick={() => setFactureDI(di)}
                              className="w-7 h-7 rounded-lg hover:bg-secondary/10 flex items-center justify-center text-muted-foreground hover:text-secondary transition-colors"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              title="Modifier"
                              onClick={() => setEditDI(di)}
                              className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            confirmDel === di.id ? (
                              <div className="flex items-center gap-1 bg-destructive/10 rounded-lg px-2 py-1">
                                <span className="text-[10px] text-destructive font-medium">Confirmer ?</span>
                                <button
                                  onClick={() => handleDelete(di.id)}
                                  disabled={deleteDI.isPending}
                                  className="text-[10px] font-bold text-destructive hover:underline"
                                >
                                  {deleteDI.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Oui"}
                                </button>
                                <button
                                  onClick={() => setConfirmDel(null)}
                                  className="text-[10px] text-muted-foreground hover:underline"
                                >Non</button>
                              </div>
                            ) : (
                              <button
                                title="Supprimer"
                                onClick={() => setConfirmDel(di.id)}
                                className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </motion.tr>

                    {/* ── Expanded DIBlock ───────────────────────── */}
                    {expandedId === di.id && (
                      <tr className="border-b border-border">
                        <td colSpan={8} className="p-4 bg-muted/20">
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22 }}
                          >
                            <DIBlock
                              diId={di.id}
                              canEdit={canEdit}
                              canRecharge={canRecharge}
                              defaultExpanded
                            />
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                      <Banknote className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm font-medium">Aucune DI enregistrée</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {search ? "Aucun résultat pour cette recherche" : "Créez votre première déclaration d'importation"}
                      </p>
                      {canEdit && !search && (
                        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
                          <Plus className="w-3.5 h-3.5" /> Créer la première DI
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────── */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {meta.total} DI · Page {page} / {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1}             onClick={() => setPage(p => p - 1)}>Précédent</Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      <DICreateEditDialog
        open={createOpen || !!editDI}
        onClose={() => { setCreateOpen(false); setEditDI(null); }}
        di={editDI ?? undefined}
      />

      {factureDI && (
        <FactureDialog
          open
          onClose={() => setFactureDI(null)}
          diId={factureDI.id}
          diNumero={factureDI.numero}
          soldeActuel={factureDI.soldeNum}
          devise={factureDI.devise}
        />
      )}
    </AppLayout>
  );
};

export default GestionDI;
