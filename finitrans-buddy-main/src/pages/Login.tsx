import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Workflow, Users } from "lucide-react";
import { getStoredUser, isAuthenticated, login } from "@/lib/api";
import { homeFor } from "@/components/RequireModule";
import PlateformeLogo from "@/components/marque/PlateformeLogo";
import { MARQUE } from "@/config/marque";

/** Motifs pour lesquels une session a été fermée par le serveur (abonnement, suspension). */
const MOTIFS: Record<string, string> = {
  ESSAI_TERMINE: "La période d'essai de votre espace est terminée. Contactez-nous pour activer votre abonnement : vos données sont conservées.",
  ORGANISATION_SUSPENDUE: "L'espace de votre entreprise est suspendu. Contactez le support de la plateforme.",
  ABONNEMENT_INACTIF: "L'abonnement de votre espace n'est pas actif. Contactez le support de la plateforme.",
  ORGANISATION_INTROUVABLE: "L'espace associé à ce compte est introuvable.",
};

const POINTS = [
  { icone: Workflow, texte: "Chaque dossier, sa prochaine action et son responsable" },
  { icone: Users, texte: "Vos collaborateurs arrivent directement dans l'espace de l'entreprise" },
  { icone: ShieldCheck, texte: "Données strictement isolées par entreprise" },
];

const Login = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(() => MOTIFS[params.get("motif") ?? ""] ?? "");

  // Déjà connecté : aller directement à l'accueil du profil
  useEffect(() => {
    if (isAuthenticated()) navigate(homeFor(getStoredUser()), { replace: true });
  }, [navigate]);

  useEffect(() => { document.title = `Connexion — ${MARQUE.nom}`; }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const user = await login(email.trim(), password);
      navigate(homeFor(user));
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "Identifiants incorrects");
    } finally {
      setIsLoading(false);
    }
  };

  const champ = "block w-full rounded-xl border border-[#0B1A2E]/[0.12] bg-white py-3 pl-10 pr-3.5 text-[15px] text-[#0B1A2E] placeholder:text-[#0B1A2E]/35 transition focus:border-[#0B1A2E]/40 focus:outline-none focus:ring-4 focus:ring-[#0B1A2E]/[0.06]";

  return (
    <div className="min-h-screen flex bg-[#F6F7F9] font-body antialiased">
      {/* Panneau d'identité */}
      <aside className="relative hidden lg:flex lg:w-[46%] flex-col justify-between overflow-hidden bg-[#0B1A2E] p-12 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 80% 70% at 30% 40%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 30% 40%, black 30%, transparent 75%)",
          }} />
        <Link to="/" className="relative w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37]" aria-label={`${MARQUE.nom} — accueil`}>
          <PlateformeLogo clair taille={32} />
        </Link>
        <div className="relative max-w-md">
          <h2 className="font-display text-[38px] leading-[1.1] font-semibold tracking-[-0.03em]">
            Le système d'exploitation de votre <span className="text-[#F5A06E]">entreprise de transit.</span>
          </h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map(({ icone: Icone, texte }) => (
              <li key={texte} className="flex items-start gap-3 text-[15px] text-white/75">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10"><Icone className="h-3.5 w-3.5" aria-hidden="true" /></span>
                {texte}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12.5px] text-white/35">© {MARQUE.annee} {MARQUE.nom}</p>
      </aside>

      {/* Formulaire */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Link to="/" aria-label={`${MARQUE.nom} — accueil`}><PlateformeLogo taille={28} /></Link>
          </div>
          <Link to="/" className="mb-8 hidden lg:inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0B1A2E]/55 hover:text-[#0B1A2E]">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Retour au site
          </Link>

          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] text-[#0B1A2E]">Connexion</h1>
          <p className="mt-2 text-[15px] text-[#4A5C72]">Votre adresse email ouvre directement l'espace de votre entreprise.</p>

          <form onSubmit={handleLogin} className="mt-9 space-y-5">
            <label className="block">
              <span className="text-[13px] font-medium text-[#0B1A2E]/75">Email professionnel</span>
              <span className="relative mt-1.5 block">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1A2E]/40" aria-hidden="true" />
                <input type="email" name="email" required autoComplete="email" placeholder="prenom.nom@entreprise.com" value={email} onChange={e => setEmail(e.target.value)} className={champ} />
              </span>
            </label>

            <label className="block">
              <span className="text-[13px] font-medium text-[#0B1A2E]/75">Mot de passe</span>
              <span className="relative mt-1.5 block">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1A2E]/40" aria-hidden="true" />
                <input type={showPassword ? "text" : "password"} name="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className={`${champ} pr-11`} />
                <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#0B1A2E]/45 hover:text-[#0B1A2E]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#DC2626]/[0.06] px-4 py-3 text-[14px] text-[#B91C1C]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}
              </p>
            )}

            <button type="submit" disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0B1A2E] px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#12243D] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07B37] focus-visible:ring-offset-2">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Connexion…</> : <>Se connecter <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
          </form>

          <p className="mt-6 text-[13px] leading-relaxed text-[#4A5C72]">
            Mot de passe oublié ? La direction de votre entreprise peut le réinitialiser depuis la gestion des employés.
          </p>

          <div className="mt-10 rounded-2xl border border-[#0B1A2E]/[0.08] bg-white p-5">
            <p className="text-[14px] font-semibold text-[#0B1A2E]">Votre entreprise n'a pas encore d'espace ?</p>
            <p className="mt-1 text-[13.5px] text-[#4A5C72]">Créez-le en deux minutes : essai gratuit de 14 jours.</p>
            <Link to="/inscription" className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#C2581C] hover:text-[#A54812]">
              Créer l'espace de mon entreprise<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
