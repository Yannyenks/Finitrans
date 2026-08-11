-- CreateEnum
CREATE TYPE "dossier_status" AS ENUM ('reception', 'codage', 'validation', 'paiement', 'bon_compagnie', 'operations_kribi', 'cloture');

-- CreateEnum
CREATE TYPE "priorite_enum" AS ENUM ('haute', 'moyenne', 'basse');

-- CreateEnum
CREATE TYPE "site_enum" AS ENUM ('Douala', 'Kribi');

-- CreateEnum
CREATE TYPE "compagnie_enum" AS ENUM ('MSC', 'COSCO', 'MAERSK', 'CMA_CGM');

-- CreateEnum
CREATE TYPE "profil_enum" AS ENUM ('dg', 'exploitation', 'operations', 'validation', 'administration', 'comptabilite', 'terrain_kribi');

-- CreateEnum
CREATE TYPE "permission_niveau" AS ENUM ('complet', 'partiel', 'lecture', 'non');

-- CreateEnum
CREATE TYPE "statut_facture" AS ENUM ('proforma', 'validee', 'reglee');

-- CreateEnum
CREATE TYPE "statut_virement" AS ENUM ('effectue', 'en_attente', 'annule');

-- CreateEnum
CREATE TYPE "statut_gate_pass" AS ENUM ('emis', 'transmis', 'utilise');

-- CreateEnum
CREATE TYPE "statut_bon_liv" AS ENUM ('valide', 'en_attente', 'annule');

-- CreateEnum
CREATE TYPE "type_alerte" AS ENUM ('detention', 'paiement', 'blocage', 'document', 'charge', 'di_seuil');

-- CreateEnum
CREATE TYPE "severite_alerte" AS ENUM ('critical', 'warning', 'info');

-- CreateEnum
CREATE TYPE "type_conversation" AS ENUM ('dossier', 'general', 'urgence');

-- CreateEnum
CREATE TYPE "type_bon_kribi" AS ENUM ('douane', 'compagnie_pak', 'portuaire_pad');

-- CreateEnum
CREATE TYPE "statut_bon_kribi" AS ENUM ('emis', 'valide', 'utilise', 'expire');

-- CreateEnum
CREATE TYPE "type_paiement_douane" AS ENUM ('droits', 'taxes', 'redevances', 'penalite');

-- CreateEnum
CREATE TYPE "type_paiement_compagnie" AS ENUM ('surestaries', 'frais_portuaires', 'manutention', 'terminal');

