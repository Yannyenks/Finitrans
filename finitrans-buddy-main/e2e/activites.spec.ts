import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";
// Les sessions ouvertes par un test sont fermées à la fin de celui-ci (sinon elles continuent
// d'interroger l'API en arrière-plan et ralentissent les tests suivants)
const contextes: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contextes.splice(0).map(c => c.close().catch(() => {}))); });


/** Chaque profil réalise ses activités depuis la plateforme, sans outil externe. */
const PASSWORD = "finitrans2025";
const SUFFIXE = `${Date.now() % 100000}`;

async function session(browser: Browser, compte: string): Promise<Page> {
  const ctx = await browser.newContext();
  contextes.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", err => { throw new Error(`[JS ${compte}] ${err.message}`); });
  await page.goto("/");
  await page.locator('input[type="email"]').fill(`${compte}@finitrans.cm`);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => u.pathname !== "/", { timeout: 30_000 });
  return page;
}

/** Appel API authentifié depuis la session du navigateur. */
function appel(page: Page, methode: string, url: string, corps?: unknown) {
  return page.evaluate(async ([m, u, c]) => {
    const r = await fetch(u as string, {
      method: m as string,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ft_access_token")}` },
      body: c ? JSON.stringify(c) : undefined,
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }, [methode, url, corps] as const);
}

async function nouveauDossier(yasmine: Page, client: string) {
  const r = await appel(yasmine, "POST", "/api/dossiers", {
    client, compagnie: "MSC", conteneur: `MSCU${SUFFIXE}7`, marchandise: "Pièces détachées", site: "Douala", dateArrivee: new Date().toISOString(),
  });
  expect(r.status).toBe(201);
  return r.body as { id: string; numero: string };
}

test("Mr Yaya saisit le paiement des droits dans le dossier → le comptable le retrouve en Finance", async ({ browser }) => {
  const yasmine = await session(browser, "yasmine");
  const dossier = await nouveauDossier(yasmine, `CLIENT PAIEMENT ${SUFFIXE}`);
  const delba = await session(browser, "delba");
  expect((await appel(delba, "PATCH", `/api/dossiers/${dossier.id}/status`, { status: "paiement" })).status).toBe(200);

  const yaya = await session(browser, "yaya");
  await yaya.goto(`/dossiers/${dossier.id}`);
  const tache = yaya.getByText("Paiement des droits et taxes", { exact: true });
  if (!(await tache.isVisible().catch(() => false))) await yaya.getByText("Paiement", { exact: true }).first().click();
  await tache.click();
  await yaya.getByRole("button", { name: "Terminer la tâche" }).first().click();
  const modale = yaya.locator("div.fixed").filter({ hasText: "Montant payé (FCFA)" }).last();
  await modale.locator('input[type="number"]').fill("1250000");
  const quittance = `QTT-E2E-${SUFFIXE}`;
  await modale.getByPlaceholder("Ex : QTT-2026-00987").fill(quittance);
  await modale.getByRole("button", { name: "Valider le paiement" }).click();
  await expect(yaya.getByText("Paiement douane enregistré en Finance")).toBeVisible({ timeout: 20_000 });

  const honore = await session(browser, "honore");
  await honore.goto("/finance");
  await expect(honore.getByText(quittance)).toBeVisible({ timeout: 20_000 });
});

test("le comptable valide puis encaisse une facture et l'imprime depuis Finance", async ({ browser }) => {
  const yasmine = await session(browser, "yasmine");
  const dossier = await nouveauDossier(yasmine, `CLIENT FACTURE ${SUFFIXE}`);
  const numero = `PRO-E2E-${SUFFIXE}`;
  expect((await appel(yasmine, "POST", `/api/dossiers/${dossier.id}/factures`, {
    numero, type: "proforma", montant: 750000, compagnie: "MSC", dateFacture: new Date().toISOString(), description: "Honoraires de transit",
  })).status).toBe(201);

  const honore = await session(browser, "honore");
  await honore.goto("/finance");
  await honore.getByRole("tab", { name: /Factures clients/ }).click();
  const ligne = honore.locator("tr").filter({ hasText: numero });
  await ligne.getByRole("button", { name: "Valider" }).click();
  await expect(ligne.getByText("À encaisser")).toBeVisible();
  await ligne.getByRole("button", { name: "Encaisser" }).click();
  await expect(ligne.getByText("Réglée")).toBeVisible();

  const impression = honore.waitForEvent("popup");
  await ligne.getByTitle("Imprimer").click();
  const fenetre = await impression;
  await expect(fenetre.locator("body")).toContainText(numero);
  await expect(fenetre.locator("body")).toContainText("750");
});

test("répertoire partagé : un compte ajoute un contact, un autre le retrouve et l'appelle", async ({ browser }) => {
  const aliou = await session(browser, "aliou");
  await aliou.goto("/repertoire");
  await aliou.getByRole("button", { name: "Nouveau contact" }).click();
  const dlg = aliou.getByRole("dialog");
  await dlg.getByLabel("Nom *").fill(`Transit Kribi ${SUFFIXE}`);
  await dlg.getByLabel("Société").fill("Port Autonome de Kribi");
  await dlg.getByLabel("Téléphone", { exact: true }).fill("+237 699 11 22 33");
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  await expect(aliou.getByText("Contact ajouté").first()).toBeVisible();

  const odette = await session(browser, "odette");
  await odette.goto("/repertoire");
  await odette.getByPlaceholder(/Rechercher un nom/).fill(`Kribi ${SUFFIXE}`);
  const carte = odette.getByTestId("contact").filter({ hasText: `Transit Kribi ${SUFFIXE}` });
  await expect(carte).toBeVisible();
  await expect(carte.locator('a[href="tel:+237699112233"]')).toBeVisible();
  await expect(carte.getByTitle("Supprimer")).toHaveCount(0);
});

test("le service administratif corrige un dossier et en sort le compte rendu PDF", async ({ browser }) => {
  const yasmine = await session(browser, "yasmine");
  const dossier = await nouveauDossier(yasmine, `CLIENT FICHE ${SUFFIXE}`);
  await yasmine.goto(`/dossiers/${dossier.id}`);
  await yasmine.getByRole("button", { name: "Modifier" }).click();
  const dlg = yasmine.getByRole("dialog");
  await dlg.getByLabel("Marchandise *").fill("Groupes électrogènes");
  await dlg.getByLabel("N° BL").fill(`BL-${SUFFIXE}`);
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  await expect(yasmine.getByText("Dossier mis à jour").first()).toBeVisible();
  await expect(yasmine.getByText("Groupes électrogènes").first()).toBeVisible();

  const pdf = yasmine.waitForResponse(r => r.url().includes(`/api/dossiers/${dossier.id}/compte-rendu`));
  await yasmine.getByRole("button", { name: "Compte rendu PDF" }).click();
  const reponse = await pdf;
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toContain("application/pdf");
  expect(Number(reponse.headers()["content-length"])).toBeGreaterThan(3000); // contenu %PDF vérifié par les tests API
});
