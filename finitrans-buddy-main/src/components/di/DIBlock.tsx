import { useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote, ShieldAlert, TrendingDown, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Activity,
  ArrowDownRight, ArrowUpRight, BarChart3, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDI, DIEnriched, DIAlerteNiveau } from "@/hooks/useDI";
import DIForm from "./DIForm";
import DIHistorique from "./DIHistorique";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, devise = "FCFA") =>
  `${n.toLocaleString("fr-FR")} ${devise}`;

const alerteColor = (n: DIAlerteNiveau) =>
  n === "critical" ? "#ef4444" : n === "warning" ? "#f59e0b" : "#22c55e";

const alerteClasses = (n: DIAlerteNiveau) => ({
  badge: n === "critical" ? "bg-red-100 text-red-700"   : n === "warning" ? "bg-amber-100 text-amber-700"   : "bg-green-100 text-green-700",
  text:  n === "critical" ? "text-red-600"               : n === "warning" ? "text-amber-600"                 : "text-success",
  bar:   n === "critical" ? "from-red-500 to-red-600"    : n === "warning" ? "from-amber-400 to-orange-500"   : "from-green-400 to-green-500",
  band:  n === "critical" ? "from-red-500 to-red-600"    : n === "warning" ? "from-amber-400 to-orange-500"   : "from-green-400 to-green-500",
});

// ── Circular gauge ────────────────────────────────────────────────────────────

const Gauge = ({ pct, color }: { pct: number; color: string }) => {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <svg viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor"
        strokeWidth="9" className="text-muted/30" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 1.2s ease" }}
      />
      <text x="50" y="45" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="14" fontWeight="800" fontFamily="inherit">
        {Math.round(pct)}%
      </text>
      <text x="50" y="61" textAnchor="middle" dominantBaseline="middle"
        fill="currentColor" fontSize="7" opacity={0.45} fontFamily="inherit">
        utilisé
      </text>
    </svg>
  );
};

// ── DIBlock ───────────────────────────────────────────────────────────────────

interface DIBlockProps {
  diId:          string;
  canEdit?:      boolean;
  canRecharge?:  boolean;
  defaultExpanded?: boolean;
}

