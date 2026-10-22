import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { api, downloadFile, fetchBlob, openDocument, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2, CheckCircle2, Clock, Download, ExternalLink, Eye, File, FileArchive, FileCheck2, FileImage, FileSignature,
  FileSpreadsheet, FileText, Folder, FolderOpen, HardDrive, Landmark, LayoutGrid, LayoutTemplate, Library, List, ListChecks,
  Loader2, Lock, Pencil, Printer, Scale, ScrollText, Search, Star, Tag, Trash2, UploadCloud, Users, X, AlertCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Référentiels ──────────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; icon: typeof File; teinte: string }> = {
  preuve:        { label: "Pièces & preuves",     icon: FileCheck2,     teinte: "text-sky-600 bg-sky-500/10" },
  compte_rendu:  { label: "Comptes rendus",       icon: ScrollText,     teinte: "text-emerald-600 bg-emerald-500/10" },
  contrat:       { label: "Contrats",             icon: FileSignature,  teinte: "text-violet-600 bg-violet-500/10" },
  procedure:     { label: "Procédures",           icon: ListChecks,     teinte: "text-amber-600 bg-amber-500/10" },
  modele:        { label: "Modèles",              icon: LayoutTemplate, teinte: "text-indigo-600 bg-indigo-500/10" },
  rh:            { label: "Ressources humaines",  icon: Users,          teinte: "text-pink-600 bg-pink-500/10" },
  juridique:     { label: "Juridique",            icon: Scale,          teinte: "text-slate-600 bg-slate-500/10" },
  administratif: { label: "Administratif",        icon: Building2,      teinte: "text-teal-600 bg-teal-500/10" },
  finance:       { label: "Finance",              icon: Landmark,       teinte: "text-lime-700 bg-lime-500/10" },
  autre:         { label: "Autres",               icon: Folder,         teinte: "text-gray-600 bg-gray-500/10" },
};
const CATEGORIES_DEPOT = Object.keys(CATEGORIES).filter(c => c !== "compte_rendu");

const ETAPES: Record<string, string> = {
  reception: "Réception", soumission_sgs: "Soumission SGS", codage: "Codage", validation: "Validation", paiement: "Paiement",
  bon_compagnie: "Bon compagnie (Douala)", operations_douala: "Douala", operations_kribi: "Kribi", cloture: "Clôture", facturation: "Facturation client",
};

type Format = "pdf" | "image" | "tableur" | "texte" | "archive" | "autre";
const FORMATS: Record<Format, { label: string; icon: typeof File; degrade: string; encre: string }> = {
  pdf:     { label: "PDF",      icon: FileText,        degrade: "from-rose-500/15 via-rose-500/5 to-transparent",       encre: "text-rose-600" },
  image:   { label: "Images",   icon: FileImage,       degrade: "from-sky-500/15 via-sky-500/5 to-transparent",         encre: "text-sky-600" },
  tableur: { label: "Tableurs", icon: FileSpreadsheet, degrade: "from-emerald-500/15 via-emerald-500/5 to-transparent", encre: "text-emerald-600" },
  texte:   { label: "Textes",   icon: FileText,        degrade: "from-blue-500/15 via-blue-500/5 to-transparent",       encre: "text-blue-600" },
  archive: { label: "Archives", icon: FileArchive,     degrade: "from-amber-500/15 via-amber-500/5 to-transparent",     encre: "text-amber-600" },
  autre:   { label: "Autres",   icon: File,            degrade: "from-slate-500/15 via-slate-500/5 to-transparent",     encre: "text-slate-600" },
};
const FILTRES_FORMAT: ("pdf" | "image" | "tableur" | "texte" | "autre")[] = ["pdf", "image", "tableur", "texte", "autre"];

function formatDe(type = "", nom = ""): Format {
  const t = type.toLowerCase();
  if (t.includes("pdf")) return "pdf";
  if (t.startsWith("image/")) return "image";
  if (/sheet|excel|csv/.test(t)) return "tableur";
  if (/word|opendocument\.text|text\/plain|rtf/.test(t)) return "texte";
  if (/zip|rar|7z|tar|gzip/.test(t) || /\.(zip|rar|7z)$/i.test(nom)) return "archive";
  return "autre";
}
const extension = (nom: string) => (nom.includes(".") ? nom.split(".").pop()!.slice(0, 4).toUpperCase() : "FICHIER");
const dateCourte = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const tailleLisible = (o?: number | null, defaut = "—") =>
  !o ? defaut : o < 1024 ? `${o} o` : o < 1_048_576 ? `${Math.round(o / 1024)} Ko` : `${(o / 1_048_576).toFixed(1)} Mo`;

