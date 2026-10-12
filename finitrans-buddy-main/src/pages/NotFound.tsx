import { Link } from "react-router-dom";
import { getStoredUser } from "@/lib/api";
import { homeFor } from "@/components/RequireModule";

const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-muted">
    <div className="text-center">
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-4 text-xl text-muted-foreground">Cette page n'existe pas.</p>
      <Link to={homeFor(getStoredUser())} className="text-primary underline hover:text-primary/90">
        Retour à l'accueil
      </Link>
    </div>
  </div>
);

export default NotFound;
