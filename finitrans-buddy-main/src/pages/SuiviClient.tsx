import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, Check, Clock, Container, Loader2, Mail, MapPin, MessageCircle, Package, Phone, RefreshCw, Ship, ShieldCheck, Sparkles } from "lucide-react";
import FinitransLogo from "@/components/FinitransLogo";
import { Illustration } from "@/components/suivi/Illustration";

type Etape = { etape: string; phase: string; titre: string; texte: string; illustration: string; etat: "fait" | "courant" | "preparation" | "avenir"; debut: string | null; fin: string | null };
type PhaseClient = { cle: string; libelle: string; description: string; etat: "a_venir" | "en_attente" | "en_cours" | "terminee"; debut: string | null; fin: string | null };
type Suivi = {
  numero: string; client: string; marchandise: string; site: string; compagnie: string; numeroBL: string | null; dateArrivee: string;
  conteneurs: { numero: string; taille: string }[]; resumeConteneurs: string | null;
  statut: string; etapeCourante: string; termine: boolean; progression: number; etapes: Etape[];
  enPreparation: boolean; phases: PhaseClient[];
  actualites: { id: string; message: string; illustration: string; auteur: string; date: string }[];
  entreprise: { nom: string; telephone: string | null; email: string | null; adresse: string | null; siteWeb: string | null };
  misAJour: string;
};

const jour = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
const jourHeure = (d: string) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function ilYA(d: string) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? "hier" : `il y a ${j} jours`;
}

/** Navire sur les vagues (en-tête animé) */
const NavireVagues = () => (
  <div className="relative h-24 sm:h-28 overflow-hidden" aria-hidden>
    <motion.svg viewBox="0 0 200 80" className="absolute left-1/2 -translate-x-1/2 bottom-6 w-40 sm:w-48"
      animate={{ y: [0, -4, 0], rotate: [-1.2, 1.2, -1.2] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}>
      <defs>
        <linearGradient id="coque" x1="0" x2="1"><stop offset="0" stopColor="#38BDF8" /><stop offset="1" stopColor="#0369A1" /></linearGradient>
      </defs>
      {[["#F07B37", 28], ["#FBBF24", 50], ["#22C55E", 72], ["#38BDF8", 94], ["#F07B37", 116]].map(([c, x], i) => (
        <rect key={i} x={Number(x)} y={i % 2 ? 30 : 36} width="20" height={i % 2 ? 18 : 12} rx="2" fill={String(c)} opacity="0.95" />
      ))}
      <rect x="138" y="22" width="16" height="26" rx="2" fill="#E2E8F0" />
      <rect x="142" y="26" width="8" height="5" rx="1" fill="#0F2440" />
      <path d="M10 48 L190 48 L172 70 L24 70 Z" fill="url(#coque)" />
      <path d="M18 58 L182 58" stroke="#F07B37" strokeWidth="3" />
    </motion.svg>
    {[0, 1].map(i => (
      <motion.svg key={i} viewBox="0 0 400 40" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-[200%] h-10"
        style={{ opacity: i ? 0.35 : 0.6 }}
        animate={{ x: ["0%", "-50%"] }} transition={{ duration: i ? 9 : 6, repeat: Infinity, ease: "linear" }}>
        <path d="M0 20 Q 25 8 50 20 T 100 20 T 150 20 T 200 20 T 250 20 T 300 20 T 350 20 T 400 20 V40 H0 Z" fill={i ? "#7DD3FC" : "#0EA5E9"} />
      </motion.svg>
    ))}
  </div>
);

/** Anneau de progression */
const Anneau = ({ pct }: { pct: number }) => {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <defs><linearGradient id="anneau" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#FDBA74" /><stop offset="1" stopColor="#F07B37" /></linearGradient></defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke="url(#anneau)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ duration: 1.6, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-4xl font-display font-black leading-none">{pct}<span className="text-xl">%</span></span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/60 mt-1">avancement</span>
      </div>
    </div>
  );
};

