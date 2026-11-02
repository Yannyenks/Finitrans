-- ============================================================
--  20261102_02 : isolation des organisations (SaaS multi-entreprises) — FICHIER GÉNÉRÉ
--  par src/scripts/generer-sql-isolation.ts ; ne pas modifier à la main.
--
--  PRÉREQUIS : le schéma Prisma a été appliqué (prisma db push, SANS --accept-data-loss),
--  ce qui crée les tables organisations / abonnements / demandes_demo et les colonnes organisation_id.
--
--  EN PRODUCTION, uniquement après :
--    1. une sauvegarde complète vérifiée (branche ou instantané Neon) ;
--    2. un essai sur une copie de la base ;
--    3. la préparation du retour arrière (migrations/retour-arriere/20261102_02_organisations_isolation.sql).
--
--  Idempotent : peut être rejoué. Ne supprime ni ne modifie aucune donnée métier,
--  à l'exception du remplissage des colonnes organisation_id encore vides.
-- ============================================================

BEGIN;

-- Organisation de référence : l'entreprise historique
INSERT INTO organisations (id, slug, nom, actif, pays, devise, fuseau, langue, created_at)
VALUES (gen_random_uuid(), 'finitrans', 'FINITRANS', true, 'CM', 'XAF', 'Africa/Douala', 'fr', now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO abonnements (id, organisation_id, plan, statut, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'enterprise', 'actif', now(), now()
  FROM organisations o
 WHERE o.slug = 'finitrans'
ON CONFLICT (organisation_id) DO NOTHING;

-- Reprise : toutes les lignes existantes appartiennent à FINITRANS
UPDATE "users" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "dossiers" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "documents" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "documents_favoris" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "affectations_etapes" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "commentaires" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "audit_entries" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "factures" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "virements" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "bons_livraison" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "imprevus" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "actualites_client" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "gate_passes" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "dossier_timings" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "alertes" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "alerte_configs" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "conversations" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "conversation_participants" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "messages" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "bons_kribi" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "paiements_douane" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "paiements_compagnie" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "parametres" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "declarations_importation" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "mouvements_di" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "detentions" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "etats_codage" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "vehicules" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "interchanges" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "notifications" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "comptes_rendus_kribi" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "soumissions_sgs" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "sous_etapes_dossier" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "di_documents" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "activity_logs" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "fiches_rh" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "conges" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "comptes_comptables" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "journaux_comptables" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "exercices_comptables" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "ecritures_comptables" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "lignes_ecriture" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "chauffeurs" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "camions" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "transports" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "contacts" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "clients" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "reglements_clients" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;
UPDATE "interactions_clients" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;

-- Intégrité inter-organisations :
--  - une ligne sans organisation prend celle de son parent ;
--  - une ligne qui référence un parent d'une autre organisation est refusée ;
--  - l'organisation d'une ligne ne peut plus être changée une fois fixée.
CREATE OR REPLACE FUNCTION tio_controle_organisation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  i          int := 0;
  ref        text;
  org_parent uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.organisation_id IS NOT NULL
     AND NEW.organisation_id IS DISTINCT FROM OLD.organisation_id THEN
    RAISE EXCEPTION 'Changement d''organisation interdit sur %', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;

  WHILE i < TG_NARGS LOOP
    ref := to_jsonb(NEW) ->> TG_ARGV[i + 1];
    IF ref IS NOT NULL THEN
      EXECUTE format('SELECT organisation_id FROM %I WHERE id = $1', TG_ARGV[i]) INTO org_parent USING ref::uuid;
      IF org_parent IS NOT NULL THEN
        IF NEW.organisation_id IS NULL THEN
          NEW.organisation_id := org_parent;
        ELSIF NEW.organisation_id <> org_parent THEN
          RAISE EXCEPTION 'Référence croisée entre organisations interdite (%.%)', TG_TABLE_NAME, TG_ARGV[i + 1]
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tio_organisation ON "users";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "dossiers";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "client_id", "di_id", "responsable_id" ON "dossiers"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('clients', 'client_id', 'declarations_importation', 'di_id', 'users', 'responsable_id');
DROP TRIGGER IF EXISTS tio_organisation ON "documents";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "uploade_par" ON "documents"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'uploade_par');
DROP TRIGGER IF EXISTS tio_organisation ON "documents_favoris";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "user_id", "document_id" ON "documents_favoris"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'user_id', 'documents', 'document_id');
DROP TRIGGER IF EXISTS tio_organisation ON "affectations_etapes";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "responsable_id", "assigne_par_id" ON "affectations_etapes"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'responsable_id', 'users', 'assigne_par_id');
DROP TRIGGER IF EXISTS tio_organisation ON "commentaires";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "auteur_id", "dossier_id" ON "commentaires"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'auteur_id', 'dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "audit_entries";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "auteur_id", "dossier_id" ON "audit_entries"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'auteur_id', 'dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "factures";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id" ON "factures"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "virements";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "effectue_par" ON "virements"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'effectue_par');
DROP TRIGGER IF EXISTS tio_organisation ON "bons_livraison";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "effectue_par" ON "bons_livraison"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'effectue_par');
DROP TRIGGER IF EXISTS tio_organisation ON "imprevus";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id" ON "imprevus"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "actualites_client";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id" ON "actualites_client"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "gate_passes";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "emetteur_id" ON "gate_passes"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'emetteur_id');
DROP TRIGGER IF EXISTS tio_organisation ON "dossier_timings";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "responsable_id" ON "dossier_timings"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'responsable_id');
DROP TRIGGER IF EXISTS tio_organisation ON "alertes";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "lu_par" ON "alertes"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'lu_par');
DROP TRIGGER IF EXISTS tio_organisation ON "alerte_configs";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "alerte_configs"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "conversations";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "created_by", "dossier_id" ON "conversations"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'created_by', 'dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "conversation_participants";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "conversation_id", "user_id" ON "conversation_participants"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('conversations', 'conversation_id', 'users', 'user_id');
DROP TRIGGER IF EXISTS tio_organisation ON "messages";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "auteur_id", "conversation_id" ON "messages"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'auteur_id', 'conversations', 'conversation_id');
DROP TRIGGER IF EXISTS tio_organisation ON "bons_kribi";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "responsable_id" ON "bons_kribi"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'responsable_id');
DROP TRIGGER IF EXISTS tio_organisation ON "paiements_douane";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id" ON "paiements_douane"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "paiements_compagnie";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id" ON "paiements_compagnie"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "parametres";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "updated_by" ON "parametres"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'updated_by');
DROP TRIGGER IF EXISTS tio_organisation ON "declarations_importation";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "gestionnaire_id" ON "declarations_importation"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'gestionnaire_id');
DROP TRIGGER IF EXISTS tio_organisation ON "mouvements_di";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "created_by", "di_id", "dossier_id" ON "mouvements_di"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'created_by', 'declarations_importation', 'di_id', 'dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "detentions";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id" ON "detentions"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "etats_codage";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "soumis_par_id", "valide_par_id" ON "etats_codage"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'soumis_par_id', 'users', 'valide_par_id');
DROP TRIGGER IF EXISTS tio_organisation ON "vehicules";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "responsable_id" ON "vehicules"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'responsable_id');
DROP TRIGGER IF EXISTS tio_organisation ON "interchanges";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "responsable_id" ON "interchanges"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'responsable_id');
DROP TRIGGER IF EXISTS tio_organisation ON "notifications";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "user_id" ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'user_id');
DROP TRIGGER IF EXISTS tio_organisation ON "comptes_rendus_kribi";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "auteur_id" ON "comptes_rendus_kribi"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'auteur_id');
DROP TRIGGER IF EXISTS tio_organisation ON "soumissions_sgs";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "soumis_par_id" ON "soumissions_sgs"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'soumis_par_id');
DROP TRIGGER IF EXISTS tio_organisation ON "sous_etapes_dossier";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "responsable_id", "completed_by_id" ON "sous_etapes_dossier"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'users', 'responsable_id', 'users', 'completed_by_id');
DROP TRIGGER IF EXISTS tio_organisation ON "di_documents";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "di_id", "uploade_par" ON "di_documents"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('declarations_importation', 'di_id', 'users', 'uploade_par');
DROP TRIGGER IF EXISTS tio_organisation ON "activity_logs";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "user_id" ON "activity_logs"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'user_id');
DROP TRIGGER IF EXISTS tio_organisation ON "fiches_rh";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "user_id" ON "fiches_rh"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'user_id');
DROP TRIGGER IF EXISTS tio_organisation ON "conges";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "user_id", "decide_par_id" ON "conges"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'user_id', 'users', 'decide_par_id');
DROP TRIGGER IF EXISTS tio_organisation ON "comptes_comptables";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "comptes_comptables"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "journaux_comptables";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "journaux_comptables"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "exercices_comptables";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "exercices_comptables"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "ecritures_comptables";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "journal_id", "exercice_id", "dossier_id", "created_by_id", "validee_par_id" ON "ecritures_comptables"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('journaux_comptables', 'journal_id', 'exercices_comptables', 'exercice_id', 'dossiers', 'dossier_id', 'users', 'created_by_id', 'users', 'validee_par_id');
DROP TRIGGER IF EXISTS tio_organisation ON "lignes_ecriture";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "ecriture_id", "compte_id" ON "lignes_ecriture"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('ecritures_comptables', 'ecriture_id', 'comptes_comptables', 'compte_id');
DROP TRIGGER IF EXISTS tio_organisation ON "chauffeurs";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "chauffeurs"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "camions";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "camions"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "transports";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "dossier_id", "camion_id", "chauffeur_id", "created_by_id" ON "transports"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('dossiers', 'dossier_id', 'camions', 'camion_id', 'chauffeurs', 'chauffeur_id', 'users', 'created_by_id');
DROP TRIGGER IF EXISTS tio_organisation ON "contacts";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "created_by_id" ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('users', 'created_by_id');
DROP TRIGGER IF EXISTS tio_organisation ON "clients";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id" ON "clients"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation();
DROP TRIGGER IF EXISTS tio_organisation ON "reglements_clients";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "client_id", "dossier_id" ON "reglements_clients"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('clients', 'client_id', 'dossiers', 'dossier_id');
DROP TRIGGER IF EXISTS tio_organisation ON "interactions_clients";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF "organisation_id", "client_id" ON "interactions_clients"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation('clients', 'client_id');

