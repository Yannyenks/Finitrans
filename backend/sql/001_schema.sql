-- ============================================================
--  FINITRANS BUDDY — PostgreSQL Schema v1.0
--  Plateforme de gestion transit douanier — Cameroun
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TYPES ÉNUMÉRÉS
-- ============================================================

CREATE TYPE dossier_status AS ENUM (
  'reception', 'codage', 'validation', 'paiement',
  'bon_compagnie', 'operations_kribi', 'cloture'
);

CREATE TYPE priorite_enum AS ENUM ('haute', 'moyenne', 'basse');
CREATE TYPE site_enum AS ENUM ('Douala', 'Kribi');
CREATE TYPE compagnie_enum AS ENUM ('MSC', 'COSCO', 'MAERSK', 'CMA_CGM');

CREATE TYPE profil_enum AS ENUM (
  'dg', 'exploitation', 'operations', 'validation',
  'administration', 'comptabilite', 'terrain_kribi'
);

CREATE TYPE permission_niveau AS ENUM ('complet', 'partiel', 'lecture', 'non');

CREATE TYPE statut_facture   AS ENUM ('proforma', 'validee', 'reglee');
CREATE TYPE statut_virement  AS ENUM ('effectue', 'en_attente', 'annule');
CREATE TYPE statut_gate_pass AS ENUM ('emis', 'transmis', 'utilise');
CREATE TYPE statut_bon_liv   AS ENUM ('valide', 'en_attente', 'annule');

CREATE TYPE type_alerte      AS ENUM ('detention', 'paiement', 'blocage', 'document', 'charge', 'di_seuil');
CREATE TYPE severite_alerte  AS ENUM ('critical', 'warning', 'info');
CREATE TYPE type_conversation AS ENUM ('dossier', 'general', 'urgence');

CREATE TYPE type_bon_kribi    AS ENUM ('douane', 'compagnie_pak', 'portuaire_pad');
CREATE TYPE statut_bon_kribi  AS ENUM ('emis', 'valide', 'utilise', 'expire');

CREATE TYPE type_paiement_douane    AS ENUM ('droits', 'taxes', 'redevances', 'penalite');
CREATE TYPE type_paiement_compagnie AS ENUM ('surestaries', 'frais_portuaires', 'manutention', 'terminal');
CREATE TYPE statut_paiement         AS ENUM ('paye', 'en_attente', 'en_retard');

-- ============================================================
-- TRIGGER: updated_at automatique
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: users (employés)
-- ============================================================