export default function DIBlock({
  diId, canEdit = false, canRecharge = false, defaultExpanded = true,
}: DIBlockProps) {
  const { di, dashboard, isLoading } = useDI(diId);
  const [expanded, setExpanded]      = useState(defaultExpanded);
  const [showForm, setShowForm]      = useState<"recharge" | null>(null);
  const [showHistorique, setShowHistorique] = useState(false);

  if (isLoading) {
    return (
      <div className="stat-card animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="h-24 bg-muted/50 rounded" />
      </div>
    );
  }

  if (!di) return null;

  const niveau  = di.alerteNiveau;
  const cls     = alerteClasses(niveau);
  const color   = alerteColor(niveau);
  const devise  = di.devise ?? "FCFA";
  const previsions = dashboard?.previsions;

  return (
    <div className="stat-card overflow-hidden relative">
      {/* Top accent band */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${cls.band}`} />

      <div className="pt-1">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-6 h-6 rounded-md bg-secondary/15 flex items-center justify-center">
                <Banknote className="w-3.5 h-3.5 text-secondary" />
              </div>
              <span className="text-sm font-display font-bold text-foreground">Déclaration d'Importation</span>
            </div>
            <div className="flex items-center gap-1.5 pl-8">
              <span className="text-xs font-mono text-muted-foreground">{di.numero}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls.badge}`}>
                {di.statut === "actif" ? "Actif" : di.statut === "cloture" ? "Clôturé" : "Suspendu"}
              </span>
              {niveau !== "ok" && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls.badge}`}>
                  <ShieldAlert className="w-2.5 h-2.5" />
                  {niveau === "critical" ? "CRITIQUE" : "ALERTE"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {canRecharge && di.statut === "actif" && (
              <Button size="sm" variant="outline"
                className="h-7 text-xs gap-1 px-2"
                onClick={() => setShowForm(showForm ? null : "recharge")}>
                <Settings2 className="w-3 h-3" />
                Ajuster
              </Button>
            )}
            <button onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ── Solde hero ──────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Solde disponible</p>
            <p className={`text-2xl font-display font-black ${cls.text}`}>
              {fmt(di.soldeNum, devise)}
            </p>
          </div>
          <Gauge pct={di.tauxUtilise} color={color} />
        </div>

        {/* ── Progress bar with thresholds ────────────────────── */}
        <div className="mb-1">
          <div className="relative h-2 rounded-full bg-muted overflow-visible mb-1">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(di.tauxUtilise, 100)}%` }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${cls.bar}`}
            />
            {/* Threshold markers */}
            {[
              { pct: 100 - di.seuilAlerte1, color: "#f59e0b", label: `Alerte ${di.seuilAlerte1}%` },
              { pct: 100 - di.seuilAlerte2, color: "#ef4444", label: `Critique ${di.seuilAlerte2}%` },
            ].map((m) => (
              <div key={m.pct}
                title={m.label}
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full"
                style={{ left: `${m.pct}%`, background: m.color }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span className="text-amber-500 font-medium">⚠ {100 - di.seuilAlerte1}%</span>
            <span className="text-red-500 font-medium">🔴 {100 - di.seuilAlerte2}%</span>
            <span>100%</span>
          </div>
        </div>

        {/* ── Expanded content ─────────────────────────────────── */}
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 mt-4"
          >
            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Enveloppe totale", val: di.montantNum, icon: BarChart3,      cls: "text-muted-foreground" },
                { label: "Montant utilisé",  val: di.utiliseNum,  icon: ArrowDownRight, cls: "text-orange-500"       },
                { label: "Solde restant",    val: di.soldeNum,    icon: ArrowUpRight,   cls: cls.text                },
              ].map(({ label, val, icon: Icon, cls: c }) => (
                <div key={label} className="bg-muted/50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <Icon className={`w-3 h-3 ${c}`} />
                    <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
                  </div>
                  <p className={`text-sm font-display font-bold ${c}`}>
                    {val.toLocaleString("fr-FR")}
                    <span className="text-[10px] font-normal ml-0.5 text-muted-foreground">{devise}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Prévisions */}
            {previsions && (
              <div className="grid grid-cols-2 gap-2">
                {previsions.joursRestants !== null && (
                  <div className="bg-muted/50 rounded-lg p-2.5 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Jours restants</p>
                      <p className="text-sm font-display font-bold text-foreground">
                        {previsions.joursRestants} j
                      </p>
                    </div>
                  </div>
                )}
                {previsions.tauxConsoJournalier > 0 && (
                  <div className="bg-muted/50 rounded-lg p-2.5 flex items-center gap-2">
                    <TrendingDown className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Conso / jour</p>
                      <p className="text-sm font-display font-bold text-foreground">
                        {previsions.tauxConsoJournalier.toLocaleString("fr-FR")} {devise}
                      </p>
                    </div>
                  </div>
                )}
                {previsions.dateRupture && (
                  <div className={`rounded-lg p-2.5 flex items-center gap-2 col-span-2 ${
                    previsions.alertePrevisionnel ? "bg-red-50 border border-red-200" : "bg-muted/50"
                  }`}>
                    <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${
                      previsions.alertePrevisionnel ? "text-red-500" : "text-muted-foreground"
                    }`} />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Rupture prévisionnelle</p>
                      <p className={`text-sm font-display font-bold ${
                        previsions.alertePrevisionnel ? "text-red-600" : "text-foreground"
                      }`}>
                        {new Date(previsions.dateRupture).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mini mouvements */}
            {di.mouvements && di.mouvements.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-secondary" />
                    <span className="text-xs font-semibold text-foreground">Derniers mouvements</span>
                  </div>
                  <button
                    onClick={() => setShowHistorique(!showHistorique)}
                    className="text-[10px] text-secondary hover:underline"
                  >
                    {showHistorique ? "Masquer" : "Voir tout"}
                  </button>
                </div>
                {!showHistorique ? (
                  <div className="space-y-1">
                    {di.mouvements.slice(0, 4).map((m) => (
                      <div key={m.id}
                        className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            m.type === "debit" ? "bg-red-400" : "bg-green-400"
                          }`} />
                          <span className="text-muted-foreground truncate max-w-[150px]">{m.motif}</span>
                          {m.dossier?.numero && (
                            <span className="text-secondary font-mono text-[10px] flex-shrink-0">
                              {m.dossier.numero}
                            </span>
                          )}
                        </div>
                        <span className={`font-semibold font-mono flex-shrink-0 ml-2 ${
                          m.type === "debit" ? "text-red-600" : "text-green-600"
                        }`}>
                          {m.type === "debit" ? "−" : "+"}{Number(m.montant).toLocaleString("fr-FR")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <DIHistorique mouvements={di.mouvements} devise={devise} />
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Recharge form ────────────────────────────────────── */}
        {showForm === "recharge" && canRecharge && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 pt-4 border-t border-border"
          >
            <DIForm
              mode="recharge"
              diId={diId}
              soldeActuel={di.soldeNum}
              devise={devise}
              onSuccess={() => setShowForm(null)}
              onCancel={() => setShowForm(null)}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
