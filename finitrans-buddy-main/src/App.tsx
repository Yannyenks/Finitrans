import { Component, ReactNode, Suspense, lazy, useEffect } from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, refreshSessionUser } from "@/lib/api";
import RequireModule from "@/components/RequireModule";
import Login from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Dossiers = lazy(() => import("./pages/Dossiers"));
const DossierDetail = lazy(() => import("./pages/DossierDetail"));
const Employes = lazy(() => import("./pages/Employes"));
const EmployeDetail = lazy(() => import("./pages/EmployeDetail"));
const Alertes = lazy(() => import("./pages/Alertes"));
const Finance = lazy(() => import("./pages/Finance"));
const Kribi = lazy(() => import("./pages/Kribi"));
const SuiviClient = lazy(() => import("./pages/SuiviClient"));
const Exploitation = lazy(() => import("./pages/Exploitation"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Messagerie = lazy(() => import("./pages/Messagerie"));
const Repertoire = lazy(() => import("./pages/Repertoire"));
const Bibliotheque = lazy(() => import("./pages/Bibliotheque"));
const Reporting = lazy(() => import("./pages/Reporting"));
const GestionDI = lazy(() => import("./pages/GestionDI"));
const Codage = lazy(() => import("./pages/Codage"));
const GestionSorties = lazy(() => import("./pages/GestionSorties"));
const Logistique = lazy(() => import("./pages/Logistique"));
const Comptabilite = lazy(() => import("./pages/Comptabilite"));
const Administratif = lazy(() => import("./pages/Administratif"));
const Performance = lazy(() => import("./pages/Performance"));
const MonEspace = lazy(() => import("./pages/MonEspace"));
const Supervision = lazy(() => import("./pages/Supervision"));
const Administration = lazy(() => import("./pages/Administration"));
const ComptabiliteAvancee = lazy(() => import("./pages/ComptabiliteAvancee"));
const Crm = lazy(() => import("./pages/Crm"));
import NotFound from "./pages/NotFound";
import { AffichageDevise } from "@/lib/devise";

// ── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-lg w-full stat-card text-center" data-testid="error-boundary">
            <h2 className="font-display text-lg font-bold text-destructive mb-2">Une erreur d'affichage est survenue</h2>
            <p className="text-sm text-muted-foreground mb-4">{this.state.error.message}</p>
            <div className="flex gap-2 justify-center">
              <button className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm" onClick={() => this.setState({ error: null })}>
                Réessayer
              </button>
              <button className="px-4 py-2 rounded-lg border border-border text-sm" onClick={() => { window.location.href = "/"; }}>
                Accueil
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient: QueryClient = new QueryClient({
  // Après chaque action réussie, toutes les données affichées sont rechargées (statuts, assignations, avancement)
  mutationCache: new MutationCache({
    onSuccess: () => { queryClient.invalidateQueries(); },
  }),
  defaultOptions: {
    queries: {
      // Pas de nouvelle tentative sur les refus d'accès / introuvables ; sinon délai progressif (réveil Neon)
      retry: (count, error) => {
        if (error instanceof ApiError && [400, 403, 404, 422].includes(error.status)) return false;
        return count < 3;
      },
      retryDelay: (attempt) => Math.min(2_000 * (attempt + 1), 8_000),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

/** Synchronise le rôle et les modules au démarrage (après une attribution de rôle par la Direction). */
const SessionSync = () => {
  useEffect(() => {
    refreshSessionUser();
    const onFocus = () => refreshSessionUser();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return null;
};

// Pages chargées à la demande (bundle initial léger)
const Chargement = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
  </div>
);

const R = (module: Parameters<typeof RequireModule>[0]["module"], el: ReactNode) => (
  <RequireModule module={module}><ErrorBoundary><Suspense fallback={<Chargement />}>{el}</Suspense></ErrorBoundary></RequireModule>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionSync />
      <BrowserRouter>
        <AffichageDevise>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/suivi/:token" element={<Suspense fallback={<Chargement />}><SuiviClient /></Suspense>} />
          <Route path="/dashboard"            element={R("dashboard", <Dashboard />)} />
          <Route path="/mon-espace"           element={R("mon_espace", <MonEspace />)} />
          <Route path="/supervision"          element={R("supervision", <Supervision />)} />
          <Route path="/exploitation"         element={R("exploitation", <Exploitation />)} />
          <Route path="/dossiers"             element={R("dossiers", <Dossiers />)} />
          <Route path="/dossiers/:id"         element={R("dossiers", <DossierDetail />)} />
          <Route path="/codage"               element={R("codage", <Codage />)} />
          <Route path="/sorties"              element={R("sorties", <GestionSorties />)} />
          <Route path="/logistique"           element={R("logistique", <Logistique />)} />
          <Route path="/comptabilite"         element={R("comptabilite", <Comptabilite />)} />
          <Route path="/comptabilite-avancee" element={R("comptabilite_avancee", <ComptabiliteAvancee />)} />
          <Route path="/administratif"        element={R("administratif", <Administratif />)} />
          <Route path="/administration"       element={R("administration", <Administration />)} />
          <Route path="/employes"             element={R("employes", <Employes />)} />
          <Route path="/employes/:name"       element={R("employes", <EmployeDetail />)} />
          <Route path="/alertes"              element={R("alertes", <Alertes />)} />
          <Route path="/finance"              element={R("finance", <Finance />)} />
          <Route path="/di"                   element={R("di", <GestionDI />)} />
          <Route path="/kribi"                element={R("kribi", <Kribi />)} />
          <Route path="/messagerie"           element={R("messagerie", <Messagerie />)} />
          <Route path="/repertoire"           element={R("repertoire", <Repertoire />)} />
          <Route path="/bibliotheque"         element={R("bibliotheque", <Bibliotheque />)} />
          <Route path="/reporting"            element={R("reporting", <Reporting />)} />
          <Route path="/performance"          element={R("performance", <Performance />)} />
          <Route path="/parametres"           element={R("parametres", <Parametres />)} />
          <Route path="/crm"                  element={R("crm", <Crm />)} />
          <Route path="/crm/:id"              element={R("crm", <Crm />)} />
          <Route path="*"                     element={<NotFound />} />
        </Routes>
        </AffichageDevise>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
