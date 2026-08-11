import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, FolderOpen, Users, Bell, DollarSign,
  MapPin, ChevronLeft, ChevronRight, LogOut, Settings,
  ClipboardList, MessageSquare, BarChart3, Banknote,
  CheckSquare, PackageOpen, Truck, BookOpen, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api, logout, getStoredUser } from "@/lib/api";
import FinitransLogo from "./FinitransLogo";

type NavItem = {
  label:    string;
  icon:     React.ElementType;
  path:     string;
  badge?:   boolean;
  profils?: string[];
  permKey?: keyof ReturnType<typeof getStoredUser> & string;
};

// ── Règles de visibilité par profil (selon organigramme réel) ────────────────
//
//  dg              → tout (Mr DELBA, coordination générale)
//  exploitation    → tout sauf comptabilité pure (Mr SOUDI, contrôle et suivi)
//  logistique      → dossiers, logistique, finance, alertes (Mr YAYA, transport/paiements taxes)
//  validation      → dossiers, codage, alertes (Mme ODETTE, codage/validation déclarations)
//  gestion_sorties → dossiers, sorties, finance, alertes (Mr WANDALA/RASOUL, sorties/factures)
//  administration  → dossiers, administratif, finance, di, alertes (Mme YASMINE, enregistrement/DI)
//  comptabilite    → comptabilité, finance, di, reporting, alertes (Mr HONORÉ, OHADA)
//  terrain_kribi   → dossiers (assignés), kribi, finance, alertes (Mr ALIOU/RAPHAEL)

const NAV_ITEMS: NavItem[] = [
  {
    label: "Tableau de bord",
    icon:  LayoutDashboard,
    path:  "/dashboard",
    // visible à tous
  },
  {
    label:   "Exploitation",
    icon:    ClipboardList,
    path:    "/exploitation",
    profils: ["dg", "exploitation"],
  },
  {
    label:   "Dossiers",
    icon:    FolderOpen,
    path:    "/dossiers",
    permKey: "permDossier",
  },
  {
    label:   "Codage & Validation",
    icon:    CheckSquare,
    path:    "/codage",
    profils: ["dg", "exploitation", "validation"],
  },
  {
    label:   "Gestion Sorties",
    icon:    PackageOpen,
    path:    "/sorties",
    profils: ["dg", "exploitation", "gestion_sorties"],
  },
  {
    label:   "Logistique",
    icon:    Truck,
    path:    "/logistique",
    profils: ["dg", "exploitation", "logistique"],
  },
  {
    label: "Messagerie",
    icon:  MessageSquare,
    path:  "/messagerie",
  },
  {
    label:  "Alertes",
    icon:   Bell,
    path:   "/alertes",
    badge:  true,
  },
  {
    label:   "Finance",
    icon:    DollarSign,
    path:    "/finance",
    permKey: "permFinancier",
  },
  {
    label:   "Gestion DI",
    icon:    Banknote,
    path:    "/di",
    // Yasmine (suivi DI), Honoré (financier), DG, Exploitation
    profils: ["dg", "exploitation", "administration", "comptabilite"],
  },
  {
    label:   "Comptabilité",
    icon:    BookOpen,
    path:    "/comptabilite",
    profils: ["dg", "comptabilite"],
  },
  {
    label:   "Administratif",
    icon:    ClipboardList,
    path:    "/administratif",
    profils: ["dg", "exploitation", "administration"],
  },
  {
    label:   "Employés",
    icon:    Users,
    path:    "/employes",
    permKey: "permAdministration",
  },
  {
    label:   "Kribi",
    icon:    MapPin,
    path:    "/kribi",
    profils: ["dg", "exploitation", "terrain_kribi"],
  },
  {
    label:   "Reporting",
    icon:    BarChart3,
    path:    "/reporting",
    permKey: "permRapports",
  },
  {
    label:   "Performance",
    icon:    Trophy,
    path:    "/performance",
    profils: ["dg", "exploitation"],
  },
];

// ── Labels des profils pour l'affichage ──────────────────────────────────────
const PROFIL_LABELS: Record<string, string> = {
  dg:             "Directeur Général",
  exploitation:   "Resp. Exploitation",
  logistique:     "Resp. Logistique",
  validation:     "Resp. Validation",
  gestion_sorties:"Resp. Gestion Sorties",
  administration: "Service Administratif",
  comptabilite:   "Comptable",
  terrain_kribi:  "Terrain Kribi",
};

const AppSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const user = getStoredUser();

  const { data } = useQuery({
    queryKey:        ["alertes-count"],
    queryFn:         () => api.get<any>("/api/alertes?limit=1"),
    refetchInterval: 60_000,
  });
  const unreadAlerts = data?.nonLues ?? 0;

  const isVisible = (item: NavItem): boolean => {
    if (!user) return true;

    // Vérification par profil
    if (item.profils && !item.profils.includes(user.profil)) return false;

    // Vérification par permission
    if (item.permKey) {
      const val = (user as unknown as Record<string, string>)[item.permKey];
      if (val === "non") return false;
    }

    // Règles spécifiques par profil (sans profils ni permKey définis = visible à tous)
    // Ex: "Messagerie" et "Alertes" sont visibles à tous → OK

    return true;
  };

  const showSettings =
    !user || (user as unknown as Record<string, string>)["permAdministration"] !== "non";

  const profilLabel = user?.profil ? (PROFIL_LABELS[user.profil] ?? user.profil) : "";

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
          <p className="text-[10px] text-sidebar-muted truncate">{profilLabel || user.role}</p>
          {user.compagniesAssignees?.length > 0 && (
            <p className="text-[10px] text-sidebar-muted/70 truncate mt-0.5">
              {user.compagniesAssignees.join(", ").replace(/_/g, "-")}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.filter(isVisible).map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
          const badge = item.badge ? unreadAlerts : 0;
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
                    <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 space-y-1 border-t border-sidebar-border">
        {showSettings && (
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
