# FINITRANS Backend API

Backend production-grade pour la plateforme de gestion transit douanier FINITRANS.

**Stack :** Fastify 4 · TypeScript · Prisma ORM · PostgreSQL · JWT · WebSocket · Zod

---

## Démarrage rapide

### 1. Prérequis
- Node.js 20+
- PostgreSQL 15+ (ou Docker)

### 2. Installation

```bash
cd backend
npm install
cp .env.example .env
# Éditer .env avec vos paramètres
```

### 3. Base de données

**Option A — Docker (recommandé)**
```bash
docker-compose up -d db
```

**Option B — PostgreSQL existant**
```bash
# Créer la base
createdb finitrans
# Appliquer le schéma SQL directement
psql -U postgres -d finitrans -f sql/001_schema.sql
```

### 4. ORM Prisma

```bash
npm run db:generate      # Générer le client Prisma
npm run db:migrate       # Appliquer les migrations Prisma
npm run db:seed          # Peupler avec les données initiales
```

### 5. Lancer le serveur

```bash
npm run dev    # Mode développement (hot-reload)
npm run build  # Compiler TypeScript
npm start      # Mode production
```

Le serveur démarre sur `http://localhost:3001`

---

## Endpoints API

| Module        | Préfixe               | Description                          |
|---------------|-----------------------|--------------------------------------|
| Auth          | `POST /api/auth/login`          | Connexion JWT                |
| Dashboard     | `GET  /api/dashboard/kpis`      | Indicateurs clés             |
| Dossiers      | `GET  /api/dossiers`            | Liste/CRUD dossiers          |
| Employés      | `GET  /api/employes`            | Gestion équipe               |
| Finance       | `GET  /api/finance/stats`       | Paiements douane/compagnies  |
| Alertes       | `GET  /api/alertes`             | Alertes temps réel           |
| Messagerie    | `GET  /api/messagerie/conversations` | Chat interne            |
| Kribi         | `GET  /api/kribi/bons`          | Opérations port de Kribi     |
| Reporting     | `GET  /api/reporting/performance` | Rapports & SLA             |
| Paramètres    | `GET  /api/parametres`          | Configuration globale        |

### Auth — Corps de requête

```json
POST /api/auth/login
{
  "email": "delba@finitrans.cm",
  "password": "finitrans2025"
}
```

Retourne `{ accessToken, refreshToken, user }`.  
Utiliser `Authorization: Bearer <accessToken>` pour toutes les requêtes protégées.

---

## Comptes seed

| Email                    | Rôle                   | Profil         |
|--------------------------|------------------------|----------------|
| delba@finitrans.cm       | Directeur Général      | `dg`           |
| nguema@finitrans.cm      | Responsable Exploitation | `exploitation` |
| fouda@finitrans.cm       | Agent Opérations       | `operations`   |
| abena@finitrans.cm       | Contrôleur Validation  | `validation`   |
| ekani@finitrans.cm       | Responsable Administratif | `administration` |
| belinga@finitrans.cm     | Comptable              | `comptabilite` |
| manga@finitrans.cm       | Agent Terrain Kribi    | `terrain_kribi` |
| nkolo@finitrans.cm       | Superviseur Kribi      | `exploitation` |

Mot de passe commun (à changer en prod) : **finitrans2025**

---

## Structure du projet

```
backend/
├── sql/001_schema.sql          # DDL PostgreSQL complet
├── prisma/schema.prisma        # Schéma Prisma ORM
├── src/
│   ├── index.ts                # Point d'entrée
│   ├── app.ts                  # Configuration Fastify
│   ├── config/
│   │   ├── env.ts              # Validation variables d'env
│   │   └── prisma.ts           # Client Prisma singleton
│   ├── middleware/
│   │   ├── authenticate.ts     # Vérification JWT
│   │   └── authorize.ts        # RBAC par permission
│   ├── routes/                 # 10 modules de routes
│   ├── types/index.ts          # Types TypeScript
│   └── utils/                  # errors, pagination, audit
├── .env.example
├── docker-compose.yml
└── Dockerfile
```

---

## Connexion Frontend

Dans le frontend (`finitrans-buddy-main`), configurer la variable d'environnement :

```env
VITE_API_URL=http://localhost:3001
```

Ensuite remplacer les imports de `mockData` par des appels API via `fetch` ou le client React Query déjà configuré.

---

## WebSocket (temps réel)

```js
const ws = new WebSocket('ws://localhost:3001/ws')
ws.onmessage = (evt) => {
  const data = JSON.parse(evt.data)
  // data.type: 'NEW_MESSAGE' | 'NEW_ALERTE' | 'DOSSIER_UPDATED'
}
```