type Doc = {
  id: string; nom: string; type: string; taille: string; tailleOctets?: number | null; categorie: string; etape?: string | null;
  description?: string | null; tags: string[]; confidentiel: boolean; createdAt: string; updatedAt: string; url: string;
  favori: boolean; modifiable: boolean; dossierId?: string | null; uploadePar: string; hashContenu?: string;
  dossier?: { id: string; numero: string; client: string; compagnie: string; site: string; status: string } | null;
  uploader?: { id: string; nom: string } | null;
};
type Reponse = {
  data: Doc[]; total: number; page: number; pages: number;
  facettes: { total: number; octets: number; volume: string; ceMois: number; favoris: number; parCategorie: Record<string, number> };
};

// ── Aperçus protégés (jeton) ─────────────────────────────────────────────────

const cacheVignettes = new Map<string, Promise<string>>();
function vignette(url: string) {
  if (!cacheVignettes.has(url)) cacheVignettes.set(url, fetchBlob(url).then(b => URL.createObjectURL(b)));
  return cacheVignettes.get(url)!;
}

function useBlobUrl(url: string | null) {
  const [etat, setEtat] = useState<{ url: string | null; erreur: string | null; chargement: boolean }>({ url: null, erreur: null, chargement: false });
  useEffect(() => {
    if (!url) { setEtat({ url: null, erreur: null, chargement: false }); return; }
    let actif = true;
    let cree: string | null = null;
    setEtat({ url: null, erreur: null, chargement: true });
    fetchBlob(url)
      .then(b => { cree = URL.createObjectURL(b); if (actif) setEtat({ url: cree, erreur: null, chargement: false }); })
      .catch(e => actif && setEtat({ url: null, erreur: e.message, chargement: false }));
    return () => { actif = false; if (cree) URL.revokeObjectURL(cree); };
  }, [url]);
  return etat;
}

