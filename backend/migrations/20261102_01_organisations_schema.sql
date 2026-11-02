-- ============================================================
--  20261102_01 : schéma SaaS multi-entreprises (organisations, abonnements, demandes de démo,
--  colonne organisation_id sur les tables métier, unicités par organisation).
--  Généré par : prisma migrate diff (schéma de production HEAD -> schéma cible).
--  Purement additif : aucune table ni colonne supprimée ; seuls les index d'unicité globale
--  sont remplacés par leurs équivalents par organisation.
--  Appliqué une seule fois par src/scripts/appliquer-migrations.ts, dans une transaction.
-- ============================================================

-- CreateEnum
CREATE TYPE "PlanAbonnement" AS ENUM ('starter', 'business', 'enterprise');

-- CreateEnum
CREATE TYPE "StatutAbonnement" AS ENUM ('essai', 'actif', 'impaye', 'suspendu', 'annule');

-- DropIndex
DROP INDEX "dossiers_numero_key";

-- DropIndex
DROP INDEX "factures_numero_key";

-- DropIndex
DROP INDEX "virements_reference_key";

-- DropIndex
DROP INDEX "bons_livraison_numero_key";

-- DropIndex
DROP INDEX "gate_passes_numero_key";

-- DropIndex
DROP INDEX "alerte_configs_type_key";

-- DropIndex
DROP INDEX "bons_kribi_numero_key";

-- DropIndex
DROP INDEX "paiements_douane_reference_key";

-- DropIndex
DROP INDEX "paiements_compagnie_reference_key";

-- DropIndex
DROP INDEX "parametres_cle_key";

-- DropIndex
DROP INDEX "declarations_importation_numero_key";

-- DropIndex
DROP INDEX "soumissions_sgs_reference_key";

-- DropIndex
DROP INDEX "comptes_comptables_numero_key";

-- DropIndex
DROP INDEX "journaux_comptables_code_key";

-- DropIndex
DROP INDEX "exercices_comptables_code_key";

-- DropIndex
DROP INDEX "ecritures_comptables_numero_key";

-- DropIndex
DROP INDEX "camions_immatriculation_key";

-- DropIndex
DROP INDEX "clients_cle_nom_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "dossiers" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "documents_favoris" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "affectations_etapes" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "commentaires" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "audit_entries" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "virements" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "bons_livraison" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "imprevus" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "actualites_client" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "gate_passes" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "dossier_timings" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "alertes" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "alerte_configs" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "bons_kribi" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "paiements_douane" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "paiements_compagnie" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "parametres" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "declarations_importation" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "mouvements_di" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "detentions" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "etats_codage" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "vehicules" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "interchanges" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "comptes_rendus_kribi" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "soumissions_sgs" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "sous_etapes_dossier" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "di_documents" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "fiches_rh" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "conges" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "comptes_comptables" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "journaux_comptables" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "exercices_comptables" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "ecritures_comptables" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "lignes_ecriture" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "chauffeurs" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "camions" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "transports" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "reglements_clients" ADD COLUMN     "organisation_id" UUID;

-- AlterTable
ALTER TABLE "interactions_clients" ADD COLUMN     "organisation_id" UUID;

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pays" VARCHAR(2) NOT NULL DEFAULT 'CM',
    "devise" VARCHAR(3) NOT NULL DEFAULT 'XAF',
    "fuseau" VARCHAR(64) NOT NULL DEFAULT 'Africa/Douala',
    "langue" VARCHAR(5) NOT NULL DEFAULT 'fr',

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonnements" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "plan" "PlanAbonnement" NOT NULL DEFAULT 'business',
    "statut" "StatutAbonnement" NOT NULL DEFAULT 'essai',
    "fin_essai" TIMESTAMP(3),
    "fin_periode" TIMESTAMP(3),
    "max_utilisateurs" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abonnements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandes_demo" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(120) NOT NULL,
    "entreprise" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telephone" VARCHAR(40),
    "pays" VARCHAR(80),
    "taille" VARCHAR(40),
    "message" VARCHAR(2000),
    "langue" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "traitee" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demandes_demo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "abonnements_organisation_id_key" ON "abonnements"("organisation_id");

-- CreateIndex
CREATE INDEX "demandes_demo_created_at_idx" ON "demandes_demo"("created_at");

-- CreateIndex
CREATE INDEX "users_organisation_id_idx" ON "users"("organisation_id");

-- CreateIndex
CREATE INDEX "dossiers_organisation_id_idx" ON "dossiers"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_organisation_id_numero_key" ON "dossiers"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "documents_organisation_id_idx" ON "documents"("organisation_id");

-- CreateIndex
CREATE INDEX "documents_favoris_organisation_id_idx" ON "documents_favoris"("organisation_id");

-- CreateIndex
CREATE INDEX "affectations_etapes_organisation_id_idx" ON "affectations_etapes"("organisation_id");

-- CreateIndex
CREATE INDEX "commentaires_organisation_id_idx" ON "commentaires"("organisation_id");

-- CreateIndex
CREATE INDEX "audit_entries_organisation_id_idx" ON "audit_entries"("organisation_id");

-- CreateIndex
CREATE INDEX "factures_organisation_id_idx" ON "factures"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "factures_organisation_id_numero_key" ON "factures"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "virements_organisation_id_idx" ON "virements"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "virements_organisation_id_reference_key" ON "virements"("organisation_id", "reference");

-- CreateIndex
CREATE INDEX "bons_livraison_organisation_id_idx" ON "bons_livraison"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bons_livraison_organisation_id_numero_key" ON "bons_livraison"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "imprevus_organisation_id_idx" ON "imprevus"("organisation_id");

