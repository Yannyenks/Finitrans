import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Check, CircleAlert, CircleCheck, Clock, Coins, Container, FileText, Globe, History,
  KeyRound, Landmark, Layers, Link2, LoaderCircle, Lock, Menu, Receipt, ShieldCheck, TrendingUp, Users, Workflow,
} from "lucide-react";
import PlateformeLogo, { PlateformeEmbleme } from "@/components/marque/PlateformeLogo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { homeFor } from "@/components/RequireModule";
import { ApiError, apiPublic, getStoredUser, isAuthenticated } from "@/lib/api";
import { MARQUE } from "@/config/marque";
import { cn } from "@/lib/utils";
import { CONTENU, langueInitiale, memoriserLangue, type Contenu, type Langue } from "./landing/contenu";

const ENCRE = "#0B1A2E";

// ── Briques ────────────────────────────────────────────────────────────────

/** Apparition discrète au défilement (désactivée si l'utilisateur réduit les animations). */
const Apparition = ({ children, delai = 0, className }: { children: ReactNode; delai?: number; className?: string }) => {
  const reduit = useReducedMotion();
  if (reduit) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: delai, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

const Surtitre = ({ children, clair = false }: { children: ReactNode; clair?: boolean }) => (
  <p className={cn("inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]", clair ? "text-white/60" : "text-[#5B7089]")}>
    <span className="h-1.5 w-1.5 rounded-full bg-[#F07B37]" aria-hidden="true" />
    {children}
  </p>
);

const EnteteSection = ({ surtitre, titre, texte, clair = false, centre = false }: { surtitre: string; titre: string; texte?: string; clair?: boolean; centre?: boolean }) => (
  <Apparition className={cn("max-w-2xl", centre && "mx-auto text-center")}>
    <Surtitre clair={clair}>{surtitre}</Surtitre>
    <h2 className={cn("mt-4 font-display text-[30px] leading-[1.12] sm:text-[40px] font-semibold tracking-[-0.025em]", clair ? "text-white" : "text-[#0B1A2E]")}>{titre}</h2>
    {texte && <p className={cn("mt-5 text-[16px] sm:text-[17px] leading-relaxed", clair ? "text-white/65" : "text-[#4A5C72]")}>{texte}</p>}
  </Apparition>
);

const BoutonPrincipal = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
  <a href={href} className={cn("group inline-flex items-center justify-center gap-2 rounded-full bg-[#F07B37] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(240,123,55,0.6)] transition hover:bg-[#E86C24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1A2E]", className)}>
    {children}
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  </a>
);

// ── Navigation ─────────────────────────────────────────────────────────────

const SelecteurLangue = ({ langue, changer, clair }: { langue: Langue; changer: (l: Langue) => void; clair: boolean }) => (
  <div role="group" aria-label="Langue / Language" className={cn("inline-flex rounded-full p-0.5 text-[12px] font-semibold", clair ? "bg-white/10" : "bg-[#0B1A2E]/[0.06]")}>
    {(["fr", "en"] as const).map(l => (
      <button
        key={l}
        type="button"
        onClick={() => changer(l)}
        aria-pressed={langue === l}
        className={cn(
          "rounded-full px-2.5 py-1 uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37]",
          langue === l ? (clair ? "bg-white text-[#0B1A2E]" : "bg-[#0B1A2E] text-white") : (clair ? "text-white/70 hover:text-white" : "text-[#0B1A2E]/60 hover:text-[#0B1A2E]"),
        )}
      >
        {l}
      </button>
    ))}
  </div>
);

