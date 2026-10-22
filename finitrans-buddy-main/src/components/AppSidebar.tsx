import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, FolderOpen, Users, Bell, DollarSign,
  MapPin, ChevronLeft, ChevronRight, LogOut, Settings,
  ClipboardList, MessageSquare, BarChart3, Banknote,
  CheckSquare, PackageOpen, Truck, BookOpen, Trophy,
  ListTodo, Radar, Building2, Calculator, FileStack, BookUser, Library, Gem, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api, logout } from "@/lib/api";
import { Module, PROFIL_LABELS, useAuth } from "@/lib/permissions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import FinitransLogo from "./FinitransLogo";

type NavItem = {
  label:  string;
  court?: string;
  icon:   React.ElementType;
  path:   string;
  module: Module;
  badge?: "alertes" | "taches";
};

type NavGroup = { titre: string; items: NavItem[] };

// La visibilité de chaque entrée découle des modules attribués au rôle (Administration → Rôles)
const NAV: NavGroup[] = [
  {
    titre: "Pilotage",
    items: [
      { label: "Tableau de bord", court: "Accueil", icon: LayoutDashboard, path: "/dashboard",   module: "dashboard" },
      { label: "Mon espace",      court: "Mes tâches", icon: ListTodo,     path: "/mon-espace",  module: "mon_espace", badge: "taches" },
      { label: "Supervision",     icon: Radar,           path: "/supervision", module: "supervision" },
      { label: "Exploitation",    icon: ClipboardList,   path: "/exploitation", module: "exploitation" },
    ],
  },
  {
    titre: "Opérations",
    items: [
      { label: "Dossiers",            icon: FolderOpen,  path: "/dossiers",      module: "dossiers" },
      { label: "Codage & Validation", court: "Codage", icon: CheckSquare, path: "/codage",        module: "codage" },
      { label: "Gestion Sorties",     court: "Sorties", icon: PackageOpen, path: "/sorties",       module: "sorties" },
      { label: "Logistique",          icon: Truck,       path: "/logistique",    module: "logistique" },
      { label: "Kribi",               icon: MapPin,      path: "/kribi",         module: "kribi" },
      { label: "Administratif",       icon: FileStack,   path: "/administratif", module: "administratif" },
    ],
  },
  {
    titre: "Finance",
    items: [
      { label: "Finance",              icon: DollarSign, path: "/finance",              module: "finance" },
      { label: "CRM clients",          court: "CRM", icon: Gem, path: "/crm",           module: "crm" },
      { label: "Gestion DI",           court: "DI", icon: Banknote, path: "/di",        module: "di" },
      { label: "Comptabilité",         court: "Compta", icon: BookOpen, path: "/comptabilite", module: "comptabilite" },
      { label: "Comptabilité avancée", icon: Calculator, path: "/comptabilite-avancee", module: "comptabilite_avancee" },
    ],
  },
  {
    titre: "Direction",
    items: [
      { label: "Administration", icon: Building2, path: "/administration", module: "administration" },
      { label: "Employés & rôles", icon: Users,   path: "/employes",       module: "employes" },
      { label: "Reporting",      icon: BarChart3, path: "/reporting",      module: "reporting" },
      { label: "Performance",    icon: Trophy,    path: "/performance",    module: "performance" },
    ],
  },
  {
    titre: "Communication",
    items: [
      { label: "Messagerie", icon: MessageSquare, path: "/messagerie", module: "messagerie" },
      { label: "Bibliothèque", icon: Library,     path: "/bibliotheque", module: "bibliotheque" },
      { label: "Répertoire", icon: BookUser,      path: "/repertoire", module: "repertoire" },
      { label: "Alertes",    icon: Bell,          path: "/alertes",    module: "alertes", badge: "alertes" },
    ],
  },
];

const TOUS = NAV.flatMap(g => g.items);
const ALERTES = TOUS.find(i => i.path === "/alertes")!;

