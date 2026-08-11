import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, Filter, Ship, MapPin, ChevronRight, LayoutGrid, List, AlertTriangle, Loader2, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import NouveauDossierDialog from "@/components/NouveauDossierDialog";
import KanbanView from "@/components/KanbanView";

const STATUS_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "Soumission SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon Compagnie",
  operations_kribi: "Ops Kribi",
  cloture:          "Clôturé",
};

const STATUS_COLORS: Record<string, string> = {
  reception:        "bg-blue-100 text-blue-700",
  soumission_sgs:   "bg-indigo-100 text-indigo-700",
  codage:           "bg-purple-100 text-purple-700",
  validation:       "bg-amber-100 text-amber-700",
  paiement:         "bg-orange-100 text-orange-700",
  bon_compagnie:    "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700",
  cloture:          "bg-gray-100 text-gray-600",
};

const Dossiers = () => {
  const navigate = useNavigate();
  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterCompagnie, setFilterCompagnie] = useState("all");
  const [filterSite, setFilterSite]       = useState("all");
  const [filterPriorite, setFilterPriorite] = useState("all");
  const [viewMode, setViewMode]           = useState<"list" | "kanban">("list");
  const [page, setPage]                   = useState(1);

  const params = new URLSearchParams({ page: String(page), limit: "25" });
  if (search)          params.set("search",    search);
  if (filterStatus !== "all")    params.set("status",    filterStatus);
  if (filterCompagnie !== "all") params.set("compagnie", filterCompagnie);
  if (filterSite !== "all")      params.set("site",      filterSite);
  if (filterPriorite !== "all")  params.set("priorite",  filterPriorite);

  const { data, isLoading } = useQuery({
    queryKey: ["dossiers", search, filterStatus, filterCompagnie, filterSite, filterPriorite, page],
    queryFn:  () => api.get<any>(`/api/dossiers?${params}`),
    placeholderData: (prev) => prev,
  });

  const dossiers    = data?.data ?? [];
  const total       = data?.total ?? 0;
  const totalPages  = data?.totalPages ?? 1;

  const resetFilters = () => {
    setFilterStatus("all");
    setFilterCompagnie("all");
    setFilterSite("all");
    setFilterPriorite("all");
    setSearch("");
    setPage(1);
  };

  return (
    <AppLayout title="Gestion des Dossiers" subtitle={`${total} dossiers au total`}>
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par numéro, client, conteneur..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 bg-card border-border"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex border border-border rounded-lg overflow-hidden">
              <button onClick={() => setViewMode("list")} className={`p-2 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("kanban")} className={`p-2 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <NouveauDossierDialog />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
          </select>
          <select value={filterCompagnie} onChange={(e) => { setFilterCompagnie(e.target.value); setPage(1); }} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
            <option value="all">Toutes compagnies</option>
            <option value="MSC">MSC</option>
            <option value="COSCO">COSCO</option>
            <option value="MAERSK">MAERSK</option>
            <option value="CMA_CGM">CMA-CGM</option>
          </select>
          <select value={filterSite} onChange={(e) => { setFilterSite(e.target.value); setPage(1); }} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
            <option value="all">Tous sites</option>
            <option value="Douala">Douala</option>
            <option value="Kribi">Kribi</option>
          </select>
          <select value={filterPriorite} onChange={(e) => { setFilterPriorite(e.target.value); setPage(1); }} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
            <option value="all">Toutes priorités</option>
            <option value="haute">Haute</option>
            <option value="moyenne">Moyenne</option>
            <option value="basse">Basse</option>
          </select>
          {(filterStatus !== "all" || filterCompagnie !== "all" || filterSite !== "all" || filterPriorite !== "all" || search) && (
            <button onClick={resetFilters} className="text-xs text-secondary hover:underline px-2">Réinitialiser</button>
          )}
          <span className="ml-auto text-xs text-muted-foreground self-center">{total} résultat{total > 1 ? "s" : ""}</span>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <KanbanView />
      ) : (
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
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">N° Dossier</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compagnie</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conteneur</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Responsable</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Site</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priorité</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {dossiers.map((d: any, i: number) => {
                    const enRetard = d.dateLimiteSortie && new Date(d.dateLimiteSortie) < new Date() && d.status !== "cloture";
                    return (
                      <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${enRetard ? "bg-destructive/5" : ""}`}
                        onClick={() => navigate(`/dossiers/${d.id}`)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {enRetard && <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                            <span className={`text-sm font-semibold ${enRetard ? "text-destructive" : "text-foreground"}`}>{d.numero}</span>
                            {d.diId && (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                                d.di?.alerteNiveau === "critical" ? "bg-red-100 text-red-700" :
                                d.di?.alerteNiveau === "warning"  ? "bg-amber-100 text-amber-700" :
                                "bg-secondary/10 text-secondary"
                              }`}>
                                <Banknote className="w-2.5 h-2.5" /> DI
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-foreground">{d.client}</td>
                        <td className="px-5 py-3.5"><span className="text-sm font-medium text-foreground">{d.compagnie.replace("_", "-")}</span></td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground font-mono text-xs">{d.conteneur}</td>
                        <td className="px-5 py-3.5">
                          {enRetard ? (
                            <span className="status-badge bg-red-100 text-red-700">EN RETARD</span>
                          ) : (
                            <span className={`status-badge ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[d.status] ?? d.status}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-foreground">{d.responsable?.nom ?? "—"}</td>
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            {d.site === "Kribi" ? <MapPin className="w-3 h-3" /> : <Ship className="w-3 h-3" />}{d.site}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`status-badge ${d.priorite === "haute" ? "bg-red-100 text-red-700" : d.priorite === "moyenne" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{d.priorite}</span>
                        </td>
                        <td className="px-5 py-3.5"><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              {dossiers.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun dossier trouvé</p>
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
};

export default Dossiers;