const Navigation = ({ t, langue, changer }: { t: Contenu; langue: Langue; changer: (l: Langue) => void }) => {
  const [defile, setDefile] = useState(false);
  useEffect(() => {
    const surDefilement = () => setDefile(window.scrollY > 24);
    surDefilement();
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);
  const liens = [
    { href: "#plateforme", l: t.nav.plateforme }, { href: "#parcours", l: t.nav.parcours }, { href: "#direction", l: t.nav.direction },
    { href: "#securite", l: t.nav.securite }, { href: "#offres", l: t.nav.offres },
  ];
  const clair = !defile;
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", defile ? "bg-white/85 backdrop-blur-xl border-b border-[#0B1A2E]/[0.07]" : "bg-transparent")}>
      <nav className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between px-4 sm:px-6" aria-label="Navigation principale">
        <a href="#haut" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37]" aria-label={MARQUE.nom}>
          <PlateformeLogo clair={clair} taille={30} />
        </a>
        <ul className="hidden lg:flex items-center gap-1">
          {liens.map(x => (
            <li key={x.href}>
              <a href={x.href} className={cn("rounded-full px-3.5 py-2 text-[14px] font-medium transition", clair ? "text-white/75 hover:text-white" : "text-[#0B1A2E]/70 hover:text-[#0B1A2E]")}>{x.l}</a>
            </li>
          ))}
        </ul>
        <div className="hidden lg:flex items-center gap-3">
          <SelecteurLangue langue={langue} changer={changer} clair={clair} />
          <Link to="/connexion" className={cn("rounded-full px-4 py-2 text-[14px] font-semibold transition", clair ? "text-white hover:bg-white/10" : "text-[#0B1A2E] hover:bg-[#0B1A2E]/[0.05]")}>{t.nav.connexion}</Link>
          <a href="#demo" className={cn("rounded-full px-4 py-2 text-[14px] font-semibold transition", clair ? "bg-white text-[#0B1A2E] hover:bg-white/90" : "bg-[#0B1A2E] text-white hover:bg-[#12243D]")}>{t.nav.demo}</a>
        </div>
        <div className="flex lg:hidden items-center gap-2">
          <SelecteurLangue langue={langue} changer={changer} clair={clair} />
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" aria-label="Menu" className={cn("rounded-full p-2", clair ? "text-white hover:bg-white/10" : "text-[#0B1A2E] hover:bg-[#0B1A2E]/[0.05]")}>
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-white">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="mt-8 flex flex-col gap-1">
                {liens.map(x => <a key={x.href} href={x.href} className="rounded-lg px-3 py-3 text-[16px] font-medium text-[#0B1A2E] hover:bg-[#0B1A2E]/[0.04]">{x.l}</a>)}
                <div className="my-4 h-px bg-[#0B1A2E]/10" />
                <Link to="/connexion" className="rounded-lg px-3 py-3 text-[16px] font-semibold text-[#0B1A2E] hover:bg-[#0B1A2E]/[0.04]">{t.nav.connexion}</Link>
                <a href="#demo" className="mt-2 rounded-full bg-[#F07B37] px-4 py-3 text-center text-[15px] font-semibold text-white">{t.nav.demo}</a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
};

// ── Aperçu de la console (illustration, données d'exemple) ─────────────────

const ApercuConsole = ({ t }: { t: Contenu }) => {
  const a = t.apercu;
  const courant = 2;
  return (
    <figure className="relative">
      <figcaption className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
        <span className="h-px w-6 bg-white/25" aria-hidden="true" />{a.etiquette}
      </figcaption>
      <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-2 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        <div className="rounded-[16px] bg-white text-[#0B1A2E]">
          <div className="flex items-center justify-between border-b border-[#0B1A2E]/[0.07] px-5 py-3.5">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#0B1A2E]/10" /><span className="h-2.5 w-2.5 rounded-full bg-[#0B1A2E]/10" /><span className="h-2.5 w-2.5 rounded-full bg-[#0B1A2E]/10" />
            </div>
            <span className="rounded-full bg-[#0B1A2E]/[0.05] px-2.5 py-1 text-[11px] font-semibold text-[#0B1A2E]/60">TR-2026-0148</span>
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#0B1A2E]/45">{a.client}</p>
                <p className="mt-0.5 font-display text-[18px] font-semibold tracking-tight">Société d'exemple SARL</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1A9AD6]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0F6E9E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1A9AD6]" aria-hidden="true" />{a.valeurEtape}
              </span>
            </div>

            <ol className="mt-6 grid grid-cols-6 gap-1.5" aria-label={a.etape}>
              {a.etapes.map((e, i) => (
                <li key={e} className="min-w-0">
                  <div className={cn("h-1.5 rounded-full", i < courant ? "bg-[#0B1A2E]" : i === courant ? "bg-[#F07B37]" : "bg-[#0B1A2E]/10")} />
                  <p className={cn("mt-2 truncate text-[10px] sm:text-[11px] font-medium", i === courant ? "text-[#0B1A2E]" : "text-[#0B1A2E]/45")}>{e}</p>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-xl border border-[#F07B37]/25 bg-[#F07B37]/[0.06] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C2581C]">{a.prochaine}</p>
              <p className="mt-1 text-[15px] font-semibold">{a.valeurProchaine}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#0B1A2E]/60">
                <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" />{a.responsable} : A. Ndongo</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{a.echeance} : {a.valeurEcheance}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-[#0B1A2E]/[0.035] px-4 py-3 text-[12.5px] text-[#0B1A2E]/75">
              <CircleAlert className="h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />{a.alerte}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[{ i: FileText, l: "BL · DI · Facture" }, { i: Container, l: "2 × 40' HC" }, { i: Landmark, l: "Douane" }].map(({ i: Icone, l }) => (
                <div key={l} className="flex items-center gap-2 rounded-lg border border-[#0B1A2E]/[0.07] px-2.5 py-2 text-[11px] font-medium text-[#0B1A2E]/65">
                  <Icone className="h-3.5 w-3.5 shrink-0 text-[#0B1A2E]/45" aria-hidden="true" /><span className="truncate">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
};

// ── Formulaire de démonstration ────────────────────────────────────────────

type EtatEnvoi = { etat: "saisie" } | { etat: "envoi" } | { etat: "succes"; email: string } | { etat: "erreur"; message: string };

const FormulaireDemo = ({ t, langue }: { t: Contenu; langue: Langue }) => {
  const d = t.demo;
  const [champs, setChamps] = useState({ nom: "", entreprise: "", email: "", telephone: "", pays: "", taille: "", message: "", site: "" });
  const [envoi, setEnvoi] = useState<EtatEnvoi>({ etat: "saisie" });
  const maj = (k: keyof typeof champs) => (e: { target: { value: string } }) => setChamps(c => ({ ...c, [k]: e.target.value }));

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi({ etat: "envoi" });
    try {
      await apiPublic.post("/api/public/demandes-demo", {
        nom: champs.nom, entreprise: champs.entreprise, email: champs.email,
        telephone: champs.telephone || undefined, pays: champs.pays || undefined,
        taille: champs.taille || undefined, message: champs.message || undefined, langue,
        ...(champs.site ? { site: champs.site } : {}),
      });
      setEnvoi({ etat: "succes", email: champs.email });
    } catch (err) {
      const message = err instanceof ApiError && err.status > 0 && langue === "fr" ? err.message : d.erreurReseau;
      setEnvoi({ etat: "erreur", message });
    }
  };

  if (envoi.etat === "succes") {
    return (
      <div role="status" className="rounded-2xl border border-[#0B1A2E]/[0.08] bg-white p-8 sm:p-10 text-center shadow-[0_24px_60px_-30px_rgba(11,26,46,0.35)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#16A34A]/10"><CircleCheck className="h-6 w-6 text-[#16A34A]" aria-hidden="true" /></div>
        <h3 className="mt-5 font-display text-[22px] font-semibold text-[#0B1A2E]">{d.succesTitre}</h3>
        <p className="mt-2 text-[15px] text-[#4A5C72]">{d.succesTexte}</p>
        <p className="mt-1 text-[13px] text-[#4A5C72]/80">{envoi.email}</p>
      </div>
    );
  }

  const champ = "mt-1.5 block w-full rounded-xl border border-[#0B1A2E]/[0.12] bg-white px-3.5 py-3 text-[15px] text-[#0B1A2E] placeholder:text-[#0B1A2E]/35 transition focus:border-[#0B1A2E]/40 focus:outline-none focus:ring-4 focus:ring-[#0B1A2E]/[0.06]";
  const libelle = "text-[13px] font-medium text-[#0B1A2E]/75";
  return (
    <form onSubmit={soumettre} noValidate={false} className="rounded-2xl border border-[#0B1A2E]/[0.08] bg-white p-6 sm:p-8 shadow-[0_24px_60px_-30px_rgba(11,26,46,0.35)]">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className={libelle}>{d.champs.nom}</span><input required minLength={2} maxLength={120} autoComplete="name" value={champs.nom} onChange={maj("nom")} className={champ} /></label>
        <label className="block"><span className={libelle}>{d.champs.entreprise}</span><input required minLength={2} maxLength={160} autoComplete="organization" value={champs.entreprise} onChange={maj("entreprise")} className={champ} /></label>
        <label className="block"><span className={libelle}>{d.champs.email}</span><input required type="email" maxLength={255} autoComplete="email" value={champs.email} onChange={maj("email")} className={champ} /></label>
        <label className="block"><span className={libelle}>{d.champs.telephone}</span><input type="tel" maxLength={40} autoComplete="tel" value={champs.telephone} onChange={maj("telephone")} className={champ} /></label>
        <label className="block"><span className={libelle}>{d.champs.pays}</span><input maxLength={80} autoComplete="country-name" value={champs.pays} onChange={maj("pays")} className={champ} /></label>
        <label className="block">
          <span className={libelle}>{d.champs.taille}</span>
          <select value={champs.taille} onChange={maj("taille")} className={champ}>
            <option value="">{d.choisir}</option>
            {d.tailles.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2"><span className={libelle}>{d.champs.message}</span><textarea rows={4} maxLength={2000} value={champs.message} onChange={maj("message")} className={cn(champ, "resize-none")} /></label>
        {/* Champ piège : invisible pour les personnes, rempli par les robots */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Site<input tabIndex={-1} autoComplete="off" value={champs.site} onChange={maj("site")} /></label>
        </div>
      </div>
      {envoi.etat === "erreur" && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-[#DC2626]/[0.06] px-4 py-3 text-[14px] text-[#B91C1C]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{envoi.message}
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-[#4A5C72]/80 max-w-xs">{d.mentions}</p>
        <button type="submit" disabled={envoi.etat === "envoi"} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0B1A2E] px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#12243D] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37] focus-visible:ring-offset-2">
          {envoi.etat === "envoi" ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{d.envoi}</> : <>{d.envoyer}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </button>
      </div>
    </form>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────

const ICONES_MODULES = [Workflow, Landmark, Container, Receipt, Users, TrendingUp];
const ICONES_PRINCIPES = [ShieldCheck, History, Layers, KeyRound];
const ICONES_INTERNATIONAL = [Coins, Globe, Workflow];
const LIMITES_DEFAUT: Record<string, number | null> = { starter: 10, business: 50, enterprise: null };

const Landing = () => {
  const navigate = useNavigate();
  const [langue, setLangue] = useState<Langue>(langueInitiale);
  const [limites, setLimites] = useState(LIMITES_DEFAUT);
  const t = CONTENU[langue];

  // Un collaborateur déjà connecté va directement dans l'espace de son entreprise
  useEffect(() => {
    if (isAuthenticated()) navigate(homeFor(getStoredUser()), { replace: true });
  }, [navigate]);

  useEffect(() => {
    document.documentElement.lang = langue;
    document.title = `${MARQUE.nom} — ${t.hero.surtitre}`;
  }, [langue, t]);

  // Limites d'utilisateurs publiées par le serveur (même source que les contrôles appliqués)
  useEffect(() => {
    apiPublic.get<{ cle: string; maxUtilisateurs: number | null }[]>("/api/public/offres")
      .then(offres => setLimites(Object.fromEntries(offres.map(o => [o.cle, o.maxUtilisateurs]))))
      .catch(() => { /* valeurs par défaut */ });
  }, []);

  const changerLangue = (l: Langue) => { setLangue(l); memoriserLangue(l); };

  return (
    <div id="haut" className="min-h-screen bg-[#F6F7F9] font-body text-[#0B1A2E] antialiased [scroll-behavior:smooth]">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-[#0B1A2E]">
        {langue === "fr" ? "Aller au contenu" : "Skip to content"}
      </a>
      <Navigation t={t} langue={langue} changer={changerLangue} />

      <main id="contenu">
        {/* Hero */}
        <section className="relative overflow-hidden" style={{ backgroundColor: ENCRE }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-100"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage: "radial-gradient(ellipse 80% 70% at 70% 30%, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 70% 30%, black 30%, transparent 75%)",
            }} />
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#1A9AD6]/[0.10] blur-[120px]" />
          <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-4 pb-20 pt-32 sm:px-6 sm:pb-28 sm:pt-40 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <Apparition>
              <Surtitre clair>{t.hero.surtitre}</Surtitre>
              <h1 className="mt-6 font-display text-[38px] leading-[1.06] sm:text-[54px] lg:text-[60px] font-semibold tracking-[-0.035em] text-white">
                {t.hero.titre} <span className="text-[#F5A06E]">{t.hero.titreAccent}</span>
              </h1>
              <p className="mt-7 max-w-xl text-[17px] sm:text-[18px] leading-relaxed text-white/70">{t.hero.texte}</p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <BoutonPrincipal href="#demo">{t.hero.ctaPrincipal}</BoutonPrincipal>
                <Link to="/inscription" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  {t.hero.ctaSecondaire}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-6 text-[13px] text-white/45">{t.hero.mention}</p>
            </Apparition>
            <Apparition delai={0.12}>
              <ApercuConsole t={t} />
            </Apparition>
          </div>
        </section>

        {/* Principes */}
        <section aria-label={t.nav.securite} className="border-b border-[#0B1A2E]/[0.07] bg-white">
          <div className="mx-auto grid max-w-[1200px] gap-px bg-[#0B1A2E]/[0.07] sm:grid-cols-2 lg:grid-cols-4">
            {t.principes.map((p, i) => {
              const Icone = ICONES_PRINCIPES[i];
              return (
                <div key={p.titre} className="bg-white px-6 py-8">
                  <Icone className="h-5 w-5 text-[#0B1A2E]" aria-hidden="true" />
                  <h3 className="mt-4 text-[15px] font-semibold text-[#0B1A2E]">{p.titre}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[#4A5C72]">{p.texte}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Modules */}
        <section id="plateforme" className="scroll-mt-20 py-24 sm:py-32">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <EnteteSection surtitre={t.modules.surtitre} titre={t.modules.titre} texte={t.modules.texte} />
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.modules.liste.map((m, i) => {
                const Icone = ICONES_MODULES[i];
                return (
                  <Apparition key={m.titre} delai={i * 0.05}>
                    <article className="group h-full rounded-2xl border border-[#0B1A2E]/[0.07] bg-white p-7 transition hover:border-[#0B1A2E]/[0.14] hover:shadow-[0_20px_50px_-30px_rgba(11,26,46,0.35)]">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B1A2E] text-white">
                        <Icone className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h3 className="mt-6 font-display text-[18px] font-semibold tracking-tight">{m.titre}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-[#4A5C72]">{m.texte}</p>
                    </article>
                  </Apparition>
                );
              })}
            </div>
          </div>
        </section>

        {/* Parcours */}
        <section id="parcours" className="scroll-mt-20 border-y border-[#0B1A2E]/[0.07] bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <EnteteSection surtitre={t.parcours.surtitre} titre={t.parcours.titre} texte={t.parcours.texte} />
            <ol className="mt-16 grid gap-8 md:grid-cols-5 md:gap-0">
              {t.parcours.etapes.map((e, i) => (
                <Apparition key={e.titre} delai={i * 0.07} className="relative md:pr-6">
                  <li className="list-none">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", i === 2 ? "bg-[#F07B37] text-white" : "bg-[#0B1A2E] text-white")}>{String(i + 1).padStart(2, "0")}</span>
                      {i < t.parcours.etapes.length - 1 && <span aria-hidden="true" className="hidden md:block h-px flex-1 bg-[#0B1A2E]/[0.12]" />}
                    </div>
                    <h3 className="mt-5 font-display text-[17px] font-semibold tracking-tight">{e.titre}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[#4A5C72]">{e.texte}</p>
                  </li>
                </Apparition>
              ))}
            </ol>
            <Apparition>
              <p className="mt-14 inline-flex items-start gap-2.5 rounded-xl bg-[#0B1A2E]/[0.04] px-5 py-4 text-[14px] text-[#0B1A2E]/75">
                <Workflow className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t.parcours.note}
              </p>
            </Apparition>
          </div>
        </section>

        {/* Direction */}
        <section id="direction" className="scroll-mt-20 py-24 sm:py-32" style={{ backgroundColor: ENCRE }}>
          <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
            <div>
              <EnteteSection surtitre={t.direction.surtitre} titre={t.direction.titre} texte={t.direction.texte} clair />
              <ul className="mt-9 space-y-3.5">
                {t.direction.points.map(p => (
                  <Apparition key={p}>
                    <li className="flex items-start gap-3 text-[15px] text-white/80">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10"><Check className="h-3 w-3 text-[#F5A06E]" aria-hidden="true" /></span>{p}
                    </li>
                  </Apparition>
                ))}
              </ul>
            </div>
            <Apparition delai={0.1}>
              <figure className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
                <figcaption className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{t.direction.etiquette}</figcaption>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {t.direction.kpis.map((k, i) => (
                    <div key={k.libelle} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                      <p className="text-[12px] text-white/55">{k.libelle}</p>
                      <p className={cn("mt-2 font-display text-[34px] font-semibold tracking-tight", i === 1 ? "text-[#F5A06E]" : "text-white")}>{[48, 3, 1, 7][i]}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 space-y-3" aria-hidden="true">
                  {[0.82, 0.64, 0.47, 0.3].map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-20 truncate text-[11px] text-white/45">{["Réception", "Validation", "Paiement", "Sortie"][i]}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full bg-white/70" style={{ width: `${w * 100}%` }} /></span>
                    </div>
                  ))}
                </div>
              </figure>
            </Apparition>
          </div>
        </section>

        {/* International */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <EnteteSection surtitre={t.international.surtitre} titre={t.international.titre} />
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {t.international.points.map((p, i) => {
                const Icone = ICONES_INTERNATIONAL[i];
                return (
                  <Apparition key={p.titre} delai={i * 0.06}>
                    <article className="h-full rounded-2xl border border-[#0B1A2E]/[0.07] bg-white p-7">
                      <Icone className="h-5 w-5 text-[#0B1A2E]" aria-hidden="true" />
                      <h3 className="mt-5 font-display text-[17px] font-semibold tracking-tight">{p.titre}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-[#4A5C72]">{p.texte}</p>
                    </article>
                  </Apparition>
                );
              })}
            </div>
          </div>
        </section>

        {/* Sécurité */}
        <section id="securite" className="scroll-mt-20 border-y border-[#0B1A2E]/[0.07] bg-white py-24 sm:py-32">
          <div className="mx-auto grid max-w-[1200px] gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div>
              <EnteteSection surtitre={t.securite.surtitre} titre={t.securite.titre} />
              <Apparition>
                <div className="mt-10 inline-flex items-center gap-4 rounded-2xl border border-[#0B1A2E]/[0.07] bg-[#F6F7F9] p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B1A2E]"><Lock className="h-5 w-5 text-white" aria-hidden="true" /></div>
                  <div className="text-[13px] leading-snug text-[#4A5C72]">
                    <p className="font-semibold text-[#0B1A2E]">{t.principes[0].titre}</p>
                    <p>{t.principes[0].texte}</p>
                  </div>
                </div>
              </Apparition>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {t.securite.liste.map((s, i) => {
                const Icone = [ShieldCheck, KeyRound, Lock, History, Layers, Link2][i];
                return (
                  <Apparition key={s} delai={i * 0.04}>
                    <li className="flex h-full items-start gap-3 rounded-2xl border border-[#0B1A2E]/[0.07] p-5 text-[14.5px] leading-relaxed text-[#0B1A2E]/80">
                      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1A2E]" aria-hidden="true" />{s}
                    </li>
                  </Apparition>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Offres */}
        <section id="offres" className="scroll-mt-20 py-24 sm:py-32">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <EnteteSection surtitre={t.offres.surtitre} titre={t.offres.titre} texte={t.offres.texte} centre />
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {t.offres.liste.map((o, i) => {
                const mise = o.cle === "business";
                return (
                  <Apparition key={o.cle} delai={i * 0.06}>
                    <article className={cn("relative flex h-full flex-col rounded-[22px] p-8", mise ? "text-white shadow-[0_30px_80px_-30px_rgba(11,26,46,0.6)]" : "border border-[#0B1A2E]/[0.08] bg-white")} style={mise ? { backgroundColor: ENCRE } : undefined}>
                      {mise && <span className="absolute right-6 top-6 rounded-full bg-[#F07B37] px-2.5 py-1 text-[11px] font-semibold text-white">{t.offres.recommande}</span>}
                      <h3 className="font-display text-[22px] font-semibold tracking-tight">{o.libelle}</h3>
                      <p className={cn("mt-2 text-[14.5px] leading-relaxed", mise ? "text-white/65" : "text-[#4A5C72]")}>{o.texte}</p>
                      <p className="mt-7 font-display text-[28px] font-semibold tracking-tight">{t.offres.surDevis}</p>
                      <p className={cn("mt-1 text-[13px]", mise ? "text-white/55" : "text-[#4A5C72]")}>{t.offres.utilisateurs(limites[o.cle] ?? null)}</p>
                      <ul className="mt-7 space-y-3">
                        {o.points.map(p => (
                          <li key={p} className={cn("flex items-start gap-2.5 text-[14.5px]", mise ? "text-white/85" : "text-[#0B1A2E]/80")}>
                            <Check className={cn("mt-0.5 h-4 w-4 shrink-0", mise ? "text-[#F5A06E]" : "text-[#0B1A2E]")} aria-hidden="true" />{p}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto pt-9">
                        {mise
                          ? <Link to="/inscription" className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-[#0B1A2E] transition hover:bg-white/90">{t.offres.ctaEssai}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                          : <a href="#demo" className="flex w-full items-center justify-center gap-2 rounded-full border border-[#0B1A2E]/15 px-5 py-3 text-[15px] font-semibold text-[#0B1A2E] transition hover:border-[#0B1A2E]/30 hover:bg-[#0B1A2E]/[0.03]">{t.offres.ctaContact}</a>}
                      </div>
                    </article>
                  </Apparition>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-[#0B1A2E]/[0.07] bg-white py-24 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Apparition><h2 className="font-display text-[28px] sm:text-[34px] font-semibold tracking-[-0.025em]">{t.faq.titre}</h2></Apparition>
            <Accordion type="single" collapsible className="mt-8">
              {t.faq.liste.map((f, i) => (
                <AccordionItem key={f.q} value={`q${i}`} className="border-[#0B1A2E]/[0.08]">
                  <AccordionTrigger className="py-5 text-left text-[16px] font-semibold text-[#0B1A2E] hover:no-underline">{f.q}</AccordionTrigger>
                  <AccordionContent className="pb-5 text-[15px] leading-relaxed text-[#4A5C72]">{f.r}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Démo */}
        <section id="demo" className="scroll-mt-20 py-24 sm:py-32">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <EnteteSection surtitre={t.demo.surtitre} titre={t.demo.titre} texte={t.demo.texte} />
              <Apparition>
                <div className="mt-10 space-y-4 text-[14.5px] text-[#0B1A2E]/75">
                  {[{ i: Clock, l: t.hero.mention }, { i: ShieldCheck, l: t.principes[0].texte }].map(({ i: Icone, l }) => (
                    <p key={l} className="flex items-start gap-3"><Icone className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1A2E]" aria-hidden="true" />{l}</p>
                  ))}
                </div>
              </Apparition>
            </div>
            <Apparition delai={0.08}><FormulaireDemo t={t} langue={langue} /></Apparition>
          </div>
        </section>
      </main>

      <footer style={{ backgroundColor: ENCRE }} className="text-white">
        <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <PlateformeLogo clair taille={30} />
              <p className="mt-4 text-[14px] leading-relaxed text-white/55">{t.pied.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-3 text-[14px]">
              <a href="#plateforme" className="text-white/65 hover:text-white">{t.nav.plateforme}</a>
              <a href="#securite" className="text-white/65 hover:text-white">{t.nav.securite}</a>
              <a href="#offres" className="text-white/65 hover:text-white">{t.nav.offres}</a>
              <Link to="/connexion" className="text-white/65 hover:text-white">{t.pied.connexion}</Link>
              <Link to="/inscription" className="text-white/65 hover:text-white">{t.pied.creer}</Link>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-[12.5px] text-white/40 sm:flex-row sm:items-center sm:justify-between">
            <p>© {MARQUE.annee} {MARQUE.nom}. {t.pied.droits}</p>
            <span className="inline-flex items-center gap-2"><PlateformeEmbleme taille={16} clair />{MARQUE.nom}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
