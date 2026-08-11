import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bell, AlertTriangle, DollarSign, Clock, FileWarning, Users, Check, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

const typeIcons: Record<string, any> = {
  detention: AlertTriangle,
  paiement:  DollarSign,
  blocage:   Clock,
  document:  FileWarning,
  charge:    Users,
  di_seuil:  TrendingDown,
};

const NotificationPanel = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["notifications-panel"],
    queryFn:  () => api.get<any>("/api/alertes?limit=30"),
    refetchInterval: 60_000,
  });

  const alertes = data?.data ?? [];
  const unread  = data?.nonLues ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="bg-card w-[400px]">
        <SheetHeader>
          <SheetTitle className="font-display flex items-center justify-between">
            Notifications
            <span className="text-xs font-normal text-muted-foreground">{unread} non lues</span>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
          {alertes.map((alert: any) => {
            const Icon = typeIcons[alert.type] ?? Bell;
            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  alert.lu ? "bg-muted/30" : "bg-muted/70 border-l-2 border-l-secondary"
                }`}
                onClick={() => {
                  if (alert.dossierId) {
                    navigate(`/dossiers/${alert.dossierId}`);
                    setOpen(false);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alert.severity === "critical" ? "bg-destructive/10 text-destructive" :
                    alert.severity === "warning"  ? "bg-warning/10 text-warning" :
                    "bg-secondary/10 text-secondary"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleDateString("fr-FR")}</span>
                      {alert.lu && <Check className="w-3 h-3 text-success" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {alertes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune notification</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationPanel;