-- Contrôle : aucune ligne métier sans organisation après reprise
DO $$
DECLARE
  restantes bigint;
BEGIN
  SELECT (SELECT count(*) FROM "users" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "dossiers" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "documents" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "documents_favoris" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "affectations_etapes" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "commentaires" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "audit_entries" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "factures" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "virements" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "bons_livraison" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "imprevus" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "actualites_client" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "gate_passes" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "dossier_timings" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "alertes" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "alerte_configs" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "conversations" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "conversation_participants" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "messages" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "bons_kribi" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "paiements_douane" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "paiements_compagnie" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "parametres" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "declarations_importation" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "mouvements_di" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "detentions" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "etats_codage" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "vehicules" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "interchanges" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "notifications" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "comptes_rendus_kribi" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "soumissions_sgs" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "sous_etapes_dossier" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "di_documents" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "activity_logs" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "fiches_rh" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "conges" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "comptes_comptables" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "journaux_comptables" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "exercices_comptables" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "ecritures_comptables" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "lignes_ecriture" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "chauffeurs" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "camions" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "transports" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "contacts" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "clients" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "reglements_clients" WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM "interactions_clients" WHERE organisation_id IS NULL)
    INTO restantes;
  IF restantes > 0 THEN
    RAISE EXCEPTION 'Reprise incomplète : % ligne(s) sans organisation', restantes;
  END IF;
END $$;

COMMIT;
