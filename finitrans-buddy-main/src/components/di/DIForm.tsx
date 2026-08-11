import { useState } from "react";
import { z } from "zod";
import { Loader2, Plus, RefreshCw, ArrowUpRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDI, useDICreate, DICreateInput } from "@/hooks/useDI";

// ── Schémas de validation ─────────────────────────────────────────────────────

const rechargeSchema = z.object({
  montant: z.number({ invalid_type_error: "Montant requis" }).positive("Le montant doit être positif"),
  motif:   z.string().min(5, "Le motif doit faire au moins 5 caractères"),
});

const createSchema = z.object({
  numero:        z.string().min(3, "Numéro requis (min 3 caractères)"),
  client:        z.string().min(2, "Client requis"),
  montant:       z.number({ invalid_type_error: "Montant requis" }).positive("Montant positif requis"),
  devise:        z.string().default("XAF"),
  compagnie:     z.string().optional(),
  dateEmission:  z.string().min(1, "Date d'émission requise"),
  dateExpiration:z.string().optional(),
  seuilAlerte1:  z.number().min(5).max(99).default(20),
  seuilAlerte2:  z.number().min(1).max(50).default(10),
  notes:         z.string().optional(),
});

type RechargeErrors = Partial<Record<"montant" | "motif", string>>;
type CreateErrors   = Partial<Record<keyof DICreateInput, string>>;

// ── Composant ─────────────────────────────────────────────────────────────────

type FormMode = "create" | "recharge" | "debit";

interface DIFormProps {
  mode:          FormMode;
  diId?:         string;
  soldeActuel?:  number;
  dossierId?:    string;
  devise?:       string;
  onSuccess?:    (data?: any) => void;
  onCancel?:     () => void;
}

export default function DIForm({
  mode, diId, soldeActuel, dossierId, devise = "XAF", onSuccess, onCancel,
}: DIFormProps) {

  // ── Recharge / ajustement ────────────────────────────────────
  if (mode === "recharge" && diId) {
    return (
      <RechargeForm
        diId={diId}
        devise={devise}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );
  }

  // ── Débit manuel ─────────────────────────────────────────────
  if (mode === "debit" && diId) {
    return (
      <DebitForm
        diId={diId}
        soldeActuel={soldeActuel ?? 0}
        dossierId={dossierId}
        devise={devise}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );
  }

  // ── Création DI ──────────────────────────────────────────────
  return (
    <CreateForm onSuccess={onSuccess} onCancel={onCancel} />
  );
}

// ── Création ──────────────────────────────────────────────────────────────────

