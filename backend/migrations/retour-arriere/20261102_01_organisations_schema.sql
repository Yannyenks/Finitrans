-- ============================================================
--  Retour arrière de 20261102_01 (schéma) — à n'appliquer qu'APRÈS le retour arrière 02
--  et le redéploiement de la version précédente de l'application.
--  ATTENTION : supprime les tables organisations / abonnements / demandes_demo et les colonnes
--  organisation_id (données d'organisation perdues). Préférer la restauration de la sauvegarde.
--  Généré par : prisma migrate diff (schéma cible -> schéma de production HEAD).
-- ============================================================

BEGIN;

-- DropForeignKey
ALTER TABLE "abonnements" DROP CONSTRAINT "abonnements_organisation_id_fkey";

-- DropIndex
DROP INDEX "users_organisation_id_idx";

-- DropIndex
DROP INDEX "dossiers_organisation_id_idx";

-- DropIndex
DROP INDEX "dossiers_organisation_id_numero_key";

-- DropIndex
DROP INDEX "documents_organisation_id_idx";

-- DropIndex
DROP INDEX "documents_favoris_organisation_id_idx";

-- DropIndex
DROP INDEX "affectations_etapes_organisation_id_idx";

-- DropIndex
DROP INDEX "commentaires_organisation_id_idx";

-- DropIndex
DROP INDEX "audit_entries_organisation_id_idx";

-- DropIndex
DROP INDEX "factures_organisation_id_idx";

-- DropIndex
DROP INDEX "factures_organisation_id_numero_key";

-- DropIndex
DROP INDEX "virements_organisation_id_idx";

-- DropIndex
DROP INDEX "virements_organisation_id_reference_key";

-- DropIndex
DROP INDEX "bons_livraison_organisation_id_idx";

-- DropIndex
DROP INDEX "bons_livraison_organisation_id_numero_key";

-- DropIndex
DROP INDEX "imprevus_organisation_id_idx";

-- DropIndex
DROP INDEX "actualites_client_organisation_id_idx";

-- DropIndex
DROP INDEX "gate_passes_organisation_id_idx";

-- DropIndex
DROP INDEX "gate_passes_organisation_id_numero_key";

-- DropIndex
DROP INDEX "dossier_timings_organisation_id_idx";

-- DropIndex
DROP INDEX "alertes_organisation_id_idx";

-- DropIndex
DROP INDEX "alerte_configs_organisation_id_idx";

-- DropIndex
DROP INDEX "alerte_configs_organisation_id_type_key";

-- DropIndex
DROP INDEX "conversations_organisation_id_idx";

-- DropIndex
DROP INDEX "conversation_participants_organisation_id_idx";

-- DropIndex
DROP INDEX "messages_organisation_id_idx";

-- DropIndex
DROP INDEX "bons_kribi_organisation_id_idx";

-- DropIndex
DROP INDEX "bons_kribi_organisation_id_numero_key";

-- DropIndex
DROP INDEX "paiements_douane_organisation_id_idx";

-- DropIndex
DROP INDEX "paiements_douane_organisation_id_reference_key";

-- DropIndex
DROP INDEX "paiements_compagnie_organisation_id_idx";

-- DropIndex
DROP INDEX "paiements_compagnie_organisation_id_reference_key";

-- DropIndex
DROP INDEX "parametres_organisation_id_idx";

-- DropIndex
DROP INDEX "parametres_organisation_id_cle_key";

-- DropIndex
DROP INDEX "declarations_importation_organisation_id_idx";

-- DropIndex
DROP INDEX "declarations_importation_organisation_id_numero_key";

-- DropIndex
DROP INDEX "mouvements_di_organisation_id_idx";

-- DropIndex
DROP INDEX "detentions_organisation_id_idx";

-- DropIndex
DROP INDEX "etats_codage_organisation_id_idx";

-- DropIndex
DROP INDEX "vehicules_organisation_id_idx";

-- DropIndex
DROP INDEX "interchanges_organisation_id_idx";

-- DropIndex
DROP INDEX "notifications_organisation_id_idx";

-- DropIndex
DROP INDEX "comptes_rendus_kribi_organisation_id_idx";

-- DropIndex
DROP INDEX "soumissions_sgs_organisation_id_idx";

-- DropIndex
DROP INDEX "soumissions_sgs_organisation_id_reference_key";

-- DropIndex
DROP INDEX "sous_etapes_dossier_organisation_id_idx";

-- DropIndex
DROP INDEX "di_documents_organisation_id_idx";

-- DropIndex
DROP INDEX "activity_logs_organisation_id_idx";

-- DropIndex
DROP INDEX "fiches_rh_organisation_id_idx";

-- DropIndex
DROP INDEX "conges_organisation_id_idx";

-- DropIndex
DROP INDEX "comptes_comptables_organisation_id_idx";

-- DropIndex
DROP INDEX "comptes_comptables_organisation_id_numero_key";

-- DropIndex
DROP INDEX "journaux_comptables_organisation_id_idx";

-- DropIndex
DROP INDEX "journaux_comptables_organisation_id_code_key";

-- DropIndex
DROP INDEX "exercices_comptables_organisation_id_idx";

-- DropIndex
DROP INDEX "exercices_comptables_organisation_id_code_key";

-- DropIndex
DROP INDEX "ecritures_comptables_organisation_id_idx";

-- DropIndex
DROP INDEX "ecritures_comptables_organisation_id_numero_key";

-- DropIndex
DROP INDEX "lignes_ecriture_organisation_id_idx";

-- DropIndex
DROP INDEX "chauffeurs_organisation_id_idx";

-- DropIndex
DROP INDEX "camions_organisation_id_idx";

-- DropIndex
DROP INDEX "camions_organisation_id_immatriculation_key";

-- DropIndex
DROP INDEX "transports_organisation_id_idx";

-- DropIndex
DROP INDEX "contacts_organisation_id_idx";

-- DropIndex
DROP INDEX "clients_organisation_id_idx";

-- DropIndex
DROP INDEX "clients_organisation_id_cle_nom_key";

-- DropIndex
DROP INDEX "reglements_clients_organisation_id_idx";

-- DropIndex
DROP INDEX "interactions_clients_organisation_id_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "dossiers" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "documents_favoris" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "affectations_etapes" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "commentaires" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "audit_entries" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "factures" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "virements" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "bons_livraison" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "imprevus" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "actualites_client" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "gate_passes" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "dossier_timings" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "alertes" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "alerte_configs" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "conversation_participants" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "bons_kribi" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "paiements_douane" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "paiements_compagnie" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "parametres" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "declarations_importation" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "mouvements_di" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "detentions" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "etats_codage" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "vehicules" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "interchanges" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "comptes_rendus_kribi" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "soumissions_sgs" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "sous_etapes_dossier" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "di_documents" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "activity_logs" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "fiches_rh" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "conges" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "comptes_comptables" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "journaux_comptables" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "exercices_comptables" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "ecritures_comptables" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "lignes_ecriture" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "chauffeurs" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "camions" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "transports" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "reglements_clients" DROP COLUMN "organisation_id";

-- AlterTable
ALTER TABLE "interactions_clients" DROP COLUMN "organisation_id";

-- DropTable
DROP TABLE "organisations";

-- DropTable
DROP TABLE "abonnements";

-- DropTable
DROP TABLE "demandes_demo";

-- DropEnum
DROP TYPE "PlanAbonnement";

-- DropEnum
DROP TYPE "StatutAbonnement";

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_numero_key" ON "dossiers"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "virements_reference_key" ON "virements"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "bons_livraison_numero_key" ON "bons_livraison"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_numero_key" ON "gate_passes"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "alerte_configs_type_key" ON "alerte_configs"("type");

-- CreateIndex
CREATE UNIQUE INDEX "bons_kribi_numero_key" ON "bons_kribi"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_douane_reference_key" ON "paiements_douane"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_compagnie_reference_key" ON "paiements_compagnie"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "parametres_cle_key" ON "parametres"("cle");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_importation_numero_key" ON "declarations_importation"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "soumissions_sgs_reference_key" ON "soumissions_sgs"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "comptes_comptables_numero_key" ON "comptes_comptables"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "journaux_comptables_code_key" ON "journaux_comptables"("code");

-- CreateIndex
CREATE UNIQUE INDEX "exercices_comptables_code_key" ON "exercices_comptables"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ecritures_comptables_numero_key" ON "ecritures_comptables"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "camions_immatriculation_key" ON "camions"("immatriculation");

-- CreateIndex
CREATE UNIQUE INDEX "clients_cle_nom_key" ON "clients"("cle_nom");


DELETE FROM _migrations_sql WHERE nom = '20261102_01_organisations_schema.sql';

COMMIT;