const Vignette = ({ doc, grand = false }: { doc: Doc; grand?: boolean }) => {
  const format = formatDe(doc.type, doc.nom);
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const image = format === "image" && (doc.tailleOctets ?? 0) <= 6_000_000;
  useEffect(() => {
    if (!image || !ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { vignette(doc.url).then(setSrc).catch(() => {}); obs.disconnect(); }
    }, { rootMargin: "200px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [doc.url, image]);
  const F = FORMATS[format];
  return (
    <div ref={ref} className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br", F.degrade, grand ? "h-full" : "aspect-[4/3]")}>
      {src ? (
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="flex h-14 w-11 items-center justify-center rounded-md bg-card shadow-sm ring-1 ring-border">
              <F.icon className={cn("h-5 w-5", F.encre)} strokeWidth={1.6} />
            </div>
            <span className={cn("absolute -bottom-1.5 -right-3 rounded px-1 py-px text-[8px] font-bold tracking-wider text-white shadow-sm",
              format === "pdf" ? "bg-rose-500" : format === "image" ? "bg-sky-500" : format === "tableur" ? "bg-emerald-500" : format === "texte" ? "bg-blue-500" : format === "archive" ? "bg-amber-500" : "bg-slate-500")}>
              {extension(doc.nom)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const lirePreference = (cle: string, defaut: string) => { try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; } };
const ecrirePreference = (cle: string, v: string) => { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } };

const Bibliotheque = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { superviseur } = useAuth();
  const [params, setParams] = useSearchParams();
  const dossierFiltre = params.get("dossier");
  const docOuvert = params.get("doc");

  const [collection, setCollection] = useState<string>("tous");
  const [format, setFormat] = useState<string>("");
  const [tri, setTri] = useState<string>(() => lirePreference("ft_biblio_tri", "recent"));
  const [vue, setVue] = useState<"grille" | "liste">(() => (lirePreference("ft_biblio_vue", "grille") === "liste" ? "liste" : "grille"));
  const [saisie, setSaisie] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [depot, setDepot] = useState<File[] | null>(null);
  const [edition, setEdition] = useState<Doc | null>(null);
  const [glisser, setGlisser] = useState(false);
  const recherche = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => setQ(saisie.trim()), 280); return () => clearTimeout(t); }, [saisie]);
  useEffect(() => { setPage(1); }, [q, collection, format, tri, dossierFiltre]);
  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); recherche.current?.focus(); }
    };
    window.addEventListener("keydown", raccourci);
    return () => window.removeEventListener("keydown", raccourci);
  }, []);

  const requete = useMemo(() => {
    const p = new URLSearchParams({ tri, page: String(page), limit: "48" });
    if (q) p.set("q", q);
    if (format) p.set("format", format);
    if (dossierFiltre) p.set("dossierId", dossierFiltre);
    if (collection === "favoris") p.set("favoris", "1");
    else if (collection === "recents") p.set("depuis", new Date(Date.now() - 30 * 86_400_000).toISOString());
    else if (collection === "entreprise") p.set("espace", "entreprise");
    else if (collection === "dossiers") p.set("espace", "dossiers");
    else if (collection !== "tous") p.set("categorie", collection);
    return p.toString();
  }, [q, format, tri, page, collection, dossierFiltre]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["bibliotheque", requete],
    queryFn: () => api.get<Reponse>(`/api/bibliotheque?${requete}`),
    placeholderData: prev => prev,
  });
  const docs = data?.data ?? [];
  const f = data?.facettes;

  const { data: dossierInfo } = useQuery({
    queryKey: ["dossier", dossierFiltre],
    queryFn: () => api.get<any>(`/api/dossiers/${dossierFiltre}`),
    enabled: !!dossierFiltre,
  });
  const { data: docDetail } = useQuery({
    queryKey: ["bibliotheque-doc", docOuvert],
    queryFn: () => api.get<Doc>(`/api/bibliotheque/${docOuvert}`),
    enabled: !!docOuvert,
  });

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["bibliotheque"] }); qc.invalidateQueries({ queryKey: ["bibliotheque-doc"] }); };
  const erreur = (e: any) => toast({ title: "Action impossible", description: e?.message, variant: "destructive" });
  const favori = useMutation({
    mutationFn: (id: string) => api.post<{ favori: boolean }>(`/api/bibliotheque/${id}/favori`),
    onSuccess: r => { rafraichir(); toast({ title: r.favori ? "Ajouté aux favoris" : "Retiré des favoris" }); },
    onError: erreur,
  });
  const supprimer = useMutation({
    mutationFn: (id: string) => api.delete(`/api/bibliotheque/${id}`),
    onSuccess: () => { rafraichir(); fermerApercu(); toast({ title: "Document supprimé" }); },
    onError: erreur,
  });

  const ouvrirApercu = (id: string) => { const p = new URLSearchParams(params); p.set("doc", id); setParams(p, { replace: true }); };
  const fermerApercu = () => { const p = new URLSearchParams(params); p.delete("doc"); setParams(p, { replace: true }); };
  const retirerFiltreDossier = () => { const p = new URLSearchParams(params); p.delete("dossier"); setParams(p, { replace: true }); };
  const telecharger = (d: Doc) => downloadFile(`${d.url}?telecharger=1`, d.nom).catch(erreur);
  const choisirVue = (v: "grille" | "liste") => { setVue(v); ecrirePreference("ft_biblio_vue", v); };
  const choisirTri = (v: string) => { setTri(v); ecrirePreference("ft_biblio_tri", v); };

  const deposer = useCallback((fichiers: FileList | File[]) => {
    const liste = Array.from(fichiers).filter(fi => fi.size > 0);
    if (liste.length) setDepot(liste);
  }, []);

  const collections: { cle: string; label: string; icon: typeof File; compte?: number }[] = [
    { cle: "tous", label: "Tous les documents", icon: Library, compte: f?.total },
    { cle: "favoris", label: "Mes favoris", icon: Star, compte: f?.favoris },
    { cle: "recents", label: "Ajoutés récemment", icon: Clock },
  ];

  return (
    <AppLayout title="Bibliothèque" subtitle="Tous les documents de l'entreprise, au même endroit">
      <div
        className="relative space-y-6"
        onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setGlisser(true); } }}
        onDragLeave={e => { if (e.currentTarget === e.target) setGlisser(false); }}
        onDrop={e => { e.preventDefault(); setGlisser(false); if (e.dataTransfer.files.length) deposer(e.dataTransfer.files); }}
      >
        {glisser && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-secondary bg-secondary/5 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-secondary"><UploadCloud className="h-10 w-10" /><p className="font-display font-semibold">Déposez vos fichiers pour les ajouter</p></div>
          </div>
        )}

        {/* ── En-tête ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl bg-[#0B1F3A] px-6 py-7 text-white shadow-xl sm:px-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#C9A227]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl space-y-3">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#E5C964]"><Sparkles className="h-3.5 w-3.5" /> Bibliothèque documentaire</p>
              <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">Retrouvez n'importe quel document en quelques secondes</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/60" />
                <input
                  ref={recherche}
                  value={saisie}
                  onChange={e => setSaisie(e.target.value)}
                  placeholder="Nom, dossier, client, conteneur, BL, étiquette…"
                  aria-label="Rechercher dans la bibliothèque"
                  className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 pl-11 pr-20 text-sm text-white placeholder:text-white/50 outline-none ring-[#C9A227]/60 backdrop-blur transition focus:bg-white/15 focus:ring-2"
                />
                {saisie ? (
                  <button onClick={() => setSaisie("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/60 hover:text-white" aria-label="Effacer"><X className="h-4 w-4" /></button>
                ) : (
                  <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] text-white/60 sm:block">/</kbd>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[460px]">
              {[
                { label: "Documents", valeur: f?.total ?? "—", icon: FolderOpen },
                { label: "Volume", valeur: f ? tailleLisible(f.octets, "0 Ko") : "—", icon: HardDrive },
                { label: "Ce mois-ci", valeur: f?.ceMois ?? "—", icon: Clock },
                { label: "Favoris", valeur: f?.favoris ?? "—", icon: Star },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur">
                  <s.icon className="mb-2 h-4 w-4 text-[#E5C964]" />
                  <p className="font-display text-xl font-bold leading-none">{s.valeur}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-white/60">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* ── Collections ────────────────────────────────────── */}
          <nav aria-label="Collections" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
              {collections.map(c => (
                <BoutonCollection key={c.cle} actif={collection === c.cle} onClick={() => setCollection(c.cle)} icon={c.icon} label={c.label} compte={c.compte} />
              ))}
              <p className="hidden px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">Dossiers</p>
              {["preuve", "compte_rendu"].map(c => (
                <BoutonCollection key={c} actif={collection === c} onClick={() => setCollection(c)} icon={CATEGORIES[c].icon} label={CATEGORIES[c].label} compte={f?.parCategorie[c] ?? 0} />
              ))}
              <p className="hidden px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">Entreprise</p>
              {CATEGORIES_DEPOT.filter(c => c !== "preuve").map(c => (
                <BoutonCollection key={c} actif={collection === c} onClick={() => setCollection(c)} icon={CATEGORIES[c].icon} label={CATEGORIES[c].label} compte={f?.parCategorie[c] ?? 0} />
              ))}
            </div>
          </nav>

          {/* ── Résultats ─────────────────────────────────────── */}
          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format">
                <PuceFormat actif={!format} onClick={() => setFormat("")}>Tous formats</PuceFormat>
                {FILTRES_FORMAT.map(k => {
                  const F = FORMATS[k];
                  return <PuceFormat key={k} actif={format === k} onClick={() => setFormat(format === k ? "" : k)}><F.icon className={cn("h-3.5 w-3.5", format !== k && F.encre)} /> {F.label}</PuceFormat>;
                })}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Select value={tri} onValueChange={choisirTri}>
                  <SelectTrigger className="h-9 w-[150px] text-xs" aria-label="Trier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Plus récents</SelectItem>
                    <SelectItem value="ancien">Plus anciens</SelectItem>
                    <SelectItem value="nom">Nom (A → Z)</SelectItem>
                    <SelectItem value="taille">Plus volumineux</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex rounded-lg border border-border p-0.5">
                  <button onClick={() => choisirVue("grille")} className={cn("rounded-md p-1.5", vue === "grille" ? "bg-muted text-foreground" : "text-muted-foreground")} aria-label="Vue en grille" aria-pressed={vue === "grille"}><LayoutGrid className="h-4 w-4" /></button>
                  <button onClick={() => choisirVue("liste")} className={cn("rounded-md p-1.5", vue === "liste" ? "bg-muted text-foreground" : "text-muted-foreground")} aria-label="Vue en liste" aria-pressed={vue === "liste"}><List className="h-4 w-4" /></button>
                </div>
                <Button className="h-9 gap-1.5" onClick={() => setDepot([])}><UploadCloud className="h-4 w-4" /> Déposer</Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {dossierFiltre && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 px-2.5 py-1 font-medium text-secondary">
                  <FolderOpen className="h-3.5 w-3.5" /> Dossier {dossierInfo?.numero ?? "…"}{dossierInfo?.client ? ` — ${dossierInfo.client}` : ""}
                  <button onClick={retirerFiltreDossier} aria-label="Retirer le filtre dossier"><X className="h-3 w-3" /></button>
                </span>
              )}
              <span aria-live="polite">{data ? `${data.total} document${data.total > 1 ? "s" : ""}` : ""}</span>
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-60 animate-pulse rounded-2xl bg-muted/60" />)}
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border px-6 py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted"><Library className="h-7 w-7 text-muted-foreground" /></div>
                <p className="font-display font-semibold text-foreground">{q || format || collection !== "tous" || dossierFiltre ? "Aucun document ne correspond" : "La bibliothèque est vide"}</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Glissez-déposez des fichiers ici ou utilisez le bouton « Déposer ». Les pièces jointes aux dossiers y apparaissent automatiquement.</p>
                <Button className="mt-5 gap-1.5" onClick={() => setDepot([])}><UploadCloud className="h-4 w-4" /> Déposer un document</Button>
              </div>
            ) : vue === "grille" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {docs.map(d => (
                  <article key={d.id} data-testid="document" className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                    <button className="relative block text-left" onClick={() => ouvrirApercu(d.id)} aria-label={`Aperçu de ${d.nom}`}>
                      <Vignette doc={d} />
                      <span className="absolute inset-0 flex items-center justify-center bg-[#0B1F3A]/0 opacity-0 transition-all duration-300 group-hover:bg-[#0B1F3A]/35 group-hover:opacity-100">
                        <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] shadow"><Eye className="h-3.5 w-3.5" /> Aperçu</span>
                      </span>
                    </button>
                    <button onClick={() => favori.mutate(d.id)} aria-label={d.favori ? "Retirer des favoris" : "Ajouter aux favoris"}
                      className={cn("absolute right-2.5 top-2.5 rounded-full bg-card/90 p-1.5 shadow-sm backdrop-blur transition", d.favori ? "text-amber-500" : "text-muted-foreground opacity-0 group-hover:opacity-100")}>
                      <Star className={cn("h-3.5 w-3.5", d.favori && "fill-current")} />
                    </button>
                    {d.confidentiel && <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-[#0B1F3A]/85 px-2 py-0.5 text-[10px] font-semibold text-white"><Lock className="h-3 w-3" /> Confidentiel</span>}
                    <div className="flex flex-1 flex-col gap-2 p-3.5">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={d.nom}>{d.nom}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <BadgeCategorie categorie={d.categorie} />
                        {d.dossier ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{d.dossier.numero}</span>
                          : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Entreprise</span>}
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                        <span className="truncate">{d.uploader?.nom ?? "—"} · {dateCourte(d.createdAt)}</span>
                        <span className="flex-none">{tailleLisible(d.tailleOctets, d.taille)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Document</th><th className="px-4 py-3 font-semibold">Catégorie</th>
                      <th className="px-4 py-3 font-semibold">Dossier</th><th className="px-4 py-3 font-semibold">Ajouté</th>
                      <th className="px-4 py-3 text-right font-semibold">Taille</th><th className="px-4 py-3" />
                    </tr></thead>
                    <tbody>
                      {docs.map(d => {
                        const F = FORMATS[formatDe(d.type, d.nom)];
                        return (
                          <tr key={d.id} data-testid="document" className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30" onClick={() => ouvrirApercu(d.id)}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gradient-to-br", F.degrade)}><F.icon className={cn("h-4 w-4", F.encre)} /></span>
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5 font-medium text-foreground"><span className="truncate">{d.nom}</span>{d.confidentiel && <Lock className="h-3 w-3 flex-none text-muted-foreground" />}{d.favori && <Star className="h-3 w-3 flex-none fill-amber-400 text-amber-400" />}</span>
                                  {d.description && <span className="block truncate text-[11px] text-muted-foreground">{d.description}</span>}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><BadgeCategorie categorie={d.categorie} /></td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{d.dossier ? <><span className="font-medium text-foreground">{d.dossier.numero}</span><br />{d.dossier.client}</> : "Entreprise"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{dateCourte(d.createdAt)}<br />{d.uploader?.nom}</td>
                            <td className="px-4 py-3 text-right text-xs text-muted-foreground">{tailleLisible(d.tailleOctets, d.taille)}</td>
                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => telecharger(d)} aria-label={`Télécharger ${d.nom}`}><Download className="h-4 w-4" /></Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data && data.pages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <span className="text-xs text-muted-foreground">Page {data.page} / {data.pages}</span>
                <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            )}
          </section>
        </div>
      </div>

      <Apercu
        doc={docOuvert ? (docDetail ?? docs.find(d => d.id === docOuvert) ?? null) : null}
        onClose={fermerApercu}
        onFavori={id => favori.mutate(id)}
        onTelecharger={telecharger}
        onModifier={d => setEdition(d)}
        onSupprimer={d => { if (window.confirm(`Supprimer définitivement « ${d.nom} » ?`)) supprimer.mutate(d.id); }}
        onDossier={id => navigate(`/dossiers/${id}`)}
        peutSupprimer={d => d.categorie === "compte_rendu" ? superviseur : (superviseur || d.modifiable)}
      />
      {depot && <DialogueDepot initiaux={depot} dossierId={dossierFiltre} dossierNumero={dossierInfo?.numero} onClose={() => setDepot(null)} onTermine={rafraichir} />}
      {edition && <DialogueEdition doc={edition} onClose={() => setEdition(null)} onEnregistre={rafraichir} />}
    </AppLayout>
  );
};

// ── Sous-composants ──────────────────────────────────────────────────────────

const BoutonCollection = ({ actif, onClick, icon: Icone, label, compte }: { actif: boolean; onClick: () => void; icon: typeof File; label: string; compte?: number }) => (
  <button onClick={onClick} aria-current={actif ? "page" : undefined}
    className={cn("flex flex-none items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors",
      actif ? "bg-[#0B1F3A] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <Icone className={cn("h-4 w-4 flex-none", actif ? "text-[#E5C964]" : "")} />
    <span className="flex-1 text-left">{label}</span>
    {compte !== undefined && <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", actif ? "bg-white/15 text-white" : "bg-muted text-muted-foreground")}>{compte}</span>}
  </button>
);

const PuceFormat = ({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-pressed={actif}
    className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
      actif ? "border-[#0B1F3A] bg-[#0B1F3A] text-white" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
    {children}
  </button>
);

const BadgeCategorie = ({ categorie }: { categorie: string }) => {
  const c = CATEGORIES[categorie] ?? CATEGORIES.autre;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", c.teinte)}><c.icon className="h-3 w-3" /> {c.label}</span>;
};

const Apercu = ({ doc, onClose, onFavori, onTelecharger, onModifier, onSupprimer, onDossier, peutSupprimer }: {
  doc: Doc | null; onClose: () => void; onFavori: (id: string) => void; onTelecharger: (d: Doc) => void; onModifier: (d: Doc) => void;
  onSupprimer: (d: Doc) => void; onDossier: (id: string) => void; peutSupprimer: (d: Doc) => boolean;
}) => {
  const format = doc ? formatDe(doc.type, doc.nom) : "autre";
  const visualisable = !!doc && (format === "pdf" || format === "image" || doc.type.startsWith("text/")) && (doc.tailleOctets ?? 0) <= 25_000_000;
  const blob = useBlobUrl(visualisable ? doc!.url : null);
  const cadre = useRef<HTMLIFrameElement>(null);
  const imprimer = () => {
    if (format === "pdf" && cadre.current?.contentWindow) {
      try { cadre.current.contentWindow.focus(); cadre.current.contentWindow.print(); return; } catch { /* repli : onglet */ }
    }
    if (doc) openDocument(doc.url).catch(() => {});
  };
  return (
    <Sheet open={!!doc} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {doc && (
          <>
            <SheetHeader className="space-y-2 border-b border-border p-5 text-left">
              <div className="flex flex-wrap items-center gap-1.5 pr-8">
                <BadgeCategorie categorie={doc.categorie} />
                {doc.confidentiel && <span className="inline-flex items-center gap-1 rounded-full bg-[#0B1F3A] px-2 py-0.5 text-[10px] font-semibold text-white"><Lock className="h-3 w-3" /> Confidentiel</span>}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{extension(doc.nom)}</span>
              </div>
              <SheetTitle className="font-display text-lg leading-snug">{doc.nom}</SheetTitle>
              <SheetDescription>{doc.description || (doc.dossier ? `Pièce du dossier ${doc.dossier.numero} — ${doc.dossier.client}` : "Document de l'entreprise")}</SheetDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" className="gap-1.5" onClick={() => onTelecharger(doc)}><Download className="h-3.5 w-3.5" /> Télécharger</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={imprimer}><Printer className="h-3.5 w-3.5" /> Imprimer</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openDocument(doc.url).catch(() => {})}><ExternalLink className="h-3.5 w-3.5" /> Nouvel onglet</Button>
                <Button size="sm" variant="outline" className={cn("gap-1.5", doc.favori && "text-amber-600")} onClick={() => onFavori(doc.id)}>
                  <Star className={cn("h-3.5 w-3.5", doc.favori && "fill-current")} /> {doc.favori ? "Favori" : "Ajouter aux favoris"}
                </Button>
              </div>
            </SheetHeader>

            <div className="border-b border-border bg-muted/30 p-4">
              {!visualisable ? (
                <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card text-center">
                  <div className="h-28 w-40 overflow-hidden rounded-lg"><Vignette doc={doc} grand /></div>
                  <p className="text-xs text-muted-foreground">Aperçu non disponible pour ce format — téléchargez le fichier pour l'ouvrir.</p>
                </div>
              ) : blob.chargement ? (
                <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : blob.erreur ? (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {blob.erreur}</div>
              ) : blob.url && format === "image" ? (
                <img src={blob.url} alt={doc.nom} className="mx-auto max-h-[60vh] rounded-lg object-contain shadow" />
              ) : blob.url ? (
                <iframe ref={cadre} src={blob.url} title={`Aperçu de ${doc.nom}`} className="h-[62vh] w-full rounded-lg border border-border bg-white" />
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm">
              <Detail label="Catégorie">{CATEGORIES[doc.categorie]?.label ?? doc.categorie}</Detail>
              <Detail label="Dossier">
                {doc.dossier ? <button className="font-medium text-secondary hover:underline" onClick={() => onDossier(doc.dossier!.id)}>{doc.dossier.numero} — {doc.dossier.client}</button> : "Entreprise"}
              </Detail>
              {doc.etape && <Detail label="Étape">{ETAPES[doc.etape] ?? doc.etape}</Detail>}
              <Detail label="Déposé par">{doc.uploader?.nom ?? "—"}</Detail>
              <Detail label="Date d'ajout">{new Date(doc.createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</Detail>
              <Detail label="Taille">{tailleLisible(doc.tailleOctets, doc.taille)}</Detail>
              {doc.hashContenu && <Detail label="Empreinte SHA-256"><span className="font-mono text-[11px] break-all text-muted-foreground">{doc.hashContenu.slice(0, 32)}…</span></Detail>}
              {doc.tags.length > 0 && (
                <Detail label="Étiquettes" large>
                  <div className="flex flex-wrap gap-1.5">{doc.tags.map(t => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><Tag className="h-3 w-3" />{t}</span>)}</div>
                </Detail>
              )}
            </dl>

            {(doc.modifiable || peutSupprimer(doc)) && (
              <div className="mt-auto flex justify-between gap-2 border-t border-border p-4">
                {doc.modifiable ? <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onModifier(doc)}><Pencil className="h-3.5 w-3.5" /> Modifier les informations</Button> : <span />}
                {peutSupprimer(doc) && <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => onSupprimer(doc)}><Trash2 className="h-3.5 w-3.5" /> Supprimer</Button>}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const Detail = ({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) => (
  <div className={cn(large && "col-span-2")}>
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-foreground">{children}</dd>
  </div>
);

type EtatEnvoi = { fichier: File; etat: "attente" | "envoi" | "ok" | "erreur"; message?: string };

const DialogueDepot = ({ initiaux, dossierId, dossierNumero, onClose, onTermine }: {
  initiaux: File[]; dossierId: string | null; dossierNumero?: string; onClose: () => void; onTermine: () => void;
}) => {
  const [fichiers, setFichiers] = useState<EtatEnvoi[]>(initiaux.map(fichier => ({ fichier, etat: "attente" })));
  const [categorie, setCategorie] = useState(dossierId ? "preuve" : "autre");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [confidentiel, setConfidentiel] = useState(false);
  const [lierDossier, setLierDossier] = useState(!!dossierId);
  const [envoi, setEnvoi] = useState(false);
  const [survol, setSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);

  const ajouter = (liste: FileList | null) => {
    if (!liste) return;
    const nouveaux = Array.from(liste).filter(f => f.size > 0).map(fichier => ({ fichier, etat: "attente" as const }));
    setFichiers(prev => [...prev, ...nouveaux]);
  };
  const termine = fichiers.length > 0 && fichiers.every(f => f.etat === "ok");

  const envoyer = async () => {
    setEnvoi(true);
    for (let i = 0; i < fichiers.length; i++) {
      if (fichiers[i].etat === "ok") continue;
      setFichiers(prev => prev.map((f, k) => (k === i ? { ...f, etat: "envoi", message: undefined } : f)));
      const fd = new FormData();
      // Les champs avant le fichier (lecture en flux côté serveur)
      fd.append("categorie", categorie);
      if (description.trim()) fd.append("description", description.trim());
      if (tags.trim()) fd.append("tags", tags);
      if (confidentiel) fd.append("confidentiel", "true");
      if (dossierId && lierDossier) fd.append("dossierId", dossierId);
      fd.append("file", fichiers[i].fichier);
      try {
        await uploadFile("/api/bibliotheque", fd);
        setFichiers(prev => prev.map((f, k) => (k === i ? { ...f, etat: "ok" } : f)));
      } catch (e: any) {
        setFichiers(prev => prev.map((f, k) => (k === i ? { ...f, etat: "erreur", message: e.message } : f)));
      }
    }
    setEnvoi(false);
    onTermine();
  };

  useEffect(() => {
    if (termine) {
      toast({ title: `${fichiers.length} document${fichiers.length > 1 ? "s" : ""} ajouté${fichiers.length > 1 ? "s" : ""} à la bibliothèque` });
      onClose();
    }
  }, [termine]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open onOpenChange={o => !o && !envoi && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Déposer des documents</DialogTitle>
          <DialogDescription>Formats acceptés : PDF, images, Word, Excel, archives… Les doublons sont détectés automatiquement.</DialogDescription>
        </DialogHeader>
        <div
          onDragOver={e => { e.preventDefault(); setSurvol(true); }}
          onDragLeave={() => setSurvol(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setSurvol(false); ajouter(e.dataTransfer.files); }}
          onClick={() => entree.current?.click()}
          className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors",
            survol ? "border-secondary bg-secondary/5" : "border-border hover:border-secondary/60 hover:bg-muted/40")}
        >
          <UploadCloud className="h-8 w-8 text-secondary" />
          <p className="text-sm font-medium text-foreground">Glissez vos fichiers ici ou <span className="text-secondary underline">parcourez</span></p>
          <input ref={entree} type="file" multiple className="hidden" aria-label="Choisir des fichiers" onChange={e => { ajouter(e.target.files); e.target.value = ""; }} />
        </div>
        {fichiers.length > 0 && (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {fichiers.map((f, i) => {
              const F = FORMATS[formatDe(f.fichier.type, f.fichier.name)];
              return (
                <li key={`${f.fichier.name}-${i}`} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-1.5 text-xs">
                  <F.icon className={cn("h-4 w-4 flex-none", F.encre)} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground">{f.fichier.name}</span>
                    {f.message && <span className="block truncate text-destructive">{f.message}</span>}</span>
                  <span className="flex-none text-muted-foreground">{tailleLisible(f.fichier.size)}</span>
                  {f.etat === "envoi" ? <Loader2 className="h-4 w-4 animate-spin text-secondary" />
                    : f.etat === "ok" ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : f.etat === "erreur" ? <AlertCircle className="h-4 w-4 text-destructive" />
                    : <button onClick={() => setFichiers(prev => prev.filter((_, k) => k !== i))} aria-label={`Retirer ${f.fichier.name}`} disabled={envoi}><X className="h-4 w-4 text-muted-foreground" /></button>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Catégorie</Label>
            <Select value={categorie} onValueChange={setCategorie}>
              <SelectTrigger aria-label="Catégorie du document"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES_DEPOT.map(c => <SelectItem key={c} value={c}>{CATEGORIES[c].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="dep-tags">Étiquettes</Label><Input id="dep-tags" placeholder="ex. kribi, msc, 2026" value={tags} onChange={e => setTags(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="dep-desc">Description</Label><Textarea id="dep-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
          {dossierId && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm sm:col-span-2">
              <span>Rattacher au dossier <strong>{dossierNumero ?? ""}</strong></span>
              <Switch checked={lierDossier} onCheckedChange={setLierDossier} />
            </label>
          )}
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm sm:col-span-2">
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-muted-foreground" /> Confidentiel <span className="text-xs text-muted-foreground">(Direction, administration et vous)</span></span>
            <Switch checked={confidentiel} onCheckedChange={setConfidentiel} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={envoi}>Annuler</Button>
          <Button onClick={envoyer} disabled={envoi || fichiers.length === 0 || fichiers.every(f => f.etat === "ok")} className="gap-1.5">
            {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {fichiers.some(f => f.etat === "erreur") ? "Réessayer" : `Ajouter ${fichiers.length || ""} document${fichiers.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DialogueEdition = ({ doc, onClose, onEnregistre }: { doc: Doc; onClose: () => void; onEnregistre: () => void }) => {
  const [nom, setNom] = useState(doc.nom);
  const [categorie, setCategorie] = useState(doc.categorie);
  const [description, setDescription] = useState(doc.description ?? "");
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [confidentiel, setConfidentiel] = useState(doc.confidentiel);
  const enregistrer = useMutation({
    mutationFn: () => api.patch(`/api/bibliotheque/${doc.id}`, {
      nom: nom.trim(), description: description.trim() || null, confidentiel,
      tags: [...new Set(tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))],
      ...(doc.categorie === "compte_rendu" ? {} : { categorie }),
    }),
    onSuccess: () => { onEnregistre(); toast({ title: "Informations mises à jour" }); onClose(); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Modifier les informations</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); enregistrer.mutate(); }}>
          <div><Label htmlFor="ed-nom">Nom</Label><Input id="ed-nom" required value={nom} onChange={e => setNom(e.target.value)} /></div>
          {doc.categorie !== "compte_rendu" && (
            <div>
              <Label>Catégorie</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger aria-label="Catégorie"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES_DEPOT.map(c => <SelectItem key={c} value={c}>{CATEGORIES[c].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label htmlFor="ed-desc">Description</Label><Textarea id="ed-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div><Label htmlFor="ed-tags">Étiquettes (séparées par des virgules)</Label><Input id="ed-tags" value={tags} onChange={e => setTags(e.target.value)} /></div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-muted-foreground" /> Confidentiel</span>
            <Switch checked={confidentiel} onCheckedChange={setConfidentiel} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={enregistrer.isPending}>{enregistrer.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Bibliotheque;