export default function SuiviClient() {
  const { token = "" } = useParams();
  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useQuery<Suivi>({
    queryKey: ["suivi-public", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/suivi/${encodeURIComponent(token)}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.message ?? "Lien de suivi invalide");
      return b;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-[#0F2440]"><Loader2 className="w-8 h-8 animate-spin text-white/70" /></div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-[#0F2440] to-[#1B3A66] p-6">
        <div className="max-w-sm w-full rounded-3xl bg-white p-8 text-center shadow-2xl">
          <FinitransLogo variant="full" iconSize={44} />
          <p className="mt-6 font-display font-bold text-lg text-[#0F2440]">Lien de suivi indisponible</p>
          <p className="mt-2 text-sm text-slate-500">{(error as Error)?.message}</p>
        </div>
      </div>
    );
  }

  const courante = data.etapes.find(e => e.etat === "courant" || e.etat === "preparation");
  const tel = data.entreprise.telephone?.replace(/[^\d+]/g, "");
  const whatsapp = tel ? `https://wa.me/${tel.replace(/^\+/, "")}?text=${encodeURIComponent(`Bonjour, je souhaite des nouvelles de mon dossier ${data.numero}.`)}` : null;

  return (
    <div className="min-h-[100dvh] bg-[#F3F6FB] text-slate-800 antialiased">
      {/* ── En-tête ── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[#0B1C33] via-[#0F2440] to-[#1B3A66] text-white">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#F07B37]/20 blur-3xl" />
        <div className="absolute top-20 -left-24 w-72 h-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative max-w-2xl mx-auto px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-white px-2.5 py-1.5 shadow-lg"><FinitransLogo variant="full" iconSize={28} /></div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 backdrop-blur border border-white/15">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /> Suivi sécurisé
            </span>
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-7 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-semibold">Suivi de votre dossier</p>
              <h1 className="mt-1 text-3xl font-display font-black tracking-tight">{data.numero}</h1>
              <p className="mt-1 text-white/75 truncate">{data.client}</p>
              <div className="mt-4 inline-flex items-center gap-2.5 rounded-2xl bg-white/10 backdrop-blur border border-white/15 pl-1.5 pr-4 py-1.5">
                <Illustration type={data.termine ? "valide" : courante?.illustration ?? "info"} taille={34} />
                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-wider text-white/55">{data.termine ? "Statut" : data.enPreparation ? "Étape en préparation" : "Étape en cours"}</p>
                  <p className="font-semibold">{data.termine ? "Opérations terminées" : data.etapeCourante}</p>
                </div>
              </div>
            </div>
            <div className="self-center"><Anneau pct={data.progression} /></div>
          </motion.div>
        </div>
        <NavireVagues />
      </header>

      <main className="max-w-2xl mx-auto px-4 -mt-2 pb-16 space-y-5">
        {/* ── Les deux phases ── */}
        {Array.isArray(data.phases) && data.phases.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.phases.map((p, i) => {
              const style = {
                terminee:   { pastille: "bg-emerald-100 text-emerald-700", texte: "Terminée", barre: "from-emerald-400 to-emerald-500", w: "100%" },
                en_cours:   { pastille: "bg-orange-100 text-[#C2410C]",   texte: "En cours", barre: "from-[#FDBA74] to-[#F07B37]", w: "55%" },
                en_attente: { pastille: "bg-amber-100 text-amber-700",     texte: "En préparation", barre: "from-amber-200 to-amber-300", w: "12%" },
                a_venir:    { pastille: "bg-slate-100 text-slate-500",     texte: "À venir", barre: "from-slate-200 to-slate-200", w: "0%" },
              }[p.etat];
              return (
                <div key={p.cle} className="rounded-3xl bg-white shadow-[0_10px_40px_-18px_rgba(15,36,64,0.35)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold">Phase {i + 1}</p>
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${style.pastille}`}>{style.texte}</span>
                  </div>
                  <p className="mt-1 font-display font-black text-[#0F2440] text-lg uppercase tracking-wide">{p.libelle}</p>
                  <p className="text-xs text-slate-500">{p.description}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <motion.div className={`h-full rounded-full bg-gradient-to-r ${style.barre}`} initial={{ width: 0 }} animate={{ width: style.w }} transition={{ duration: 1.2, ease: "easeOut" }} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {p.etat === "terminee" && p.fin ? `Terminée le ${jour(p.fin)}` : p.debut ? `Démarrée le ${jour(p.debut)}` : p.etat === "en_attente" ? "Démarrage imminent" : "Démarrera à la fin de la phase précédente"}
                  </p>
                </div>
              );
            })}
          </motion.section>
        )}

        {/* ── Votre expédition ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-3xl bg-white shadow-[0_10px_40px_-18px_rgba(15,36,64,0.35)] p-5">
          <h2 className="font-display font-bold text-[#0F2440] flex items-center gap-2"><Package className="w-4 h-4 text-[#F07B37]" /> Votre expédition</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { icone: Package, label: "Marchandise", valeur: data.marchandise },
              { icone: Ship, label: "Compagnie", valeur: data.compagnie },
              { icone: CalendarDays, label: "Arrivée", valeur: jour(data.dateArrivee) },
              { icone: MapPin, label: "Port", valeur: data.site },
            ].map(x => (
              <div key={x.label} className="rounded-2xl bg-[#F3F6FB] p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1"><x.icone className="w-3 h-3" /> {x.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800 truncate">{x.valeur || "—"}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-slate-100 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
              <Container className="w-3 h-3" /> {data.conteneurs.length} conteneur{data.conteneurs.length > 1 ? "s" : ""}{data.numeroBL ? ` · BL ${data.numeroBL}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.conteneurs.map(c => (
                <span key={c.numero} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2440] text-white text-xs font-mono pl-2 pr-1 py-1">
                  {c.numero}{c.taille && <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-sans font-semibold">{c.taille}</span>}
                </span>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── Parcours ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-3xl bg-white shadow-[0_10px_40px_-18px_rgba(15,36,64,0.35)] p-5">
          <h2 className="font-display font-bold text-[#0F2440] flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#F07B37]" /> Le parcours de votre dossier</h2>
          <ol className="mt-5 relative">
            {data.etapes.map((e, i) => {
              const dernier = i === data.etapes.length - 1;
              return (
                <motion.li key={e.etape} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}
                  className="relative flex flex-wrap gap-x-4 pb-6 last:pb-0">
                  {(i === 0 || data.etapes[i - 1].phase !== e.phase) && (
                    <p className="basis-full -mt-1 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F07B37]">
                      {e.phase === "pre_dedouanement" ? "Phase 1 · Pré-dédouanement" : "Phase 2 · Dédouanement"}
                    </p>
                  )}
                  {!dernier && (
                    <span className={`absolute left-[21px] top-12 bottom-1 w-0.5 rounded-full ${e.etat === "fait" ? "bg-gradient-to-b from-emerald-400 to-emerald-300" : "bg-slate-200"}`} />
                  )}
                  <div className="relative">
                    {(e.etat === "courant" || e.etat === "preparation") && <span className="absolute -inset-1 rounded-[18px] ring-2 ring-[#F07B37]/60 animate-pulse" />}
                    <Illustration type={e.etat === "fait" ? "valide" : e.illustration} taille={44} eteinte={e.etat === "avenir"} />
                  </div>
                  <div className={`flex-1 min-w-0 pt-0.5 ${e.etat === "avenir" ? "opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-800">{e.titre}</p>
                      {e.etat === "fait" && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5"><Check className="w-3 h-3" /> Terminé</span>}
                      {e.etat === "courant" && <span className="text-[10px] font-bold text-[#C2410C] bg-orange-50 rounded-full px-2 py-0.5">En cours</span>}
                      {e.etat === "preparation" && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">En préparation</span>}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 leading-snug">{e.texte}</p>
                    {(e.debut || e.fin) && (
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {e.etat === "fait" && e.fin ? `Terminé le ${jour(e.fin)}` : e.debut ? `Depuis le ${jour(e.debut)}` : ""}
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </motion.section>

        {/* ── Actualités ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-3xl bg-white shadow-[0_10px_40px_-18px_rgba(15,36,64,0.35)] p-5">
          <h2 className="font-display font-bold text-[#0F2440] flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#F07B37]" /> Messages de votre équipe FINITRANS</h2>
          {data.actualites.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Vous recevrez ici les informations importantes sur votre dossier.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.actualites.map(a => (
                <li key={a.id} className="flex gap-3 rounded-2xl bg-gradient-to-br from-[#F8FAFD] to-white border border-slate-100 p-3.5">
                  <Illustration type={a.illustration} taille={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{a.message}</p>
                    <p className="mt-1.5 text-[11px] text-slate-400">{a.auteur} · <span title={jourHeure(a.date)}>{ilYA(a.date)}</span></p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* ── Contact ── */}
        {(tel || data.entreprise.email) && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-3xl bg-gradient-to-br from-[#0F2440] to-[#1B3A66] text-white p-5 shadow-xl">
            <p className="font-display font-bold">Une question sur votre dossier ?</p>
            <p className="text-sm text-white/65 mt-0.5">Votre équipe {data.entreprise.nom} vous répond.</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {tel && <a href={`tel:${tel}`} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 h-11 text-sm font-semibold"><Phone className="w-4 h-4" /> Appeler</a>}
              {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1fbd59] h-11 text-sm font-semibold text-white"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
              {data.entreprise.email && <a href={`mailto:${data.entreprise.email}?subject=${encodeURIComponent(`Dossier ${data.numero}`)}`} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 h-11 text-sm font-semibold"><Mail className="w-4 h-4" /> E-mail</a>}
            </div>
          </motion.section>
        )}

        <footer className="text-center text-[11px] text-slate-400 space-y-1 pt-2">
          <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-1 hover:text-slate-600">
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Actualisé {ilYA(new Date(dataUpdatedAt).toISOString())} — mise à jour automatique
          </button>
          <p>{data.entreprise.nom}{data.entreprise.adresse ? ` · ${data.entreprise.adresse}` : ""}</p>
        </footer>
      </main>
    </div>
  );
}
