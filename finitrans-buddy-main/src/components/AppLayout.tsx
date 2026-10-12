import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { Search, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import NotificationPanel from "./NotificationPanel";
import DIAlarme from "./DIAlarme";
import { logout } from "@/lib/api";
import { PROFIL_LABELS, useAuth } from "@/lib/permissions";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const AppLayout = ({ children, title, subtitle }: AppLayoutProps) => {
  const navigate = useNavigate();
  const { user, hasModule } = useAuth();
  const [recherche, setRecherche] = useState("");
  const initiales = user?.nom
    ? user.nom.replace(/^(Mr|Mme|M\.)\s+/i, "").split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
    : "??";
  const profilLabel = user?.profilLabel ?? (user?.profil ? PROFIL_LABELS[user.profil] ?? user.profil : "");

  const rechercher = (e: React.FormEvent) => {
    e.preventDefault();
    const q = recherche.trim();
    if (q) navigate(`/dossiers?search=${encodeURIComponent(q)}`);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-display font-bold text-foreground truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-4">
              {hasModule("dossiers") && (
                <form onSubmit={rechercher} className="relative hidden md:block" role="search">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un dossier..."
                    value={recherche}
                    onChange={e => setRecherche(e.target.value)}
                    className="pl-9 w-64 h-9 bg-muted/50 border-none text-sm"
                    aria-label="Rechercher un dossier"
                  />
                </form>
              )}
              <DIAlarme />
              <NotificationPanel />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => hasModule("mon_espace") && navigate("/mon-espace?onglet=profil")}
                  className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
                  title="Mon profil"
                >
                  <span className="text-xs font-bold text-primary-foreground">{initiales}</span>
                </button>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-foreground leading-tight">{user?.nom ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{profilLabel}</p>
                </div>
                <button
                  onClick={() => logout()}
                  title="Se déconnecter"
                  className="ml-1 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;