-- CreateEnum
CREATE TYPE "statut_paiement" AS ENUM ('paye', 'en_attente', 'en_retard');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "role" VARCHAR(255) NOT NULL,
    "site" "site_enum" NOT NULL,
    "telephone" VARCHAR(50),
    "profil" "profil_enum" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "avatar_url" VARCHAR(500),
    "perm_dossier" "permission_niveau" NOT NULL DEFAULT 'lecture',
    "perm_validation" "permission_niveau" NOT NULL DEFAULT 'non',
    "perm_financier" "permission_niveau" NOT NULL DEFAULT 'non',
    "perm_rapports" "permission_niveau" NOT NULL DEFAULT 'non',
    "perm_administration" "permission_niveau" NOT NULL DEFAULT 'non',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossiers" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "client" VARCHAR(255) NOT NULL,
    "compagnie" "compagnie_enum" NOT NULL,
    "conteneur" VARCHAR(100) NOT NULL,
    "marchandise" TEXT NOT NULL,
    "site" "site_enum" NOT NULL,
    "status" "dossier_status" NOT NULL DEFAULT 'reception',
    "responsable_id" UUID NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_arrivee" TIMESTAMP(3) NOT NULL,
    "montant_taxes" DECIMAL(15,2),
    "montant_honoraires" DECIMAL(15,2),
    "montant_redevances" DECIMAL(15,2),
    "date_limite_sortie" TIMESTAMP(3),
    "priorite" "priorite_enum" NOT NULL DEFAULT 'moyenne',
    "numero_di" VARCHAR(50),
    "montant_di" DECIMAL(15,2),
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dossiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "taille" VARCHAR(50) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "uploade_par" UUID NOT NULL,
    "etape" "dossier_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commentaires" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commentaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "details" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "type" "statut_facture" NOT NULL DEFAULT 'proforma',
    "montant" DECIMAL(15,2) NOT NULL,
    "compagnie" VARCHAR(255) NOT NULL,
    "date_facture" TIMESTAMP(3) NOT NULL,
    "date_paiement" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "virements" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "montant" DECIMAL(15,2) NOT NULL,
    "source" VARCHAR(255) NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "date_virement" TIMESTAMP(3) NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "effectue_par" UUID NOT NULL,
    "statut" "statut_virement" NOT NULL DEFAULT 'en_attente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "virements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons_livraison" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "montant" DECIMAL(15,2) NOT NULL,
    "date_emission" TIMESTAMP(3) NOT NULL,
    "effectue_par" UUID NOT NULL,
    "statut" "statut_bon_liv" NOT NULL DEFAULT 'en_attente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bons_livraison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "conteneur" VARCHAR(100) NOT NULL,
    "chauffeur" VARCHAR(255) NOT NULL,
    "telephone" VARCHAR(50) NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "date_emission" TIMESTAMP(3) NOT NULL,
    "emetteur_id" UUID NOT NULL,
    "statut" "statut_gate_pass" NOT NULL DEFAULT 'emis',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_timings" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "etape" "dossier_status" NOT NULL,
    "date_debut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_fin" TIMESTAMP(3),
    "duree_prevue_jours" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossier_timings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertes" (
    "id" UUID NOT NULL,
    "type" "type_alerte" NOT NULL,
    "message" TEXT NOT NULL,
    "dossier_id" UUID,
    "severity" "severite_alerte" NOT NULL DEFAULT 'warning',
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "lu_par" UUID,
    "lu_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerte_configs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "seuil" INTEGER NOT NULL,
    "unite" VARCHAR(50) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerte_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "titre" VARCHAR(255) NOT NULL,
    "dossier_id" UUID,
    "type" "type_conversation" NOT NULL DEFAULT 'general',
    "dernier_message" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "contenu" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons_kribi" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "type" "type_bon_kribi" NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "montant" DECIMAL(15,2),
    "date_emission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsable_id" UUID NOT NULL,
    "statut" "statut_bon_kribi" NOT NULL DEFAULT 'emis',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bons_kribi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements_douane" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "type" "type_paiement_douane" NOT NULL,
    "montant" DECIMAL(15,2) NOT NULL,
    "date_paiement" TIMESTAMP(3) NOT NULL,
    "statut" "statut_paiement" NOT NULL DEFAULT 'en_attente',
    "reference" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paiements_douane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements_compagnie" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "compagnie" "compagnie_enum" NOT NULL,
    "type" "type_paiement_compagnie" NOT NULL,
    "montant" DECIMAL(15,2) NOT NULL,
    "date_paiement" TIMESTAMP(3) NOT NULL,
    "statut" "statut_paiement" NOT NULL DEFAULT 'en_attente',
    "reference" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paiements_compagnie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametres" (
    "id" UUID NOT NULL,
    "cle" VARCHAR(100) NOT NULL,
    "valeur" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

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
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "parametres_cle_key" ON "parametres"("cle");

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploade_par_fkey" FOREIGN KEY ("uploade_par") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires" ADD CONSTRAINT "commentaires_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires" ADD CONSTRAINT "commentaires_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "virements" ADD CONSTRAINT "virements_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "virements" ADD CONSTRAINT "virements_effectue_par_fkey" FOREIGN KEY ("effectue_par") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_effectue_par_fkey" FOREIGN KEY ("effectue_par") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_emetteur_id_fkey" FOREIGN KEY ("emetteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_timings" ADD CONSTRAINT "dossier_timings_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_lu_par_fkey" FOREIGN KEY ("lu_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_kribi" ADD CONSTRAINT "bons_kribi_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_kribi" ADD CONSTRAINT "bons_kribi_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements_douane" ADD CONSTRAINT "paiements_douane_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements_compagnie" ADD CONSTRAINT "paiements_compagnie_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres" ADD CONSTRAINT "parametres_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
