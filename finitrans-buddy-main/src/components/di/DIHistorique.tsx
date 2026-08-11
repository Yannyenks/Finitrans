import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { DIMovement } from "@/hooks/useDI";

const CATEGORIE_LABELS: Record<string, string> = {
  droits_douane:  "Droits de douane",
  tva:            "TVA",
  honoraires:     "Honoraires",
  redevances:     "Redevances",
  penalites:      "Pénalités",
  frais_divers:   "Frais divers",
  remboursement:  "Remboursement",
  ouverture:      "Ouverture DI",
};

interface DIHistoriqueProps {
  mouvements: DIMovement[];
  devise?:    string;
  compact?:   boolean;
}

export default function DIHistorique({
  mouvements, devise = "FCFA", compact = false,
}: DIHistoriqueProps) {
  if (mouvements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Aucun mouvement enregistré
      </p>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        {mouvements.map((m) => (
          <div key={m.id}
            className="flex items-center justify-between text-xs px-2.5 py-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                m.type === "debit" ? "bg-red-400" : "bg-green-400"
              }`} />
              <div className="min-w-0">
                <p className="text-muted-foreground truncate max-w-[160px]">{m.motif}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {CATEGORIE_LABELS[m.categorie] ?? m.categorie}
                  {m.dossier?.numero ? ` · ${m.dossier.numero}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <span className={`font-semibold font-mono ${
                m.type === "debit" ? "text-red-600" : "text-green-600"
              }`}>
                {m.type === "debit" ? "−" : "+"}{Number(m.montant).toLocaleString("fr-FR")}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {new Date(m.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Catégorie</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Motif</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Dossier</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Montant ({devise})</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Par</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
          </tr>
        </thead>
        <tbody>
          {mouvements.map((m, i) => (
            <tr key={m.id}
              className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${
                i % 2 === 0 ? "" : "bg-muted/10"
              }`}>
              <td className="px-3 py-2.5">
                <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  m.type === "debit"
                    ? "bg-red-50 text-red-700"
                    : "bg-green-50 text-green-700"
                }`}>
                  {m.type === "debit"
                    ? <ArrowDownRight className="w-3 h-3" />
                    : <ArrowUpRight   className="w-3 h-3" />
                  }
                  {m.type === "debit" ? "Débit" : "Crédit"}
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {CATEGORIE_LABELS[m.categorie] ?? m.categorie}
              </td>
              <td className="px-3 py-2.5 text-xs text-foreground max-w-[200px] truncate" title={m.motif}>
                {m.motif}
              </td>
              <td className="px-3 py-2.5">
                {m.dossier?.numero
                  ? <span className="text-xs font-mono text-secondary">{m.dossier.numero}</span>
                  : <span className="text-xs text-muted-foreground">—</span>
                }
              </td>
              <td className={`px-3 py-2.5 text-right font-mono font-semibold text-sm ${
                m.type === "debit" ? "text-red-600" : "text-green-600"
              }`}>
                {m.type === "debit" ? "−" : "+"}{Number(m.montant).toLocaleString("fr-FR")}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {m.auteur?.nom ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(m.createdAt).toLocaleString("fr-FR", {
                  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/20">
            <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
              {mouvements.length} opération{mouvements.length > 1 ? "s" : ""}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-sm">
              <span className="text-red-600">
                −{mouvements
                  .filter(m => m.type === "debit")
                  .reduce((s, m) => s + Number(m.montant), 0)
                  .toLocaleString("fr-FR")}
              </span>
              {" / "}
              <span className="text-green-600">
                +{mouvements
                  .filter(m => m.type === "credit")
                  .reduce((s, m) => s + Number(m.montant), 0)
                  .toLocaleString("fr-FR")}
              </span>
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
