import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import AppSidebar, { BarreMobile, MenuMobile } from "./AppSidebar";
import { Search, LogOut, Menu, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import NotificationPanel from "./NotificationPanel";
import DIAlarme from "./DIAlarme";
import FinitransLogo from "./FinitransLogo";
import { api, logout } from "@/lib/api";
import { SelecteurDevise, definirTaux } from "@/lib/devise";
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
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [rechercheMobile, setRechercheMobile] = useState(false);
  // Taux de change définis par la Direction (paramètre « taux_change »)
  const { data: params } = useQuery({ queryKey: ["parametres"], queryFn: () => api.get<Record<string, any>>("/api/parametres"), staleTime: 300_000 });
  useEffect(() => { definirTaux(params?.taux_change); }, [params]);
  const initiales = user?.nom
    ? user.nom.replace(/^(Mr|Mme|M\.)\s+/i, "").split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
    : "??";
  const profilLabel = user?.profilLabel ?? (user?.profil ? PROFIL_LABELS[user.profil] ?? user.profil : "");

  const rechercher = (e: React.FormEvent) => {
    e.preventDefault();
    const q = recherche.trim();
    if (q) { setRechercheMobile(false); navigate(`/dossiers?search=${encodeURIComponent(q)}`); }
  };

  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-background">
      <AppSidebar />
      <MenuMobile ouvert={menuOuvert} onOuvert={setMenuOuvert} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen overflow-x-hidden">
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border px-3 sm:px-6 py-2.5 sm:py-4 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <button type="button" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu"
              className="lg:hidden -ml-1 w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-foreground hover:bg-muted active:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden shrink-0"><FinitransLogo variant="icon" iconSize={30} /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-xl font-display font-bold text-foreground truncate leading-tight">{title}</h1>
              {subtitle && <p className="text-[11px] sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-1 sm:gap-4 shrink-0">
              {hasModule("dossiers") && (
                <>
                  <form onSubmit={rechercher} className="relative hidden md:block" role="search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un dossier..."
                      value={recherche}
                      onChange={e => setRecherche(e.target.value)}
                      className="pl-9 w-56 xl:w-64 h-9 bg-muted/50 border-none text-sm"
                      aria-label="Rechercher un dossier"
                    />
                  </form>
                  <button type="button" onClick={() => setRechercheMobile(v => !v)} aria-label="Rechercher un dossier"
                    className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted">
                    {rechercheMobile ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                  </button>
                </>
              )}
              <SelecteurDevise className="hidden sm:inline-flex" />
              <DIAlarme />
              <NotificationPanel />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => hasModule("mon_espace") && navigate("/mon-espace?onglet=profil")}
                  className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0"
                  title="Mon profil"
                >
                  <span className="text-xs font-bold text-primary-foreground">{initiales}</span>
                </button>
                <div className="hidden xl:block">
                  <p className="text-sm font-medium text-foreground leading-tight">{user?.nom ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{profilLabel}</p>
                </div>
                <button
                  onClick={() => logout()}
                  title="Se déconnecter"
                  className="hidden sm:block ml-1 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {rechercheMobile && hasModule("dossiers") && (
            <form onSubmit={rechercher} className="md:hidden relative mt-2.5" role="search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input autoFocus placeholder="N° de dossier, client, conteneur…" value={recherche} onChange={e => setRecherche(e.target.value)}
                className="pl-9 h-11 bg-muted/60 border-none text-base" aria-label="Rechercher un dossier" enterKeyHint="search" />
            </form>
          )}
        </header>
        <main className="flex-1 min-w-0 p-3 sm:p-6 pb-24 lg:pb-6">{children}</main>
      </div>
      <BarreMobile onMenu={() => setMenuOuvert(true)} />
    </div>
  );
};

export default AppLayout;
