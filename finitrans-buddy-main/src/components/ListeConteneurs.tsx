import { Plus, Trash2, Container, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Tailles de conteneurs proposées */
export const TAILLES_CONTENEUR = ["20' Dry", "40' Dry", "40' HC", "45' HC", "20' Reefer", "40' Reefer", "20' Open Top", "40' Open Top", "20' Flat Rack", "40' Flat Rack", "Citerne (ISO tank)", "Vrac / hors conteneur"];

export type LigneConteneur = { numero: string; taille: string };

/** Conteneur ISO : 4 lettres + 7 chiffres (ex. MSCU1234567) */
const formatTC = (v: string) => /^[A-Z]{4}\d{7}$/.test(v);

/** Résumé « 2 × 40' HC · 1 × 20' Dry » */
export function resumeConteneurs(lignes: LigneConteneur[]): string {
  const parTaille = new Map<string, number>();
  for (const l of lignes) if (l.numero.trim()) parTaille.set(l.taille || "taille ?", (parTaille.get(l.taille || "taille ?") ?? 0) + 1);
  return [...parTaille].map(([t, n]) => `${n} × ${t}`).join(" · ");
}

/** Saisie des conteneurs d'un dossier : chaque conteneur a son numéro et sa propre taille. */
export function ListeConteneurs({ lignes, onChange }: { lignes: LigneConteneur[]; onChange: (l: LigneConteneur[]) => void }) {
  const maj = (i: number, p: Partial<LigneConteneur>) => onChange(lignes.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const ajouter = () => onChange([...lignes, { numero: "", taille: lignes[lignes.length - 1]?.taille ?? "" }]);
  const retirer = (i: number) => onChange(lignes.length > 1 ? lignes.filter((_, j) => j !== i) : [{ numero: "", taille: "" }]);
  // Coller une liste de numéros (« MSCU1234567, MSCU7654321 … ») dans une case : une ligne par conteneur
  const coller = (i: number, texte: string) => {
    const nums = texte.toUpperCase().split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (nums.length < 2) return false;
    const taille = lignes[i]?.taille ?? "";
    onChange([...lignes.slice(0, i), ...nums.map(numero => ({ numero, taille })), ...lignes.slice(i + 1)]);
    return true;
  };
  const resume = resumeConteneurs(lignes);
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border/50">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Container className="w-3.5 h-3.5 text-secondary" /> Conteneurs ({lignes.filter(l => l.numero.trim()).length}) *
        </p>
        {resume && <p className="text-[11px] text-muted-foreground truncate">{resume}</p>}
      </div>
      <div className="divide-y divide-border/40">
        {lignes.map((l, i) => (
          <div key={i} className="grid grid-cols-[1.6rem_1fr_minmax(0,9.5rem)_2rem] items-center gap-2 px-3 py-2" data-testid="ligne-conteneur">
            <span className="text-[11px] font-mono text-muted-foreground text-center">{i + 1}</span>
            <div className="min-w-0">
              <Input value={l.numero} placeholder="MSCU1234567" aria-label={`N° du conteneur ${i + 1}`}
                onChange={e => maj(i, { numero: e.target.value.toUpperCase().replace(/\s/g, "") })}
                onPaste={e => { if (coller(i, e.clipboardData.getData("text"))) e.preventDefault(); }}
                className={`h-9 bg-muted/50 font-mono text-sm ${l.numero && !formatTC(l.numero) ? "border-amber-400" : ""}`} />
            </div>
            <Select value={l.taille} onValueChange={v => maj(i, { taille: v })}>
              <SelectTrigger className="h-9 bg-muted/50 text-xs" aria-label={`Taille du conteneur ${i + 1}`}><SelectValue placeholder="Taille…" /></SelectTrigger>
              <SelectContent>{TAILLES_CONTENEUR.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <button type="button" onClick={() => retirer(i)} aria-label={`Retirer le conteneur ${i + 1}`}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-border/50 bg-muted/20">
        <button type="button" onClick={ajouter} className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline">
          <Plus className="w-3.5 h-3.5" /> Ajouter un conteneur
        </button>
        {lignes.length > 1 && lignes[0].taille && (
          <button type="button" onClick={() => onChange(lignes.map(l => ({ ...l, taille: lignes[0].taille })))}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto">
            <Copy className="w-3 h-3" /> Même taille pour tous ({lignes[0].taille})
          </button>
        )}
      </div>
      <p className="px-3 pb-2 text-[10px] text-muted-foreground">Astuce : collez une liste de numéros dans une case pour créer une ligne par conteneur.</p>
    </div>
  );
}