/** Module « métier » mis en avant dans la barre mobile, selon ce que le profil utilise le plus. */
const PRIORITE_METIER: Module[] = ["supervision", "codage", "sorties", "kribi", "logistique", "finance", "di", "crm", "administratif", "comptabilite"];

function useNavigation() {
  const location = useLocation();
  const { user, hasModule, superviseur } = useAuth();

  // Employés : les Alertes sont le menu par défaut, en tête de la navigation
  const groupes: NavGroup[] = superviseur ? NAV : NAV.map((g, i) => ({
    ...g,
    items: i === 0 ? [ALERTES, ...g.items] : g.items.filter(it => it.path !== "/alertes"),
  }));

  const { data: alertes } = useQuery({
    queryKey:        ["alertes-count"],
    queryFn:         () => api.get<any>("/api/alertes?limit=1"),
    refetchInterval: 60_000,
    enabled:         hasModule("alertes"),
  });
  const { data: taches } = useQuery({
    queryKey:        ["mes-taches"],
    queryFn:         () => api.get<any>("/api/employe/mes-taches"),
    refetchInterval: 60_000,
    enabled:         hasModule("mon_espace"),
  });
  const badges = {
    alertes: alertes?.nonLues ?? 0,
    taches:  (taches?.resume?.actionnables ?? 0) + (taches?.resume?.pretesAAvancer ?? 0),
  };
  const estActif = (path: string) =>
    location.pathname === path || (path !== "/dashboard" && location.pathname.startsWith(path + "/"));
  const profilLabel = user?.profilLabel ?? (user?.profil ? PROFIL_LABELS[user.profil] ?? user.profil : "");
  return { user, hasModule, superviseur, groupes, badges, estActif, profilLabel, location };
}

