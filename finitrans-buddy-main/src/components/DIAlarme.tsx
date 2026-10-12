import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/permissions";
import { playSoundWhenAllowed } from "@/lib/sound";
import { toast } from "@/hooks/use-toast";

/** Intervalle de répétition de l'alarme tant qu'une DI reste sous le seuil. */
export const DI_ALARME_INTERVALLE_MS = 2 * 60 * 60 * 1000;
const CLE = "ft_di_alarme";

type DIAlerte = { id: string; numero: string; client: string; tauxRestant: number; alerteNiveau: "warning" | "critical" };

/**
 * Alarme sonore des DI sous 20 % : sonne dès qu'une DI passe sous le seuil,
 * puis toutes les 2 heures tant que le solde n'est pas rechargé.
 */
const DIAlarme = () => {
  const navigate = useNavigate();
  const { user, hasModule, can } = useAuth();
  const actif = hasModule("di") && can("permFinancier", "lecture");

  const { data } = useQuery({
    queryKey: ["di-alertes-seuil"],
    queryFn:  () => api.get<DIAlerte[]>("/api/di/alertes-seuil"),
    enabled:  actif,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const alertes = data ?? [];
  const signature = alertes.map(a => a.id).sort().join(",");

  useEffect(() => {
    if (!actif || alertes.length === 0 || !user) return;
    const verifier = () => {
      let dernier: { signature: string; at: number } | null = null;
      try { dernier = JSON.parse(localStorage.getItem(`${CLE}:${user.id}`) ?? "null"); } catch { /* ignore */ }
      // Nouvelle DI passée sous le seuil → sonne tout de suite ; sinon toutes les 2 h
      const nouvelles = !dernier || signature.split(",").some(id => !dernier!.signature.split(",").includes(id));
      if (!nouvelles && Date.now() - dernier!.at < DI_ALARME_INTERVALLE_MS) return;
      localStorage.setItem(`${CLE}:${user.id}`, JSON.stringify({ signature, at: Date.now() }));
      playSoundWhenAllowed("alarme");
      const critiques = alertes.filter(a => a.alerteNiveau === "critical").length;
      toast({
        title: `🔔 ${alertes.length} DI sous le seuil de 20 %${critiques ? ` (dont ${critiques} critique${critiques > 1 ? "s" : ""})` : ""}`,
        description: alertes.slice(0, 4).map(a => `${a.numero} — ${a.client} : ${a.tauxRestant} %`).join(" · "),
        variant: "destructive",
      });
    };
    verifier();
    const t = setInterval(verifier, 60_000);
    return () => clearInterval(t);
  }, [actif, signature, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!actif || alertes.length === 0) return null;
  return (
    <button
      onClick={() => navigate("/di")}
      title={alertes.map(a => `${a.numero} : ${a.tauxRestant} %`).join("\n")}
      className="hidden sm:flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-destructive/10 text-destructive text-xs font-semibold animate-pulse"
    >
      <BellRing className="w-3.5 h-3.5" /> {alertes.length} DI &lt; 20 %
    </button>
  );
};

export default DIAlarme;
