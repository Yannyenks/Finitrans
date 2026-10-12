import { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { AuthUser, isAuthenticated } from "@/lib/api";
import { Module, hasModule, isSupervisor, useAuth } from "@/lib/permissions";
import AppLayout from "./AppLayout";
import { Button } from "./ui/button";

/** Page d'accueil selon le rôle : la Direction pilote, les autres comptes traitent leurs tâches. */
export function homeFor(user: AuthUser | null): string {
  if (!user) return "/";
  if (user.profil === "dg") return "/dashboard";
  if (isSupervisor(user)) return "/supervision";
  return hasModule(user, "mon_espace") ? "/mon-espace" : "/dashboard";
}

const AccesRefuse = ({ module }: { module: Module }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <AppLayout title="Accès non autorisé">
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <h2 className="font-display text-lg font-bold text-foreground mb-2">Module non attribué à votre rôle</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Le module « {module} » ne fait pas partie du rôle {user?.profilLabel ?? user?.profil}.
          Contactez la Direction si vous en avez besoin.
        </p>
        <Button onClick={() => navigate(homeFor(user))} className="bg-secondary text-secondary-foreground">
          Retour à mon accueil
        </Button>
      </div>
    </AppLayout>
  );
};

/** Route protégée : authentification + module attribué au rôle. */
const RequireModule = ({ module, children }: { module?: Module; children: ReactNode }) => {
  const { user } = useAuth();
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (module && !hasModule(user, module)) return <AccesRefuse module={module} />;
  return <>{children}</>;
};

export default RequireModule;
