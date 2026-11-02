import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { ApiError, getStoredUser, inscrire, isAuthenticated } from "@/lib/api";
import { homeFor } from "@/components/RequireModule";
import PlateformeLogo from "@/components/marque/PlateformeLogo";
import { MARQUE } from "@/config/marque";
import { langueInitiale, memoriserLangue, type Langue } from "./landing/contenu";
import { cn } from "@/lib/utils";

/** Pays proposés (ISO 3166-1) ; la devise et le fuseau en sont déduits côté serveur, modifiables ensuite. */
const PAYS = [
  ["CM", "Cameroun", "Cameroon"], ["SN", "Sénégal", "Senegal"], ["CI", "Côte d'Ivoire", "Côte d'Ivoire"], ["GA", "Gabon", "Gabon"],
  ["CG", "Congo", "Congo"], ["CD", "RD Congo", "DR Congo"], ["TD", "Tchad", "Chad"], ["CF", "Centrafrique", "Central African Rep."],
  ["GQ", "Guinée équatoriale", "Equatorial Guinea"], ["BJ", "Bénin", "Benin"], ["TG", "Togo", "Togo"], ["BF", "Burkina Faso", "Burkina Faso"],
  ["ML", "Mali", "Mali"], ["NE", "Niger", "Niger"], ["GW", "Guinée-Bissau", "Guinea-Bissau"], ["NG", "Nigeria", "Nigeria"],
  ["GH", "Ghana", "Ghana"], ["KE", "Kenya", "Kenya"], ["MA", "Maroc", "Morocco"], ["TN", "Tunisie", "Tunisia"],
  ["DZ", "Algérie", "Algeria"], ["EG", "Égypte", "Egypt"], ["ZA", "Afrique du Sud", "South Africa"], ["FR", "France", "France"],
  ["BE", "Belgique", "Belgium"], ["CH", "Suisse", "Switzerland"], ["GB", "Royaume-Uni", "United Kingdom"], ["US", "États-Unis", "United States"],
  ["CA", "Canada", "Canada"], ["AE", "Émirats arabes unis", "United Arab Emirates"], ["CN", "Chine", "China"],
] as const;

const TEXTES = {
  fr: {
    retour: "Retour au site", titre: "Créer l'espace de votre entreprise", sousTitre: "Essai gratuit de 14 jours, offre Business. Vous êtes le dirigeant de l'espace : vous invitez ensuite vos collaborateurs.",
    entreprise: "Nom de l'entreprise", nom: "Votre nom complet", email: "Email professionnel", aideEmail: "Cette adresse ouvrira l'espace de votre entreprise à chaque connexion.",
    telephone: "Téléphone (facultatif)", pays: "Pays principal d'activité", aidePays: "Définit la devise et le fuseau horaire par défaut, modifiables ensuite.",
    password: "Mot de passe", regles: ["10 caractères minimum", "Au moins une lettre", "Au moins un chiffre"],
    conditions: "J'accepte les conditions d'utilisation et le traitement de mes données pour la gestion de l'espace.",
    creer: "Créer mon espace", creation: "Création de l'espace…", dejaCompte: "Votre entreprise a déjà un espace ?", connexion: "Se connecter",
    inclus: ["Dossiers et parcours douanier", "Tâches, échéances et notifications", "Lien de suivi pour vos clients", "Pilotage et CRM inclus pendant l'essai"],
    erreurReseau: "La création n'a pas pu aboutir. Vérifiez votre connexion et réessayez.",
  },
  en: {
    retour: "Back to site", titre: "Create your company workspace", sousTitre: "14-day free trial on the Business plan. You are the workspace owner: you then invite your colleagues.",
    entreprise: "Company name", nom: "Your full name", email: "Work email", aideEmail: "This address will open your company workspace every time you sign in.",
    telephone: "Phone (optional)", pays: "Main country of operation", aidePays: "Sets the default currency and time zone, both editable later.",
    password: "Password", regles: ["At least 10 characters", "At least one letter", "At least one number"],
    conditions: "I accept the terms of use and the processing of my data to manage the workspace.",
    creer: "Create my workspace", creation: "Creating workspace…", dejaCompte: "Your company already has a workspace?", connexion: "Sign in",
    inclus: ["Files and customs workflow", "Tasks, deadlines and notifications", "Tracking link for your clients", "Steering and CRM included during the trial"],
    erreurReseau: "The workspace could not be created. Check your connection and try again.",
  },
} as const;