function Pastille({ n, type }: { n: number; type?: "alertes" | "taches" }) {
  if (n <= 0) return null;
  return (
    <span className={cn(
      "min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
      type === "taches" ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground",
    )}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** Liste des menus (barre latérale de bureau et tiroir mobile). */
function ListeNavigation({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { groupes, hasModule, badges, estActif, location } = useNavigation();
  return (
    <>
      <nav className="flex-1 p-3 overflow-y-auto overscroll-contain" aria-label="Navigation principale">
        {groupes.map(group => {
          const items = group.items.filter(i => hasModule(i.module));
          if (items.length === 0) return null;
          return (
            <div key={group.titre} className="mb-3">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/70">{group.titre}</p>
              )}
              <div className="space-y-1">
                {items.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    className={cn("sidebar-item", estActif(item.path) ? "sidebar-item-active" : "sidebar-item-inactive")}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && <Pastille n={badges[item.badge]} type={item.badge} />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="p-3 space-y-1 border-t border-sidebar-border">
        {hasModule("parametres") && (
          <NavLink
            to="/parametres"
            onClick={onNavigate}
            className={cn("sidebar-item", location.pathname === "/parametres" ? "sidebar-item-active" : "sidebar-item-inactive")}
            title={collapsed ? "Paramètres" : undefined}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Paramètres</span>}
          </NavLink>
        )}
        <button
          onClick={() => logout()}
          className={cn("sidebar-item sidebar-item-inactive w-full")}
          title={collapsed ? "Déconnexion" : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </>
  );
}

function EnteteUtilisateur() {
  const { user, profilLabel } = useNavigation();
  if (!user) return null;
  return (
    <div className="px-4 py-2.5 border-b border-sidebar-border bg-sidebar-accent/30">
      <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.nom}</p>
      <p className="text-[10px] text-sidebar-muted truncate">{profilLabel}</p>
      {user.compagniesAssignees?.length > 0 && user.compagniesAssignees.length < 4 && (
        <p className="text-[10px] text-sidebar-muted/70 truncate mt-0.5">
          {user.compagniesAssignees.join(", ").replace(/_/g, "-")}
        </p>
      )}
    </div>
  );
}

/** Barre latérale (ordinateur et tablette en paysage, ≥ 1024 px). */
const AppSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "hidden lg:flex h-screen bg-sidebar flex-col transition-all duration-300 sticky top-0 shrink-0",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="px-3 py-3 flex items-center border-b border-sidebar-border min-h-[68px]">
        {collapsed ? <FinitransLogo variant="icon" iconSize={42} /> : <FinitransLogo variant="full" darkBg iconSize={46} />}
      </div>
      {!collapsed && <EnteteUtilisateur />}
      <ListeNavigation collapsed={collapsed} />
      <div className="px-3 pb-3">
        <button onClick={() => setCollapsed(c => !c)} className="sidebar-item sidebar-item-inactive w-full">
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && <span className="text-xs">Réduire</span>}
        </button>
      </div>
    </aside>
  );
};

/** Tiroir de navigation complet (téléphone et tablette en portrait). */
export function MenuMobile({ ouvert, onOuvert }: { ouvert: boolean; onOuvert: (v: boolean) => void }) {
  return (
    <Sheet open={ouvert} onOpenChange={onOuvert}>
      <SheetContent side="left" className="w-[86vw] max-w-[320px] p-0 bg-sidebar border-sidebar-border flex flex-col gap-0 [&>button]:text-sidebar-foreground">
        <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
        <div className="px-3 py-3 flex items-center border-b border-sidebar-border min-h-[64px] pt-[max(0.75rem,env(safe-area-inset-top))]">
          <FinitransLogo variant="full" darkBg iconSize={42} />
        </div>
        <EnteteUtilisateur />
        <ListeNavigation onNavigate={() => onOuvert(false)} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Barre d'onglets mobile : les accès essentiels du profil (tâches, dossiers, module métier, alertes)
 * et le menu complet. Affichée sous 1024 px.
 */
export function BarreMobile({ onMenu }: { onMenu: () => void }) {
  const { hasModule, badges, estActif, superviseur } = useNavigation();
  const choisir = (path: string) => TOUS.find(i => i.path === path && hasModule(i.module));
  const metier = PRIORITE_METIER.map(m => TOUS.find(i => i.module === m && hasModule(m))).find(Boolean);
  const candidats = [
    superviseur ? choisir("/dashboard") ?? choisir("/mon-espace") : choisir("/mon-espace") ?? choisir("/dashboard"),
    choisir("/dossiers"),
    metier,
    choisir("/alertes"),
  ];
  const onglets = candidats.filter((x, i, a): x is NavItem => !!x && a.findIndex(y => y?.path === x.path) === i).slice(0, 4);
  return (
    <nav
      aria-label="Navigation rapide"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.15)]"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${onglets.length + 1}, minmax(0, 1fr))` }}>
        {onglets.map(item => {
          const actif = estActif(item.path);
          const n = item.badge ? badges[item.badge] : 0;
          return (
            <NavLink key={item.path} to={item.path}
              className={cn("relative flex flex-col items-center justify-center gap-0.5 h-16 text-[10.5px] font-medium transition-colors",
                actif ? "text-secondary" : "text-muted-foreground active:text-foreground")}>
              {actif && <span className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-secondary" />}
              <span className="relative">
                <item.icon className="w-[22px] h-[22px]" strokeWidth={actif ? 2.4 : 1.9} />
                {n > 0 && (
                  <span className={cn("absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-card",
                    item.badge === "taches" ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground")}>
                    {n > 9 ? "9+" : n}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full px-1">{item.court ?? item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={onMenu} aria-label="Ouvrir le menu"
          className="flex flex-col items-center justify-center gap-0.5 h-16 text-[10.5px] font-medium text-muted-foreground active:text-foreground">
          <Menu className="w-[22px] h-[22px]" strokeWidth={1.9} />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}

export default AppSidebar;
