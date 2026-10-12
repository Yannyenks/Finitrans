import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, FolderOpen, Users, Bell, DollarSign,
  MapPin, ChevronLeft, ChevronRight, LogOut, Settings,
  ClipboardList, MessageSquare, BarChart3, Banknote,
  CheckSquare, PackageOpen, Truck, BookOpen, Trophy,
  ListTodo, Radar, Building2, Calculator, FileStack,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api, logout } from "@/lib/api";
import { Module, PROFIL_LABELS, useAuth } from "@/lib/permissions";
import FinitransLogo from "./FinitransLogo";

type NavItem = {
  label:  string;
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
      { label: "Tableau de bord", icon: LayoutDashboard, path: "/dashboard",   module: "dashboard" },
      { label: "Mon espace",      icon: ListTodo,        path: "/mon-espace",  module: "mon_espace", badge: "taches" },
      { label: "Supervision",     icon: Radar,           path: "/supervision", module: "supervision" },
      { label: "Exploitation",    icon: ClipboardList,   path: "/exploitation", module: "exploitation" },
    ],
  },
  {
    titre: "Opérations",
    items: [
      { label: "Dossiers",            icon: FolderOpen,  path: "/dossiers",      module: "dossiers" },
      { label: "Codage & Validation", icon: CheckSquare, path: "/codage",        module: "codage" },
      { label: "Gestion Sorties",     icon: PackageOpen, path: "/sorties",       module: "sorties" },
      { label: "Logistique",          icon: Truck,       path: "/logistique",    module: "logistique" },
      { label: "Kribi",               icon: MapPin,      path: "/kribi",         module: "kribi" },
      { label: "Administratif",       icon: FileStack,   path: "/administratif", module: "administratif" },
    ],
  },
  {
    titre: "Finance",
    items: [
      { label: "Finance",              icon: DollarSign, path: "/finance",              module: "finance" },
      { label: "Gestion DI",           icon: Banknote,   path: "/di",                   module: "di" },
      { label: "Comptabilité",         icon: BookOpen,   path: "/comptabilite",         module: "comptabilite" },
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
      { label: "Alertes",    icon: Bell,          path: "/alertes",    module: "alertes", badge: "alertes" },
    ],
  },
];

const AppSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, hasModule, superviseur } = useAuth();

  // Employés : les Alertes sont le menu par défaut, en tête de la navigation
  const groupes: NavGroup[] = superviseur ? NAV : NAV.map((g, i) => ({
    ...g,
    items: i === 0
      ? [{ label: "Alertes", icon: Bell, path: "/alertes", module: "alertes", badge: "alertes" } as NavItem, ...g.items]
      : g.items.filter(it => it.path !== "/alertes"),
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

  const profilLabel = user?.profilLabel ?? (user?.profil ? PROFIL_LABELS[user.profil] ?? user.profil : "");

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar flex flex-col transition-all duration-300 sticky top-0",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      {/* Logo */}
      <div className="px-3 py-3 flex items-center border-b border-sidebar-border min-h-[68px]">
        {collapsed ? (
          <FinitransLogo variant="icon" iconSize={42} />
        ) : (
          <FinitransLogo variant="full" darkBg iconSize={46} />
        )}
      </div>

      {/* User info */}
      {!collapsed && user && (
        <div className="px-4 py-2.5 border-b border-sidebar-border bg-sidebar-accent/30">
          <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.nom}</p>
          <p className="text-[10px] text-sidebar-muted truncate">{profilLabel}</p>
          {user.compagniesAssignees?.length > 0 && user.compagniesAssignees.length < 4 && (
            <p className="text-[10px] text-sidebar-muted/70 truncate mt-0.5">
              {user.compagniesAssignees.join(", ").replace(/_/g, "-")}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto" aria-label="Navigation principale">
        {groupes.map(group => {
          const items = group.items.filter(i => hasModule(i.module));
          if (items.length === 0) return null;
          return (
            <div key={group.titre} className="mb-3">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/70">{group.titre}</p>
              )}
              <div className="space-y-1">
                {items.map(item => {
                  const isActive =
                    location.pathname === item.path ||
                    (item.path !== "/dashboard" && location.pathname.startsWith(item.path + "/"));
                  const badge = item.badge ? badges[item.badge] : 0;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={cn("sidebar-item", isActive ? "sidebar-item-active" : "sidebar-item-inactive")}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {badge > 0 && (
                            <span className={cn(
                              "min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                              item.badge === "taches" ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground",
                            )}>
                              {badge > 9 ? "9+" : badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 space-y-1 border-t border-sidebar-border">
        {hasModule("parametres") && (
          <NavLink
            to="/parametres"
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
        <button
          onClick={() => setCollapsed(c => !c)}
          className="sidebar-item sidebar-item-inactive w-full"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && <span className="text-xs">Réduire</span>}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
