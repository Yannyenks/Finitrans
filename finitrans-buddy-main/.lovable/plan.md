## Analyse des écarts — Ce qui manque vs le CDC

### 🔴 Fonctionnalités absentes (critique)
1. **Formulaire de création de dossier** — Aucun formulaire, juste des données mock
2. **Commentaires internes par dossier** — Messagerie contextuelle absente
3. **Upload de pièces jointes** — Aucune gestion de documents
4. **Historique/Audit log** — Pas de journal des actions
5. **Passage d'étape avec signature** — Transition horodatée et signée absente
6. **Dashboard Exploitation (Soudi)** — Pas de vue dédiée exploitation
7. **Espace employé individuel** — Pas de vue "mes dossiers/mes tâches"
8. **KPIs individuels** — Délai moyen, taux retard, taux bloqués absents
9. **Alertes configurables** — Seuils non paramétrables
10. **Finance complète** — Cycle facture (proforma→validée→réglée), transferts, rapprochement, export OHADA
11. **Kribi complet** — Gate-pass, photo docs, PDF chauffeur, compte rendu journalier
12. **RBAC** — Aucun contrôle d'accès par rôle
13. **Recherche avancée** — Pas de recherche multi-critères
14. **Notifications in-app** — Panneau de notifications absent
15. **Rapport PDF automatique** — Pas d'export PDF
16. **Comparaison Douala/Kribi** — Pas de vue comparative

### 🟡 Fonctionnalités partielles
- Dashboard DG existe mais manque heatmap, performance employés, comparaison sites
- Page Dossiers existe mais sans filtres avancés ni création
- DossierDetail a une timeline mais pas de transition/signature/PJ/commentaires

### 🟢 Ajouts proactifs (non dans le CDC mais pertinents)
1. **Mode sombre/clair** — Toggle thème pour confort d'utilisation
2. **Tableau de bord temps réel** — Auto-refresh des KPIs
3. **Drag & drop pour upload** — UX moderne pour les documents
4. **Filtres sauvegardés** — Permettre de sauvegarder des filtres fréquents
5. **Export multi-format** — PDF + Excel + CSV pour tous les tableaux
6. **Indicateur de charge par employé** — Jauge visuelle de workload
7. **Vue Kanban des dossiers** — En plus de la vue liste
8. **Raccourcis clavier** — Navigation rapide pour les power users
9. **Page Paramètres** — Gestion des seuils d'alertes, profil utilisateur
10. **Breadcrumbs** — Navigation contextuelle sur toutes les pages

## Plan d'implémentation (ordre de priorité)

### Phase 1 — Cœur fonctionnel
1. Formulaire création dossier (modal + page)
2. DossierDetail complet (transition, PJ, commentaires, historique)
3. Recherche avancée + filtres sur la page Dossiers
4. Vue Kanban des dossiers

### Phase 2 — Dashboards & Espaces
5. Dashboard DG enrichi (heatmap, perf employés, comparaison sites)
6. Dashboard Exploitation (vue Soudi)
7. Espace employé individuel + KPIs
8. Système de notifications in-app

### Phase 3 — Finance, Kribi, Transversal
9. Finance complète (cycle factures, transferts, rapprochement, export)
10. Module Kribi complet (gate-pass, photos, PDF, rapport journalier)
11. Page Paramètres (seuils alertes, profil)
12. Alertes configurables enrichies
13. Export PDF/Excel des rapports
