import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User, Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { login } from "@/lib/api";
import FinitransLogo from "@/components/FinitransLogo";
import LoginBackground3D from "@/components/LoginBackground3D";

const STATS = [
  { label: "Dossiers gérés",  value: "2 400+", color: "#F07B37" },
  { label: "Temps économisé", value: "60%",    color: "#1A9AD6" },
  { label: "Sites connectés", value: "2",      color: "#F07B37" },
];

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState("");

  const PROFILE_REDIRECT: Record<string, string> = {
    dg:              "/dashboard",
    exploitation:    "/exploitation",
    logistique:      "/logistique",
    validation:      "/codage",
    gestion_sorties: "/sorties",
    administratif:   "/administratif",
    comptabilite:    "/comptabilite",
    terrain_kribi:   "/kribi",
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const user = await login(email, password);
      const redirect = PROFILE_REDIRECT[user.profil] ?? "/dashboard";
      navigate(redirect);
    } catch (err: any) {
      setError(err.message ?? "Identifiants incorrects");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — 3D scene ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12">
        <LoginBackground3D />

        {/* Foreground content */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative z-10"
        >
          <FinitransLogo variant="full" darkBg iconSize={72} className="mb-3" />
          <p className="text-white/50 text-sm" style={{ paddingLeft: "76px" }}>
            Plateforme de Gestion Transit & Dédouanement
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative z-10 space-y-8"
        >
          <div>
            <h2 className="text-4xl font-display font-black text-white leading-tight mb-3">
              Contrôle total de vos<br />
              <span
                className="inline-block"
                style={{
                  background: "linear-gradient(135deg, #F07B37 0%, #FFB347 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                opérations douanières
              </span>
            </h2>
            <p className="text-white/60 text-base leading-relaxed max-w-sm">
              Centralisez vos dossiers, suivez chaque étape en temps réel et anticipez les risques financiers.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.7 + i * 0.12 }}
                className="p-4 rounded-xl border border-white/10 backdrop-blur-sm"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div
                  className="text-2xl font-display font-black mb-1"
                  style={{ color: s.color }}
                >
                  {s.value}
                </div>
                <div className="text-white/50 text-xs leading-tight">{s.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {["Suivi en temps réel", "Alertes automatiques", "Reporting avancé", "Multi-sites"].map((f, i) => (
              <motion.span
                key={f}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.1 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-white/15 text-white/70"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: i % 2 === 0 ? "#F07B37" : "#1A9AD6" }}
                />
                {f}
              </motion.span>
            ))}
          </div>
        </motion.div>

        <div className="relative z-10 text-white/30 text-xs">
          © 2025 FINITRANS — Axe Digital · Douala & Kribi, Cameroun
        </div>
      </div>

      {/* ── Right panel — Form ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative overflow-hidden">
        {/* Subtle background accent */}
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #F07B37, transparent)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-5 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #1A9AD6, transparent)" }}
        />

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-10">
            <FinitransLogo variant="full" iconSize={56} />
          </div>

          {/* Header */}
          <div className="mb-8">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-3xl font-display font-black text-foreground mb-2"
            >
              Bienvenue
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-muted-foreground"
            >
              Connectez-vous à votre espace de travail
            </motion.p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Identifiant</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="votre.email@finitrans.cm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-muted/40 border-border focus:border-secondary focus:ring-secondary/20 transition-all"
                />
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-12 bg-muted/40 border-border focus:border-secondary focus:ring-secondary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
              <Button
                type="submit"
                className="w-full h-12 font-display font-bold text-base gap-2 hover:opacity-90 transition-all"
                style={{
                  background: isLoading
                    ? undefined
                    : "linear-gradient(135deg, #F07B37 0%, #e86d28 100%)",
                  border: "none",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(240,123,55,0.35)",
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Se connecter <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </motion.div>
          </form>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-center text-xs text-muted-foreground mt-8"
          >
            Mot de passe oublié ? Contactez votre administrateur
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