const Inscription = () => {
  const navigate = useNavigate();
  const [langue, setLangue] = useState<Langue>(langueInitiale);
  const t = TEXTES[langue];
  const [f, setF] = useState({ entreprise: "", nom: "", email: "", telephone: "", pays: "CM", password: "", conditions: false });
  const [voir, setVoir] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (isAuthenticated()) navigate(homeFor(getStoredUser()), { replace: true });
  }, [navigate]);
  useEffect(() => { document.documentElement.lang = langue; document.title = `${t.titre} — ${MARQUE.nom}`; }, [langue, t]);

  const regles = [f.password.length >= 10, /[A-Za-z]/.test(f.password), /[0-9]/.test(f.password)];
  const valide = f.entreprise.trim().length >= 2 && f.nom.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && regles.every(Boolean) && f.conditions;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur("");
    setEnvoi(true);
    try {
      const user = await inscrire({
        entreprise: f.entreprise.trim(), nom: f.nom.trim(), email: f.email.trim(), password: f.password,
        pays: f.pays, telephone: f.telephone.trim() || undefined, langue, accepteConditions: true,
      });
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setErreur(err instanceof ApiError && err.status > 0 ? err.message : t.erreurReseau);
    } finally {
      setEnvoi(false);
    }
  };

  const changerLangue = (l: Langue) => { setLangue(l); memoriserLangue(l); };
  const champ = "mt-1.5 block w-full rounded-xl border border-[#0B1A2E]/[0.12] bg-white px-3.5 py-3 text-[15px] text-[#0B1A2E] placeholder:text-[#0B1A2E]/35 transition focus:border-[#0B1A2E]/40 focus:outline-none focus:ring-4 focus:ring-[#0B1A2E]/[0.06]";
  const libelle = "text-[13px] font-medium text-[#0B1A2E]/75";

  return (
    <div className="min-h-screen bg-[#F6F7F9] font-body text-[#0B1A2E] antialiased">
      <header className="mx-auto flex h-[68px] max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label={MARQUE.nom}><PlateformeLogo taille={28} /></Link>
        <div role="group" aria-label="Langue / Language" className="inline-flex rounded-full bg-[#0B1A2E]/[0.06] p-0.5 text-[12px] font-semibold">
          {(["fr", "en"] as const).map(l => (
            <button key={l} type="button" onClick={() => changerLangue(l)} aria-pressed={langue === l}
              className={cn("rounded-full px-2.5 py-1 uppercase", langue === l ? "bg-[#0B1A2E] text-white" : "text-[#0B1A2E]/60 hover:text-[#0B1A2E]")}>{l}</button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1100px] gap-10 px-4 pb-20 pt-6 sm:px-6 lg:grid-cols-[1fr_380px] lg:gap-14">
        <section>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0B1A2E]/55 hover:text-[#0B1A2E]">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{t.retour}
          </Link>
          <h1 className="mt-6 font-display text-[30px] sm:text-[36px] font-semibold tracking-[-0.025em]">{t.titre}</h1>
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-[#4A5C72]">{t.sousTitre}</p>

          <form onSubmit={soumettre} className="mt-9 rounded-2xl border border-[#0B1A2E]/[0.08] bg-white p-6 sm:p-8 shadow-[0_24px_60px_-34px_rgba(11,26,46,0.35)]">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className={libelle}>{t.entreprise}</span>
                <input required minLength={2} maxLength={160} autoComplete="organization" value={f.entreprise} onChange={e => setF({ ...f, entreprise: e.target.value })} className={champ} /></label>
              <label className="block"><span className={libelle}>{t.nom}</span>
                <input required minLength={2} maxLength={120} autoComplete="name" value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} className={champ} /></label>
              <label className="block"><span className={libelle}>{t.telephone}</span>
                <input type="tel" maxLength={40} autoComplete="tel" value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })} className={champ} /></label>
              <div className="sm:col-span-2"><label htmlFor="ins-email" className={libelle}>{t.email}</label>
                <input id="ins-email" required type="email" maxLength={255} autoComplete="email" aria-describedby="ins-email-aide" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={champ} />
                <p id="ins-email-aide" className="mt-1.5 text-[12.5px] text-[#4A5C72]/85">{t.aideEmail}</p></div>
              <div className="sm:col-span-2"><label htmlFor="ins-pays" className={libelle}>{t.pays}</label>
                <select id="ins-pays" aria-describedby="ins-pays-aide" value={f.pays} onChange={e => setF({ ...f, pays: e.target.value })} className={champ}>
                  {PAYS.map(([code, fr, en]) => <option key={code} value={code}>{langue === "fr" ? fr : en}</option>)}
                </select>
                <p id="ins-pays-aide" className="mt-1.5 text-[12.5px] text-[#4A5C72]/85">{t.aidePays}</p></div>
              <div className="sm:col-span-2"><label htmlFor="ins-password" className={libelle}>{t.password}</label>
                <span className="relative block">
                  <input id="ins-password" aria-describedby="ins-password-regles" required type={voir ? "text" : "password"} minLength={10} maxLength={200} autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className={cn(champ, "pr-11")} />
                  <button type="button" onClick={() => setVoir(v => !v)} aria-label={voir ? (langue === "fr" ? "Masquer le mot de passe" : "Hide password") : (langue === "fr" ? "Afficher le mot de passe" : "Show password")} className="absolute right-2.5 top-1/2 mt-[3px] -translate-y-1/2 rounded-md p-1.5 text-[#0B1A2E]/45 hover:text-[#0B1A2E]">
                    {voir ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
                <span id="ins-password-regles" className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                  {t.regles.map((r, i) => (
                    <span key={r} className={cn("inline-flex items-center gap-1.5 text-[12.5px]", regles[i] ? "text-[#15803D]" : "text-[#4A5C72]/80")}>
                      <Check className={cn("h-3.5 w-3.5", regles[i] ? "opacity-100" : "opacity-30")} aria-hidden="true" />{r}
                    </span>
                  ))}
                </span></div>
              <label className="flex items-start gap-3 sm:col-span-2">
                <input type="checkbox" checked={f.conditions} onChange={e => setF({ ...f, conditions: e.target.checked })} className="mt-1 h-4 w-4 rounded border-[#0B1A2E]/30 accent-[#0B1A2E]" />
                <span className="text-[13.5px] leading-relaxed text-[#4A5C72]">{t.conditions}</span>
              </label>
            </div>

            {erreur && (
              <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl bg-[#DC2626]/[0.06] px-4 py-3 text-[14px] text-[#B91C1C]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{erreur}
              </p>
            )}

            <button type="submit" disabled={!valide || envoi} className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#0B1A2E] px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#12243D] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37] focus-visible:ring-offset-2">
              {envoi ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t.creation}</> : <>{t.creer}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
            <p className="mt-5 text-center text-[13.5px] text-[#4A5C72]">
              {t.dejaCompte} <Link to="/connexion" className="font-semibold text-[#0B1A2E] underline-offset-4 hover:underline">{t.connexion}</Link>
            </p>
          </form>
        </section>

        <aside className="lg:pt-24">
          <div className="rounded-2xl bg-[#0B1A2E] p-7 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Business · 14 {langue === "fr" ? "jours" : "days"}</p>
            <ul className="mt-5 space-y-3.5">
              {t.inclus.map(x => (
                <li key={x} className="flex items-start gap-2.5 text-[14.5px] text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F5A06E]" aria-hidden="true" />{x}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Inscription;
