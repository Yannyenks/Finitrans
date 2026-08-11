import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useDIList, useDIStats, useDICreate, DIEnriched } from "@/hooks/useDI";
import { getStoredUser } from "@/lib/api";
import {
  Banknote, Plus, Search, Filter, AlertTriangle, ShieldAlert,
  ChevronRight, Loader2, RefreshCw, TrendingDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import DIForm from "@/components/di/DIForm";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, devise = "FCFA") => `${n.toLocaleString("fr-FR")} ${devise}`;

const alerteColor = (n: string) =>
  n === "critical" ? { bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700", bar: "#ef4444" } :
  n === "warning"  ? { bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", bar: "#f59e0b" } :
                     { bg: "", badge: "bg-green-100 text-green-700", bar: "#22c55e" };

const statutBadge: Record<string, string> = {
  actif:    "bg-green-100 text-green-700",
  cloture:  "bg-gray-100 text-gray-600",
  suspendu: "bg-amber-100 text-amber-700",
};

// ── DI Card ───────────────────────────────────────────────────────────────────

const DICard = ({ di }: { di: DIEnriched }) => {
  const navigate = useNavigate();
  const cls      = alerteColor(di.alerteNiveau);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      onClick={() => navigate(`/di/${di.id}`)}
      className={`stat-card cursor-pointer transition-shadow hover:shadow-md border ${cls.bg} relative overflow-hidden`}
    >
      {/* Colored left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ background: cls.bar }} />

      <div className="pl-2">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-display font-bold text-foreground">{di.numero}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statutBadge[di.statut]}`}>
                {di.statut === "actif" ? "Actif" : di.statut === "cloture" ? "Clôturé" : "Suspendu"}
              </span>
              {di.alerteNiveau !== "ok" && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls.badge}`}>
                  <ShieldAlert className="w-2.5 h-2.5" />
                  {di.alerteNiveau === "critical" ? "CRITIQUE" : "ALERTE"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{di.client}</p>
            {di.gestionnaire && (
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Gestionnaire : {di.gestionnaire.nom}</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5" />
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{Math.round(di.tauxUtilise)}% utilisé</span>
            <span>{Math.round(di.tauxRestant)}% restant</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(di.tauxUtilise, 100)}%`, background: cls.bar }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-background/60 rounded-lg py-1.5 px-1">
            <p className="text-[10px] text-muted-foreground mb-0.5">Enveloppe</p>
            <p className="text-xs font-semibold text-foreground">
              {(di.montantNum / 1_000_000).toFixed(1)}M
            </p>
          </div>
          <div className="bg-background/60 rounded-lg py-1.5 px-1">
            <p className="text-[10px] text-muted-foreground mb-0.5">Utilisé</p>
            <p className="text-xs font-semibold text-orange-500">
              {(di.utiliseNum / 1_000_000).toFixed(1)}M
            </p>
          </div>
          <div className="bg-background/60 rounded-lg py-1.5 px-1">
            <p className="text-[10px] text-muted-foreground mb-0.5">Solde</p>
            <p className={`text-xs font-semibold ${
              di.alerteNiveau === "critical" ? "text-red-600" :
              di.alerteNiveau === "warning"  ? "text-amber-600" : "text-success"
            }`}>
              {(di.soldeNum / 1_000_000).toFixed(1)}M
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── Stats banner ──────────────────────────────────────────────────────────────

const StatsBanner = () => {
  const { data: stats } = useDIStats();
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { label: "DI actives",      val: stats.totalDI,          icon: Banknote,      color: "text-secondary"  },
        { label: "Enveloppe totale",val: fmt(stats.totalMontant), icon: TrendingDown,  color: "text-foreground" },
        { label: "Solde disponible",val: fmt(stats.totalSolde),   icon: RefreshCw,     color: "text-success"    },
        { label: "En alerte",       val: stats.diEnAlerte,        icon: AlertTriangle, color: "text-amber-500"  },
      ].map(({ label, val, icon: Icon, color }) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card"
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <p className={`text-lg font-display font-black ${color}`}>{val}</p>
        </motion.div>
      ))}
    </div>
  );
};

// ── Page DI ───────────────────────────────────────────────────────────────────

export default function DI() {
  const user        = getStoredUser();
  const canCreate   = user?.permFinancier === "complet" || user?.permFinancier === "partiel";
  const navigate    = useNavigate();

  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState("");
  const [statut,     setStatut]     = useState("all");
  const [alerte,     setAlerte]     = useState<boolean | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isFetching } = useDIList({
    page,
    limit:  12,
    client: search || undefined,
    statut: statut !== "all" ? statut : undefined,
    alerte,
  });

  const dis          = data?.data       ?? [];
  const totalPages   = data?.meta?.totalPages ?? 1;
  const total        = data?.meta?.total      ?? 0;
  const hasAlerts    = dis.some(d => d.alerteNiveau !== "ok");

  return (
    <AppLayout title="Déclarations d'Importation" subtitle={`${total} DI${total > 1 ? "s" : ""} au total`}>

      <StatsBanner />

      {/* ── Alert banner ─────────────────────────────────────── */}
      {hasAlerts && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 mb-5"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {dis.filter(d => d.alerteNiveau === "critical").length > 0
              ? `${dis.filter(d => d.alerteNiveau === "critical").length} DI en solde critique — action requise`
              : `${dis.filter(d => d.alerteNiveau !== "ok").length} DI en alerte de solde`}
          </p>
          <button
            onClick={() => setAlerte(true)}
            className="ml-auto text-xs text-amber-700 hover:underline font-semibold"
          >
            Voir uniquement les alertes
          </button>
        </motion.div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par client..."
            className="pl-9 h-9 bg-muted/40 text-sm"
          />
        </div>

        <Select value={statut} onValueChange={v => { setStatut(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36 bg-muted/40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="cloture">Clôturé</SelectItem>
            <SelectItem value="suspendu">Suspendu</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={alerte ? "default" : "outline"}
          size="sm"
          onClick={() => { setAlerte(alerte ? undefined : true); setPage(1); }}
          className="h-9 gap-1.5 text-sm"
        >
          <Filter className="w-3.5 h-3.5" />
          {alerte ? "Toutes" : "En alerte"}
          {alerte && <X className="w-3 h-3" />}
        </Button>

        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

        {canCreate && (
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="ml-auto gap-1.5 text-sm h-9"
            style={{ background: "linear-gradient(135deg, #F07B37, #e86d28)", color: "white", border: "none" }}
          >
            <Plus className="w-4 h-4" />
            Nouvelle DI
          </Button>
        )}
      </div>

      {/* ── Create form ──────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="stat-card mb-6 overflow-hidden"
          >
            <DIForm
              mode="create"
              onSuccess={(data) => {
                setShowCreate(false);
                if (data?.id) navigate(`/di/${data.id}`);
              }}
              onCancel={() => setShowCreate(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Grid ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-secondary" />
        </div>
      ) : dis.length === 0 ? (
        <div className="text-center py-20">
          <Banknote className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Aucune DI trouvée</p>
          {canCreate && (
            <Button onClick={() => setShowCreate(true)} variant="outline" className="mt-3 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Créer la première DI
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {dis.map(di => <DICard key={di.id} di={di} />)}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Suivant
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
