-- ============================================================
--  Retour arrière de 20261102_02 (isolation) — FICHIER GÉNÉRÉ
--  Retire les triggers d'isolation et la fonction associée.
--  Les colonnes organisation_id et les tables organisations / abonnements sont conservées
--  (elles ne gênent pas l'ancienne version de l'application, qui les ignore).
--  Pour revenir entièrement à l'état antérieur : restaurer la sauvegarde prise avant la migration.
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS tio_organisation ON "users";
DROP TRIGGER IF EXISTS tio_organisation ON "dossiers";
DROP TRIGGER IF EXISTS tio_organisation ON "documents";
DROP TRIGGER IF EXISTS tio_organisation ON "documents_favoris";
DROP TRIGGER IF EXISTS tio_organisation ON "affectations_etapes";
DROP TRIGGER IF EXISTS tio_organisation ON "commentaires";
DROP TRIGGER IF EXISTS tio_organisation ON "audit_entries";
DROP TRIGGER IF EXISTS tio_organisation ON "factures";
DROP TRIGGER IF EXISTS tio_organisation ON "virements";
DROP TRIGGER IF EXISTS tio_organisation ON "bons_livraison";
DROP TRIGGER IF EXISTS tio_organisation ON "imprevus";
DROP TRIGGER IF EXISTS tio_organisation ON "actualites_client";
DROP TRIGGER IF EXISTS tio_organisation ON "gate_passes";
DROP TRIGGER IF EXISTS tio_organisation ON "dossier_timings";
DROP TRIGGER IF EXISTS tio_organisation ON "alertes";
DROP TRIGGER IF EXISTS tio_organisation ON "alerte_configs";
DROP TRIGGER IF EXISTS tio_organisation ON "conversations";
DROP TRIGGER IF EXISTS tio_organisation ON "conversation_participants";
DROP TRIGGER IF EXISTS tio_organisation ON "messages";
DROP TRIGGER IF EXISTS tio_organisation ON "bons_kribi";
DROP TRIGGER IF EXISTS tio_organisation ON "paiements_douane";
DROP TRIGGER IF EXISTS tio_organisation ON "paiements_compagnie";
DROP TRIGGER IF EXISTS tio_organisation ON "parametres";
DROP TRIGGER IF EXISTS tio_organisation ON "declarations_importation";
DROP TRIGGER IF EXISTS tio_organisation ON "mouvements_di";
DROP TRIGGER IF EXISTS tio_organisation ON "detentions";
DROP TRIGGER IF EXISTS tio_organisation ON "etats_codage";
DROP TRIGGER IF EXISTS tio_organisation ON "vehicules";
DROP TRIGGER IF EXISTS tio_organisation ON "interchanges";
DROP TRIGGER IF EXISTS tio_organisation ON "notifications";
DROP TRIGGER IF EXISTS tio_organisation ON "comptes_rendus_kribi";
DROP TRIGGER IF EXISTS tio_organisation ON "soumissions_sgs";
DROP TRIGGER IF EXISTS tio_organisation ON "sous_etapes_dossier";
DROP TRIGGER IF EXISTS tio_organisation ON "di_documents";
DROP TRIGGER IF EXISTS tio_organisation ON "activity_logs";
DROP TRIGGER IF EXISTS tio_organisation ON "fiches_rh";
DROP TRIGGER IF EXISTS tio_organisation ON "conges";
DROP TRIGGER IF EXISTS tio_organisation ON "comptes_comptables";
DROP TRIGGER IF EXISTS tio_organisation ON "journaux_comptables";
DROP TRIGGER IF EXISTS tio_organisation ON "exercices_comptables";
DROP TRIGGER IF EXISTS tio_organisation ON "ecritures_comptables";
DROP TRIGGER IF EXISTS tio_organisation ON "lignes_ecriture";
DROP TRIGGER IF EXISTS tio_organisation ON "chauffeurs";
DROP TRIGGER IF EXISTS tio_organisation ON "camions";
DROP TRIGGER IF EXISTS tio_organisation ON "transports";
DROP TRIGGER IF EXISTS tio_organisation ON "contacts";
DROP TRIGGER IF EXISTS tio_organisation ON "clients";
DROP TRIGGER IF EXISTS tio_organisation ON "reglements_clients";
DROP TRIGGER IF EXISTS tio_organisation ON "interactions_clients";
DROP FUNCTION IF EXISTS tio_controle_organisation();
DELETE FROM _migrations_sql WHERE nom = '20261102_02_organisations_isolation.sql';

COMMIT;