-- CreateIndex
CREATE INDEX "actualites_client_organisation_id_idx" ON "actualites_client"("organisation_id");

-- CreateIndex
CREATE INDEX "gate_passes_organisation_id_idx" ON "gate_passes"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_organisation_id_numero_key" ON "gate_passes"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "dossier_timings_organisation_id_idx" ON "dossier_timings"("organisation_id");

-- CreateIndex
CREATE INDEX "alertes_organisation_id_idx" ON "alertes"("organisation_id");

-- CreateIndex
CREATE INDEX "alerte_configs_organisation_id_idx" ON "alerte_configs"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "alerte_configs_organisation_id_type_key" ON "alerte_configs"("organisation_id", "type");

-- CreateIndex
CREATE INDEX "conversations_organisation_id_idx" ON "conversations"("organisation_id");

-- CreateIndex
CREATE INDEX "conversation_participants_organisation_id_idx" ON "conversation_participants"("organisation_id");

-- CreateIndex
CREATE INDEX "messages_organisation_id_idx" ON "messages"("organisation_id");

-- CreateIndex
CREATE INDEX "bons_kribi_organisation_id_idx" ON "bons_kribi"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bons_kribi_organisation_id_numero_key" ON "bons_kribi"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "paiements_douane_organisation_id_idx" ON "paiements_douane"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_douane_organisation_id_reference_key" ON "paiements_douane"("organisation_id", "reference");

-- CreateIndex
CREATE INDEX "paiements_compagnie_organisation_id_idx" ON "paiements_compagnie"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_compagnie_organisation_id_reference_key" ON "paiements_compagnie"("organisation_id", "reference");

-- CreateIndex
CREATE INDEX "parametres_organisation_id_idx" ON "parametres"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "parametres_organisation_id_cle_key" ON "parametres"("organisation_id", "cle");

-- CreateIndex
CREATE INDEX "declarations_importation_organisation_id_idx" ON "declarations_importation"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_importation_organisation_id_numero_key" ON "declarations_importation"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "mouvements_di_organisation_id_idx" ON "mouvements_di"("organisation_id");

-- CreateIndex
CREATE INDEX "detentions_organisation_id_idx" ON "detentions"("organisation_id");

-- CreateIndex
CREATE INDEX "etats_codage_organisation_id_idx" ON "etats_codage"("organisation_id");

-- CreateIndex
CREATE INDEX "vehicules_organisation_id_idx" ON "vehicules"("organisation_id");

-- CreateIndex
CREATE INDEX "interchanges_organisation_id_idx" ON "interchanges"("organisation_id");

-- CreateIndex
CREATE INDEX "notifications_organisation_id_idx" ON "notifications"("organisation_id");

-- CreateIndex
CREATE INDEX "comptes_rendus_kribi_organisation_id_idx" ON "comptes_rendus_kribi"("organisation_id");

-- CreateIndex
CREATE INDEX "soumissions_sgs_organisation_id_idx" ON "soumissions_sgs"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "soumissions_sgs_organisation_id_reference_key" ON "soumissions_sgs"("organisation_id", "reference");

-- CreateIndex
CREATE INDEX "sous_etapes_dossier_organisation_id_idx" ON "sous_etapes_dossier"("organisation_id");

-- CreateIndex
CREATE INDEX "di_documents_organisation_id_idx" ON "di_documents"("organisation_id");

-- CreateIndex
CREATE INDEX "activity_logs_organisation_id_idx" ON "activity_logs"("organisation_id");

-- CreateIndex
CREATE INDEX "fiches_rh_organisation_id_idx" ON "fiches_rh"("organisation_id");

-- CreateIndex
CREATE INDEX "conges_organisation_id_idx" ON "conges"("organisation_id");

-- CreateIndex
CREATE INDEX "comptes_comptables_organisation_id_idx" ON "comptes_comptables"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "comptes_comptables_organisation_id_numero_key" ON "comptes_comptables"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "journaux_comptables_organisation_id_idx" ON "journaux_comptables"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "journaux_comptables_organisation_id_code_key" ON "journaux_comptables"("organisation_id", "code");

-- CreateIndex
CREATE INDEX "exercices_comptables_organisation_id_idx" ON "exercices_comptables"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercices_comptables_organisation_id_code_key" ON "exercices_comptables"("organisation_id", "code");

-- CreateIndex
CREATE INDEX "ecritures_comptables_organisation_id_idx" ON "ecritures_comptables"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ecritures_comptables_organisation_id_numero_key" ON "ecritures_comptables"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "lignes_ecriture_organisation_id_idx" ON "lignes_ecriture"("organisation_id");

-- CreateIndex
CREATE INDEX "chauffeurs_organisation_id_idx" ON "chauffeurs"("organisation_id");

-- CreateIndex
CREATE INDEX "camions_organisation_id_idx" ON "camions"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "camions_organisation_id_immatriculation_key" ON "camions"("organisation_id", "immatriculation");

-- CreateIndex
CREATE INDEX "transports_organisation_id_idx" ON "transports"("organisation_id");

-- CreateIndex
CREATE INDEX "contacts_organisation_id_idx" ON "contacts"("organisation_id");

-- CreateIndex
CREATE INDEX "clients_organisation_id_idx" ON "clients"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organisation_id_cle_nom_key" ON "clients"("organisation_id", "cle_nom");

-- CreateIndex
CREATE INDEX "reglements_clients_organisation_id_idx" ON "reglements_clients"("organisation_id");

-- CreateIndex
CREATE INDEX "interactions_clients_organisation_id_idx" ON "interactions_clients"("organisation_id");

-- AddForeignKey
ALTER TABLE "abonnements" ADD CONSTRAINT "abonnements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

