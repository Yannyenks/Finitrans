import { Component, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isAuthenticated } from "@/lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Dossiers from "./pages/Dossiers";
import DossierDetail from "./pages/DossierDetail";
import Employes from "./pages/Employes";
import EmployeDetail from "./pages/EmployeDetail";
import Alertes from "./pages/Alertes";
import Finance from "./pages/Finance";
import Kribi from "./pages/Kribi";
import Exploitation from "./pages/Exploitation";
import Parametres from "./pages/Parametres";
import Messagerie from "./pages/Messagerie";
import Reporting from "./pages/Reporting";
import GestionDI from "./pages/GestionDI";
import Codage from "./pages/Codage";
import GestionSorties from "./pages/GestionSorties";
import Logistique from "./pages/Logistique";
import Comptabilite from "./pages/Comptabilite";
import Administratif from "./pages/Administratif";
import Performance from "./pages/Performance";
import NotFound from "./pages/NotFound";

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
        <div style={{ padding: 32, fontFamily: "monospace", background: "#fff1f0", minHeight: "100vh" }}>
          <h2 style={{ color: "#c0392b", marginBottom: 16 }}>Erreur de rendu</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#333", background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #fcc" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/exploitation"  element={<ProtectedRoute><Exploitation /></ProtectedRoute>} />
          <Route path="/dossiers"      element={<ProtectedRoute><Dossiers /></ProtectedRoute>} />
          <Route path="/dossiers/:id"  element={<ProtectedRoute><ErrorBoundary><DossierDetail /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/codage"        element={<ProtectedRoute><Codage /></ProtectedRoute>} />
          <Route path="/sorties"       element={<ProtectedRoute><GestionSorties /></ProtectedRoute>} />
          <Route path="/logistique"    element={<ProtectedRoute><Logistique /></ProtectedRoute>} />
          <Route path="/comptabilite"  element={<ProtectedRoute><Comptabilite /></ProtectedRoute>} />
          <Route path="/administratif" element={<ProtectedRoute><Administratif /></ProtectedRoute>} />
          <Route path="/employes"      element={<ProtectedRoute><Employes /></ProtectedRoute>} />
          <Route path="/employes/:name"element={<ProtectedRoute><EmployeDetail /></ProtectedRoute>} />
          <Route path="/alertes"       element={<ProtectedRoute><Alertes /></ProtectedRoute>} />
          <Route path="/finance"       element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/di"            element={<ProtectedRoute><GestionDI /></ProtectedRoute>} />
          <Route path="/kribi"         element={<ProtectedRoute><Kribi /></ProtectedRoute>} />
          <Route path="/messagerie"    element={<ProtectedRoute><Messagerie /></ProtectedRoute>} />
          <Route path="/reporting"     element={<ProtectedRoute><Reporting /></ProtectedRoute>} />
          <Route path="/performance"   element={<ProtectedRoute><Performance /></ProtectedRoute>} />
          <Route path="/parametres"    element={<ProtectedRoute><Parametres /></ProtectedRoute>} />
          <Route path="*"              element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
