/**
 * Génère migrations/20261102_02_organisations_isolation.sql et son retour arrière à partir du modèle Prisma.
 * Usage : npx tsx src/scripts/generer-sql-isolation.ts
 *
 * Le script produit :
 *  - l'organisation de référence FINITRANS et son abonnement ;
 *  - la reprise (backfill) de toutes les tables métier vers FINITRANS ;
 *  - une fonction + des triggers qui déduisent l'organisation d'une ligne à partir de ses parents
 *    (dossier, utilisateur, DI…) et refusent toute référence croisée entre organisations ;
 *  - un contrôle final (aucune ligne métier sans organisation).
 */
import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'

const HORS_ISOLATION = new Set(['Abonnement'])
const modeles = Prisma.dmmf.datamodel.models
const table = (nom: string) => { const m = modeles.find(x => x.name === nom)!; return m.dbName ?? m.name }
const estIsole = (nom: string) =>
  !HORS_ISOLATION.has(nom) && !!modeles.find(m => m.name === nom)?.fields.some(f => f.name === 'organisationId')

const isoles = modeles.filter(m => estIsole(m.name))

/** Pour chaque table isolée : couples (table parente, colonne de clé étrangère) vers d'autres tables isolées. */
const parents = isoles.map(m => {
  const refs: [string, string][] = []
  for (const f of m.fields) {
    if (f.kind !== 'object' || !f.relationFromFields?.length || !estIsole(f.type)) continue
    const fk = m.fields.find(c => c.name === f.relationFromFields![0])!
    refs.push([table(f.type), fk.dbName ?? fk.name])
  }
  return { table: m.dbName ?? m.name, refs }
})

const sql = `-- ============================================================
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
${isoles.map(m => `UPDATE "${m.dbName ?? m.name}" SET organisation_id = (SELECT id FROM organisations WHERE slug = 'finitrans') WHERE organisation_id IS NULL;`).join('\n')}

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

${parents.map(p => `DROP TRIGGER IF EXISTS tio_organisation ON "${p.table}";
CREATE TRIGGER tio_organisation BEFORE INSERT OR UPDATE OF ${['organisation_id', ...new Set(p.refs.map(([, c]) => c))].map(c => `"${c}"`).join(', ')} ON "${p.table}"
  FOR EACH ROW EXECUTE FUNCTION tio_controle_organisation(${p.refs.map(([t, c]) => `'${t}', '${c}'`).join(', ')});`).join('\n')}

-- Contrôle : aucune ligne métier sans organisation après reprise
DO $$
DECLARE
  restantes bigint;
BEGIN
  SELECT ${isoles.map(m => `(SELECT count(*) FROM "${m.dbName ?? m.name}" WHERE organisation_id IS NULL)`).join('\n       + ')}
    INTO restantes;
  IF restantes > 0 THEN
    RAISE EXCEPTION 'Reprise incomplète : % ligne(s) sans organisation', restantes;
  END IF;
END $$;

COMMIT;
`

const rollback = `-- ============================================================
--  Retour arrière de 20261102_02 (isolation) — FICHIER GÉNÉRÉ
--  Retire les triggers d'isolation et la fonction associée.
--  Les colonnes organisation_id et les tables organisations / abonnements sont conservées
--  (elles ne gênent pas l'ancienne version de l'application, qui les ignore).
--  Pour revenir entièrement à l'état antérieur : restaurer la sauvegarde prise avant la migration.
-- ============================================================

BEGIN;

${parents.map(p => `DROP TRIGGER IF EXISTS tio_organisation ON "${p.table}";`).join('\n')}
DROP FUNCTION IF EXISTS tio_controle_organisation();
DELETE FROM _migrations_sql WHERE nom = '20261102_02_organisations_isolation.sql';

COMMIT;
`

const dossierMigrations = path.resolve(__dirname, '../../migrations')
fs.writeFileSync(path.join(dossierMigrations, '20261102_02_organisations_isolation.sql'), sql)
fs.writeFileSync(path.join(dossierMigrations, 'retour-arriere', '20261102_02_organisations_isolation.sql'), rollback)
console.log(`${isoles.length} tables isolées, ${parents.reduce((n, p) => n + p.refs.length, 0)} références contrôlées`)