CREATE TABLE users (
  id                    UUID            DEFAULT uuid_generate_v4() PRIMARY KEY,
  email                 VARCHAR(255)    UNIQUE NOT NULL,
  password_hash         VARCHAR(255)    NOT NULL,
  nom                   VARCHAR(255)    NOT NULL,
  role                  VARCHAR(255)    NOT NULL,
  site                  site_enum       NOT NULL,
  telephone             VARCHAR(50),
  profil                profil_enum     NOT NULL,
  actif                 BOOLEAN         DEFAULT TRUE,
  avatar_url            VARCHAR(500),
  -- Permissions granulaires
  perm_dossier          permission_niveau DEFAULT 'lecture',
  perm_validation       permission_niveau DEFAULT 'non',
  perm_financier        permission_niveau DEFAULT 'non',
  perm_rapports         permission_niveau DEFAULT 'non',
  perm_administration   permission_niveau DEFAULT 'non',
  created_at            TIMESTAMPTZ     DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: dossiers (dossiers transit)
-- ============================================================

CREATE TABLE dossiers (
  id                    UUID            DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero                VARCHAR(50)     UNIQUE NOT NULL,
  client                VARCHAR(255)    NOT NULL,
  compagnie             compagnie_enum  NOT NULL,
  conteneur             VARCHAR(100)    NOT NULL,
  marchandise           TEXT            NOT NULL,
  site                  site_enum       NOT NULL,
  status                dossier_status  DEFAULT 'reception',
  responsable_id        UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  date_creation         TIMESTAMPTZ     DEFAULT NOW(),
  date_arrivee          TIMESTAMPTZ     NOT NULL,
  montant_taxes         NUMERIC(15, 2),
  montant_honoraires    NUMERIC(15, 2),
  montant_redevances    NUMERIC(15, 2),
  date_limite_sortie    TIMESTAMPTZ,
  priorite              priorite_enum   DEFAULT 'moyenne',
  numero_di             VARCHAR(50),
  montant_di            NUMERIC(15, 2),
  notes                 TEXT,
  updated_at            TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TRIGGER trg_dossiers_updated_at
  BEFORE UPDATE ON dossiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_dossiers_status         ON dossiers(status);
CREATE INDEX idx_dossiers_site           ON dossiers(site);
CREATE INDEX idx_dossiers_responsable_id ON dossiers(responsable_id);
CREATE INDEX idx_dossiers_compagnie      ON dossiers(compagnie);
CREATE INDEX idx_dossiers_priorite       ON dossiers(priorite);
CREATE INDEX idx_dossiers_date_creation  ON dossiers(date_creation DESC);
CREATE INDEX idx_dossiers_client_trgm    ON dossiers USING gin(client gin_trgm_ops);
CREATE INDEX idx_dossiers_conteneur      ON dossiers(conteneur);

-- ============================================================
-- TABLE: documents
-- ============================================================

CREATE TABLE documents (
  id            UUID            DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id    UUID            NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  nom           VARCHAR(255)    NOT NULL,
  type          VARCHAR(50)     NOT NULL,
  taille        VARCHAR(50)     NOT NULL,
  url           VARCHAR(500)    NOT NULL,
  uploade_par   UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  etape         dossier_status  NOT NULL,
  created_at    TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_documents_dossier_id ON documents(dossier_id);

-- ============================================================
-- TABLE: commentaires
-- ============================================================

CREATE TABLE commentaires (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id    UUID        NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  auteur_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_commentaires_updated_at
  BEFORE UPDATE ON commentaires
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_commentaires_dossier_id ON commentaires(dossier_id);

-- ============================================================
-- TABLE: audit_entries (journal des actions)
-- ============================================================

CREATE TABLE audit_entries (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id    UUID        NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  auteur_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action        VARCHAR(255) NOT NULL,
  details       TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_dossier_id  ON audit_entries(dossier_id);
CREATE INDEX idx_audit_created_at  ON audit_entries(created_at DESC);

-- ============================================================
-- TABLE: factures
-- ============================================================

CREATE TABLE factures (
  id              UUID            DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID            NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  numero          VARCHAR(50)     UNIQUE NOT NULL,
  type            statut_facture  DEFAULT 'proforma',
  montant         NUMERIC(15, 2)  NOT NULL,
  compagnie       VARCHAR(255)    NOT NULL,
  date_facture    TIMESTAMPTZ     NOT NULL,
  date_paiement   TIMESTAMPTZ,
  description     TEXT            NOT NULL,
  created_at      TIMESTAMPTZ     DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TRIGGER trg_factures_updated_at
  BEFORE UPDATE ON factures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_factures_dossier_id ON factures(dossier_id);

-- ============================================================
-- TABLE: virements (transferts bancaires)
-- ============================================================

CREATE TABLE virements (
  id              UUID              DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID              NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  montant         NUMERIC(15, 2)    NOT NULL,
  source          VARCHAR(255)      NOT NULL,
  destination     VARCHAR(255)      NOT NULL,
  date_virement   TIMESTAMPTZ       NOT NULL,
  reference       VARCHAR(100)      UNIQUE NOT NULL,
  effectue_par    UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  statut          statut_virement   DEFAULT 'en_attente',
  created_at      TIMESTAMPTZ       DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       DEFAULT NOW()
);

CREATE TRIGGER trg_virements_updated_at
  BEFORE UPDATE ON virements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_virements_dossier_id ON virements(dossier_id);

-- ============================================================
-- TABLE: bons_livraison
-- ============================================================

CREATE TABLE bons_livraison (
  id              UUID              DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID              NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  numero          VARCHAR(50)       UNIQUE NOT NULL,
  description     TEXT              NOT NULL,
  montant         NUMERIC(15, 2)    NOT NULL,
  date_emission   TIMESTAMPTZ       NOT NULL,
  effectue_par    UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  statut          statut_bon_liv    DEFAULT 'en_attente',
  created_at      TIMESTAMPTZ       DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       DEFAULT NOW()
);

CREATE TRIGGER trg_bons_livraison_updated_at
  BEFORE UPDATE ON bons_livraison
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_bons_livraison_dossier_id ON bons_livraison(dossier_id);

-- ============================================================
-- TABLE: gate_passes
-- ============================================================

CREATE TABLE gate_passes (
  id              UUID              DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID              NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  numero          VARCHAR(50)       UNIQUE NOT NULL,
  conteneur       VARCHAR(100)      NOT NULL,
  chauffeur       VARCHAR(255)      NOT NULL,
  telephone       VARCHAR(50)       NOT NULL,
  destination     VARCHAR(255)      NOT NULL,
  date_emission   TIMESTAMPTZ       NOT NULL,
  emetteur_id     UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  statut          statut_gate_pass  DEFAULT 'emis',
  created_at      TIMESTAMPTZ       DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       DEFAULT NOW()
);

CREATE TRIGGER trg_gate_passes_updated_at
  BEFORE UPDATE ON gate_passes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_gate_passes_dossier_id ON gate_passes(dossier_id);

-- ============================================================
-- TABLE: dossier_timings (suivi SLA par étape)
-- ============================================================

CREATE TABLE dossier_timings (
  id                    UUID            DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id            UUID            NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  etape                 dossier_status  NOT NULL,
  date_debut            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  date_fin              TIMESTAMPTZ,
  duree_prevue_jours    INTEGER         NOT NULL DEFAULT 2,
  created_at            TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_timings_dossier_id ON dossier_timings(dossier_id);

-- ============================================================
-- TABLE: alertes
-- ============================================================

CREATE TABLE alertes (
  id              UUID              DEFAULT uuid_generate_v4() PRIMARY KEY,
  type            type_alerte       NOT NULL,
  message         TEXT              NOT NULL,
  dossier_id      UUID              REFERENCES dossiers(id) ON DELETE CASCADE,
  severity        severite_alerte   DEFAULT 'warning',
  lu              BOOLEAN           DEFAULT FALSE,
  lu_par          UUID              REFERENCES users(id) ON DELETE SET NULL,
  lu_at           TIMESTAMPTZ,
  created_at      TIMESTAMPTZ       DEFAULT NOW()
);

CREATE INDEX idx_alertes_lu         ON alertes(lu);
CREATE INDEX idx_alertes_dossier_id ON alertes(dossier_id);
CREATE INDEX idx_alertes_severity   ON alertes(severity);
CREATE INDEX idx_alertes_created_at ON alertes(created_at DESC);

-- ============================================================
-- TABLE: alerte_configs (paramétrage des seuils d'alertes)
-- ============================================================

CREATE TABLE alerte_configs (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  type        VARCHAR(100) UNIQUE NOT NULL,
  label       VARCHAR(255) NOT NULL,
  seuil       INTEGER      NOT NULL,
  unite       VARCHAR(50)  NOT NULL,
  actif       BOOLEAN      DEFAULT TRUE,
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TRIGGER trg_alerte_configs_updated_at
  BEFORE UPDATE ON alerte_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: conversations (messagerie interne)
-- ============================================================

CREATE TABLE conversations (
  id              UUID              DEFAULT uuid_generate_v4() PRIMARY KEY,
  titre           VARCHAR(255)      NOT NULL,
  dossier_id      UUID              REFERENCES dossiers(id) ON DELETE SET NULL,
  type            type_conversation DEFAULT 'general',
  dernier_message TEXT,
  created_by      UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ       DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       DEFAULT NOW()
);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: conversation_participants
-- ============================================================

CREATE TABLE conversation_participants (
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

-- ============================================================
-- TABLE: messages
-- ============================================================

CREATE TABLE messages (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  auteur_id       UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contenu         TEXT        NOT NULL,
  lu              BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at      ON messages(created_at ASC);

-- ============================================================
-- TABLE: bons_kribi (bons douane/compagnie/portuaires Kribi)
-- ============================================================

CREATE TABLE bons_kribi (
  id              UUID              DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID              NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  type            type_bon_kribi    NOT NULL,
  numero          VARCHAR(50)       UNIQUE NOT NULL,
  description     TEXT              NOT NULL,
  montant         NUMERIC(15, 2),
  date_emission   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  responsable_id  UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  statut          statut_bon_kribi  DEFAULT 'emis',
  created_at      TIMESTAMPTZ       DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       DEFAULT NOW()
);

CREATE TRIGGER trg_bons_kribi_updated_at
  BEFORE UPDATE ON bons_kribi
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_bons_kribi_dossier_id ON bons_kribi(dossier_id);

-- ============================================================
-- TABLE: paiements_douane
-- ============================================================

CREATE TABLE paiements_douane (
  id              UUID                    DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID                    NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  type            type_paiement_douane    NOT NULL,
  montant         NUMERIC(15, 2)          NOT NULL,
  date_paiement   TIMESTAMPTZ             NOT NULL,
  statut          statut_paiement         DEFAULT 'en_attente',
  reference       VARCHAR(100)            UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ             DEFAULT NOW(),
  updated_at      TIMESTAMPTZ             DEFAULT NOW()
);

CREATE TRIGGER trg_paiements_douane_updated_at
  BEFORE UPDATE ON paiements_douane
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_paiements_douane_dossier_id ON paiements_douane(dossier_id);

-- ============================================================
-- TABLE: paiements_compagnie
-- ============================================================

CREATE TABLE paiements_compagnie (
  id              UUID                        DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id      UUID                        NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  compagnie       compagnie_enum              NOT NULL,
  type            type_paiement_compagnie     NOT NULL,
  montant         NUMERIC(15, 2)              NOT NULL,
  date_paiement   TIMESTAMPTZ                 NOT NULL,
  statut          statut_paiement             DEFAULT 'en_attente',
  reference       VARCHAR(100)                UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ                 DEFAULT NOW(),
  updated_at      TIMESTAMPTZ                 DEFAULT NOW()
);

CREATE TRIGGER trg_paiements_compagnie_updated_at
  BEFORE UPDATE ON paiements_compagnie
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_paiements_compagnie_dossier_id ON paiements_compagnie(dossier_id);

-- ============================================================
-- TABLE: refresh_tokens
-- ============================================================

CREATE TABLE refresh_tokens (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token   ON refresh_tokens(token);

-- ============================================================
-- TABLE: parametres (configuration globale)
-- ============================================================

CREATE TABLE parametres (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  cle         VARCHAR(100) UNIQUE NOT NULL,
  valeur      JSONB        NOT NULL,
  description TEXT,
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_parametres_updated_at
  BEFORE UPDATE ON parametres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VUES (Views)
-- ============================================================

CREATE VIEW v_dossiers_stats AS
SELECT
  status,
  site,
  COUNT(*)                                                                    AS total,
  SUM(montant_taxes)                                                          AS total_taxes,
  SUM(montant_honoraires)                                                     AS total_honoraires,
  COUNT(CASE WHEN date_limite_sortie < NOW() AND status <> 'cloture' THEN 1 END) AS en_retard
FROM dossiers
GROUP BY status, site;

CREATE VIEW v_employe_performance AS
SELECT
  u.id,
  u.nom,
  u.role,
  u.site,
  u.profil,
  COUNT(d.id)                                                                            AS dossiers_total,
  COUNT(CASE WHEN d.status <> 'cloture' THEN 1 END)                                    AS dossiers_actifs,
  COUNT(CASE WHEN d.status = 'cloture'  THEN 1 END)                                    AS dossiers_clotures,
  COUNT(CASE WHEN d.date_limite_sortie < NOW() AND d.status <> 'cloture' THEN 1 END)   AS en_retard
FROM users u
LEFT JOIN dossiers d ON d.responsable_id = u.id
WHERE u.actif = TRUE
GROUP BY u.id, u.nom, u.role, u.site, u.profil;

-- ============================================================
-- DONNÉES INITIALES (Seeds)
-- ============================================================

INSERT INTO alerte_configs (type, label, seuil, unite, actif) VALUES
  ('retention_portuaire', 'Rétention portuaire',  5,  'jours',   TRUE),
  ('delai_paiement',      'Délai paiement DI',    48, 'heures',  TRUE),
  ('blocage_douane',      'Blocage douane',        72, 'heures',  TRUE),
  ('document_manquant',   'Document manquant',     24, 'heures',  TRUE),
  ('seuil_charges',       'Seuil charges',         85, '%',       TRUE),
  ('seuil_di',            'Seuil solde DI',        20, '%',       TRUE);

INSERT INTO parametres (cle, valeur, description) VALUES
  ('nom_entreprise',  '"FINITRANS"',                 'Nom de l''entreprise'),
  ('devise',          '"FCFA"',                      'Devise utilisée'),
  ('timezone',        '"Africa/Douala"',             'Fuseau horaire'),
  ('sla_jours',       '{"reception":1,"codage":2,"validation":3,"paiement":1,"bon_compagnie":1,"operations_kribi":2,"cloture":1}',
                      'Durée SLA par étape (jours)');
