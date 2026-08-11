import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import {
  MessageSquare, Send, Users, FolderOpen, AlertTriangle,
  Search, Plus, Loader2, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ElementType> = {
  dossier: FolderOpen, general: Users, urgence: AlertTriangle,
};
const TYPE_COLORS: Record<string, string> = {
  dossier: "text-secondary", general: "text-muted-foreground", urgence: "text-destructive",
};
const TYPE_BG: Record<string, string> = {
  dossier: "bg-secondary/10 text-secondary", general: "bg-muted text-muted-foreground", urgence: "bg-destructive/10 text-destructive",
};
const TYPE_LABELS: Record<string, string> = {
  dossier: "Dossier", general: "Général", urgence: "Urgence",
};

const Messagerie = () => {
  const qc   = useQueryClient();
  const user = getStoredUser();

  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [newMessage,   setNewMessage]   = useState("");
  const [searchConv,   setSearchConv]   = useState("");
  const [showNewConv,  setShowNewConv]  = useState(false);
  const [newConvForm,  setNewConvForm]  = useState({
    titre: "", type: "general", participantIds: [] as string[],
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Conversations ──────────────────────────────────────────────
  const { data: convsData, isLoading } = useQuery({
    queryKey:       ["conversations"],
    queryFn:        () => api.get<any>("/api/messagerie/conversations?limit=50"),
    refetchInterval: 15_000,
  });
  const convs: any[] = convsData?.data ?? convsData ?? [];

  useEffect(() => {
    if (!selectedConv && convs.length > 0) setSelectedConv(convs[0].id);
  }, [convs, selectedConv]);

  // ── Messages ───────────────────────────────────────────────────
  const { data: msgsData, isLoading: msgsLoading } = useQuery({
    queryKey:       ["messages", selectedConv],
    queryFn:        () => api.get<any>(`/api/messagerie/conversations/${selectedConv}/messages?limit=100`),
    enabled:        !!selectedConv,
    refetchInterval: 8_000,
  });
  const messages: any[] = msgsData?.data ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Send message ───────────────────────────────────────────────
  const sendMsg = useMutation({
    mutationFn: (contenu: string) =>
      api.post(`/api/messagerie/conversations/${selectedConv}/messages`, { contenu }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", selectedConv] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setNewMessage("");
    },
  });

  const handleSend = () => {
    const text = newMessage.trim();
    if (text && !sendMsg.isPending) sendMsg.mutate(text);
  };

  // ── Employees for new conv ─────────────────────────────────────
  const { data: empData } = useQuery({
    queryKey:  ["employes-list"],
    queryFn:   () => api.get<any>("/api/employes?limit=50&actif=true"),
    staleTime: 5 * 60_000,
    enabled:   showNewConv,
  });
  const employes: any[] = empData?.data ?? [];

  // ── Create conversation ────────────────────────────────────────
  const createConv = useMutation({
    mutationFn: (body: any) => api.post<any>("/api/messagerie/conversations", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setSelectedConv(data.id);
      setShowNewConv(false);
      setNewConvForm({ titre: "", type: "general", participantIds: [] });
    },
  });

  const handleCreateConv = () => {
    if (!newConvForm.titre.trim() || newConvForm.participantIds.length === 0) return;
    createConv.mutate({
      titre:          newConvForm.titre.trim(),
      type:           newConvForm.type,
      participantIds: newConvForm.participantIds,
    });
  };

  const toggleParticipant = (id: string) => {
    setNewConvForm(prev => ({
      ...prev,
      participantIds: prev.participantIds.includes(id)
        ? prev.participantIds.filter(p => p !== id)
        : [...prev.participantIds, id],
    }));
  };

  const filteredConvs = convs.filter((c: any) =>
    searchConv === "" || c.titre.toLowerCase().includes(searchConv.toLowerCase())
  );
  const conv = convs.find((c: any) => c.id === selectedConv);

  if (isLoading) {
    return (
      <AppLayout title="Espace d'Échange" subtitle="Messagerie interne">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Espace d'Échange" subtitle="Messagerie interne — Discussions par dossier et équipe">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 stat-card overflow-hidden p-0 h-[calc(100vh-180px)]">

        {/* ── Sidebar conversations ──────────────────────────── */}
        <div className="border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={searchConv}
                  onChange={e => setSearchConv(e.target.value)}
                  className="pl-8 h-8 text-xs bg-muted/50"
                />
              </div>
              <Button
                size="sm"
                className="h-8 w-8 p-0 bg-primary text-primary-foreground flex-shrink-0"
                onClick={() => setShowNewConv(true)}
                title="Nouvelle conversation"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredConvs.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 px-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground text-center">
                  {searchConv ? "Aucun résultat" : "Aucune conversation. Créez-en une !"}
                </p>
              </div>
            )}
            {filteredConvs.map((c: any) => {
              const Icon       = TYPE_ICONS[c.type] ?? MessageSquare;
              const lastMsg    = c.messages?.[0];
              const isSelected = selectedConv === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedConv(c.id)}
                  className={cn(
                    "w-full text-left p-3 border-b border-border/40 hover:bg-muted/50 transition-colors",
                    isSelected && "bg-muted border-l-2 border-l-primary"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", TYPE_BG[c.type])}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-semibold text-foreground truncate">{c.titre}</span>
                        <span className="text-[9px] text-muted-foreground flex-shrink-0">
                          {new Date(c.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {lastMsg?.contenu ?? c.dernierMessage ?? "Aucun message"}
                      </p>
                      {c.participants && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {c.participants.length} participant{c.participants.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat area ─────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          {conv ? (
            <>
              {/* Header */}
              <div className="p-3 border-b border-border bg-muted/20 flex-shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const Icon = TYPE_ICONS[conv.type] ?? MessageSquare;
                        return <Icon className={cn("w-4 h-4 flex-shrink-0", TYPE_COLORS[conv.type])} />;
                      })()}
                      <h3 className="text-sm font-display font-semibold text-foreground">{conv.titre}</h3>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", TYPE_BG[conv.type])}>
                        {TYPE_LABELS[conv.type]}
                      </span>
                    </div>
                    {conv.dossierId && conv.dossier && (
                      <a href={`/dossiers/${conv.dossierId}`} className="text-[10px] text-secondary hover:underline flex items-center gap-1 mt-0.5 ml-6">
                        <FolderOpen className="w-3 h-3" />
                        {conv.dossier.numero} — {conv.dossier.client}
                      </a>
                    )}
                  </div>
                  {conv.participants && (
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {conv.participants.slice(0, 5).map((p: any) => (
                        <div
                          key={p.user?.id ?? p.userId}
                          className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary"
                          title={p.user?.nom ?? "?"}
                        >
                          {p.user?.nom?.charAt(0) ?? "?"}
                        </div>
                      ))}
                      {conv.participants.length > 5 && (
                        <span className="text-[9px] text-muted-foreground">+{conv.participants.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                {msgsLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!msgsLoading && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
                    <MessageSquare className="w-8 h-8 opacity-20" />
                    <p className="text-sm">Aucun message — soyez le premier !</p>
                  </div>
                )}
                {messages.map((m: any, i: number) => {
                  const isMine  = m.auteur?.id === user?.id;
                  const initiale = m.auteur?.nom?.charAt(0)?.toUpperCase() ?? "?";
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.25) }}
                      className={cn("flex items-end gap-2", isMine ? "justify-end" : "justify-start")}
                    >
                      {!isMine && (
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                          {initiale}
                        </div>
                      )}
                      <div className={cn("max-w-[70%]", isMine ? "items-end" : "items-start", "flex flex-col gap-0.5")}>
                        {!isMine && (
                          <span className="text-[10px] text-muted-foreground ml-1">{m.auteur?.nom ?? "?"}</span>
                        )}
                        <div className={cn("rounded-2xl px-3 py-2", isMine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted/80 text-foreground rounded-bl-sm"
                        )}>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.contenu}</p>
                        </div>
                        <span className={cn("text-[9px] px-1", isMine ? "text-right text-muted-foreground" : "text-muted-foreground")}>
                          {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {isMine && (
                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground flex-shrink-0">
                          {user?.nom?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-border flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <Textarea
                    placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    className="bg-muted/50 min-h-[44px] max-h-32 resize-none"
                    rows={1}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sendMsg.isPending || !newMessage.trim()}
                    className="bg-primary text-primary-foreground h-11 w-11 p-0 flex-shrink-0"
                  >
                    {sendMsg.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <MessageSquare className="w-12 h-12 opacity-20" />
              <p className="text-sm">Sélectionnez une conversation</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowNewConv(true)}>
                <Plus className="w-3.5 h-3.5" /> Nouvelle conversation
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Nouvelle conversation dialog ──────────────────── */}
      <Dialog open={showNewConv} onOpenChange={setShowNewConv}>
        <DialogContent className="sm:max-w-[480px] bg-card">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvelle conversation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Titre */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Titre *</Label>
              <Input
                placeholder="Ex: Suivi dossier DOS-2025-0042"
                value={newConvForm.titre}
                onChange={e => setNewConvForm(p => ({ ...p, titre: e.target.value }))}
                className="bg-muted/50"
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Type</Label>
              <Select value={newConvForm.type} onValueChange={v => setNewConvForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Général</div>
                  </SelectItem>
                  <SelectItem value="dossier">
                    <div className="flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5 text-secondary" /> Dossier</div>
                  </SelectItem>
                  <SelectItem value="urgence">
                    <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Urgence</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Participants */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Participants *{" "}
                {newConvForm.participantIds.length > 0 && (
                  <span className="text-primary font-semibold">({newConvForm.participantIds.length} sélectionné{newConvForm.participantIds.length > 1 ? "s" : ""})</span>
                )}
              </Label>
              <div className="border rounded-lg bg-muted/30 max-h-52 overflow-y-auto divide-y divide-border/50">
                {employes.length === 0 && (
                  <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" /> Chargement des employés…
                  </div>
                )}
                {employes
                  .filter((e: any) => e.id !== user?.id)
                  .map((e: any) => {
                    const selected = newConvForm.participantIds.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => toggleParticipant(e.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          selected ? "bg-primary/8 text-primary" : "hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                          selected ? "bg-primary border-primary" : "border-muted-foreground"
                        )}>
                          {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                          {e.nom.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{e.nom}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{e.role} — {e.site}</p>
                        </div>
                        {selected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowNewConv(false)}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Annuler
              </Button>
              <Button
                onClick={handleCreateConv}
                disabled={!newConvForm.titre.trim() || newConvForm.participantIds.length === 0 || createConv.isPending}
                className="bg-primary text-primary-foreground gap-2"
              >
                {createConv.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Création…</>
                  : <><Plus className="w-3.5 h-3.5" /> Créer</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Messagerie;