function CreateForm({ onSuccess, onCancel }: Pick<DIFormProps, "onSuccess" | "onCancel">) {
  const create = useDICreate();
  const [errors, setErrors] = useState<CreateErrors>({});
  const [form, setForm] = useState({
    numero:         "",
    client:         "",
    montant:        "",
    devise:         "XAF",
    compagnie:      "",
    dateEmission:   new Date().toISOString().slice(0, 16),
    dateExpiration: "",
    seuilAlerte1:   "20",
    seuilAlerte2:   "10",
    notes:          "",
  });

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createSchema.safeParse({
      ...form,
      montant:      parseFloat(form.montant),
      seuilAlerte1: parseInt(form.seuilAlerte1),
      seuilAlerte2: parseInt(form.seuilAlerte2),
      compagnie:    form.compagnie || undefined,
      dateExpiration: form.dateExpiration
        ? new Date(form.dateExpiration).toISOString()
        : undefined,
      dateEmission: new Date(form.dateEmission).toISOString(),
    });

    if (!parsed.success) {
      const errs: CreateErrors = {};
      parsed.error.issues.forEach(i => {
        const key = i.path[0] as keyof DICreateInput;
        if (key) errs[key] = i.message;
      });
      setErrors(errs);
      return;
    }

    const data = await create.mutateAsync(parsed.data as DICreateInput).catch(() => null);
    if (data) onSuccess?.(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
          <Plus className="w-4 h-4 text-secondary" />
        </div>
        <h3 className="font-display font-bold text-foreground">Créer une DI</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Numéro DI *" error={errors.numero}>
          <Input value={form.numero} onChange={e => set("numero", e.target.value)}
            placeholder="DI-2025-001234" className="h-9 text-sm bg-muted/40" />
        </Field>
        <Field label="Client *" error={errors.client}>
          <Input value={form.client} onChange={e => set("client", e.target.value)}
            placeholder="Nom du client" className="h-9 text-sm bg-muted/40" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Montant initial *" error={errors.montant}>
            <Input type="number" min={1} value={form.montant} onChange={e => set("montant", e.target.value)}
              placeholder="45000000" className="h-9 text-sm bg-muted/40" />
          </Field>
        </div>
        <Field label="Devise" error={undefined}>
          <Select value={form.devise} onValueChange={v => set("devise", v)}>
            <SelectTrigger className="h-9 text-sm bg-muted/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="XAF">XAF</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Compagnie maritime" error={undefined}>
        <Select value={form.compagnie} onValueChange={v => set("compagnie", v)}>
          <SelectTrigger className="h-9 text-sm bg-muted/40"><SelectValue placeholder="Optionnel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="MSC">MSC</SelectItem>
            <SelectItem value="COSCO">COSCO</SelectItem>
            <SelectItem value="MAERSK">MAERSK</SelectItem>
            <SelectItem value="CMA_CGM">CMA CGM</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date d'émission *" error={errors.dateEmission}>
          <Input type="datetime-local" value={form.dateEmission} onChange={e => set("dateEmission", e.target.value)}
            className="h-9 text-sm bg-muted/40" />
        </Field>
        <Field label="Date d'expiration" error={undefined}>
          <Input type="datetime-local" value={form.dateExpiration} onChange={e => set("dateExpiration", e.target.value)}
            className="h-9 text-sm bg-muted/40" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Seuil alerte 1 (% restant)" error={undefined}>
          <Input type="number" min={5} max={99} value={form.seuilAlerte1} onChange={e => set("seuilAlerte1", e.target.value)}
            className="h-9 text-sm bg-muted/40" />
        </Field>
        <Field label="Seuil critique (% restant)" error={undefined}>
          <Input type="number" min={1} max={50} value={form.seuilAlerte2} onChange={e => set("seuilAlerte2", e.target.value)}
            className="h-9 text-sm bg-muted/40" />
        </Field>
      </div>

      <Field label="Notes" error={undefined}>
        <Textarea value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Informations complémentaires..." className="bg-muted/40 h-16 text-sm resize-none" />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={create.isPending}
          className="flex-1 gap-2 bg-secondary text-secondary-foreground hover:opacity-90">
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Créer la DI
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="px-4">
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

// ── Recharge / ajustement à la hausse ────────────────────────────────────────

function RechargeForm({
  diId, devise, onSuccess, onCancel,
}: { diId: string; devise: string; onSuccess?: (d?: any) => void; onCancel?: () => void }) {
  const { recharge } = useDI(diId);
  const [montant, setMontant] = useState("");
  const [motif,   setMotif]   = useState("");
  const [errors,  setErrors]  = useState<RechargeErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = rechargeSchema.safeParse({
      montant: parseFloat(montant),
      motif,
    });
    if (!parsed.success) {
      const errs: RechargeErrors = {};
      parsed.error.issues.forEach(i => {
        if (i.path[0]) errs[i.path[0] as "montant" | "motif"] = i.message;
      });
      setErrors(errs);
      return;
    }
    const data = await recharge.mutateAsync(parsed.data).catch(() => null);
    if (data !== null) onSuccess?.(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-4 h-4 text-secondary" />
        <span className="text-sm font-display font-bold text-foreground">Ajuster le montant DI</span>
      </div>
      <Field label={`Montant à créditer (${devise}) *`} error={errors.montant}>
        <Input type="number" min={1} value={montant} onChange={e => { setMontant(e.target.value); setErrors(er => ({ ...er, montant: undefined })); }}
          placeholder="5000000" className="h-9 text-sm bg-muted/40" />
      </Field>
      <Field label="Motif obligatoire *" error={errors.motif}>
        <Textarea value={motif} onChange={e => { setMotif(e.target.value); setErrors(er => ({ ...er, motif: undefined })); }}
          placeholder="Justification de l'ajustement (min 5 caractères)..."
          className="bg-muted/40 h-16 text-sm resize-none" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={recharge.isPending}
          className="flex-1 gap-2 bg-secondary text-secondary-foreground hover:opacity-90 text-sm h-9">
          {recharge.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
          Confirmer l'ajustement
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="px-3 h-9 text-sm">
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

// ── Débit manuel ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "droits_douane", label: "Droits de douane" },
  { value: "tva",           label: "TVA" },
  { value: "honoraires",    label: "Honoraires" },
  { value: "redevances",    label: "Redevances" },
  { value: "penalites",     label: "Pénalités" },
  { value: "frais_divers",  label: "Frais divers" },
];

function DebitForm({
  diId, soldeActuel, dossierId, devise, onSuccess, onCancel,
}: { diId: string; soldeActuel: number; dossierId?: string; devise: string; onSuccess?: (d?: any) => void; onCancel?: () => void }) {
  const { decrement } = useDI(diId);
  const [montant,   setMontant]   = useState("");
  const [motif,     setMotif]     = useState("");
  const [categorie, setCategorie] = useState("frais_divers");
  const [errors,    setErrors]    = useState<Partial<{ montant: string; motif: string }>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const m = parseFloat(montant);
    if (!montant || isNaN(m) || m <= 0) errs.montant = "Montant positif requis";
    else if (m > soldeActuel)           errs.montant = `Maximum : ${soldeActuel.toLocaleString("fr-FR")} ${devise}`;
    if (motif.trim().length < 3)        errs.motif   = "Motif requis (min 3 caractères)";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const data = await decrement.mutateAsync({
      montant: m, motif, dossierId, categorie: categorie as any,
    }).catch(() => null);
    if (data !== null) onSuccess?.(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-display font-bold text-foreground">Enregistrer un débit DI</span>
      </div>
      <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        Solde disponible : <strong className="text-foreground">{soldeActuel.toLocaleString("fr-FR")} {devise}</strong>
      </p>
      <Field label={`Montant à débiter (${devise}) *`} error={errors.montant}>
        <Input type="number" min={1} max={soldeActuel} value={montant}
          onChange={e => { setMontant(e.target.value); setErrors(er => ({ ...er, montant: undefined })); }}
          placeholder="1200000" className="h-9 text-sm bg-muted/40" />
      </Field>
      <Field label="Catégorie" error={undefined}>
        <Select value={categorie} onValueChange={setCategorie}>
          <SelectTrigger className="h-9 text-sm bg-muted/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Motif *" error={errors.motif}>
        <Textarea value={motif} onChange={e => { setMotif(e.target.value); setErrors(er => ({ ...er, motif: undefined })); }}
          placeholder="Motif de l'opération..." className="bg-muted/40 h-16 text-sm resize-none" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={decrement.isPending}
          className="flex-1 gap-2 text-sm h-9"
          style={{ background: "linear-gradient(135deg, #F07B37, #e86d28)", color: "white", border: "none" }}>
          {decrement.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
          Confirmer le débit
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="px-3 h-9 text-sm">
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

// ── Helper label + error ─────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
