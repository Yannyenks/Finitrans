import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";
// Les sessions ouvertes par un test sont fermées à la fin de celui-ci (sinon elles continuent
// d'interroger l'API en arrière-plan et ralentissent les tests suivants)
const contextes: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contextes.splice(0).map(c => c.close().catch(() => {}))); });


const PASSWORD = "finitrans2025";
const CLIENT = `CLIENT E2E ${Date.now() % 100000}`;

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

/** Choisit une option dans un Select (Radix) identifié par son libellé. */
async function choisir(page: Page, declencheur: ReturnType<Page["locator"]>, option: string | RegExp) {
  await declencheur.click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Le titulaire termine toutes ses tâches actionnables du dossier depuis « Mon espace ». */
async function terminerMesTaches(page: Page) {
  await page.goto("/mon-espace");
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 10; i++) {
    const ligne = page.locator("div.rounded-xl", { hasText: CLIENT }).filter({ has: page.getByRole("button", { name: "Terminer" }) }).first();
    if (await ligne.count() === 0) break;
    await ligne.getByRole("button", { name: "Terminer" }).click();
    await expect(page.getByText("Tâche terminée").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
}

test("parcours réel : création, chaque compte termine sa tâche, passage d'étape, supervision", async ({ browser }) => {
  test.setTimeout(480_000);

  // 1. Mme Yasmine enregistre le dossier via le formulaire
  const yasmine = await session(browser, "yasmine");
  await yasmine.goto("/dossiers");
  await yasmine.getByRole("button", { name: /Nouveau dossier/ }).click();
  const dlg = yasmine.getByRole("dialog");
  await dlg.getByPlaceholder("Nom du client").fill(CLIENT);
  await choisir(yasmine, dlg.getByRole("combobox").first(), "MSC");
  await dlg.getByPlaceholder("Ex: MSCU7654321").fill("MSCU9999999");
  await dlg.getByPlaceholder("Ex: Matériaux de construction").fill("Pièces E2E");
  await dlg.locator('input[type="date"]').first().fill(new Date().toISOString().slice(0, 10));
  await dlg.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(yasmine.getByText("Dossier créé").first()).toBeVisible({ timeout: 20_000 });

  // 2. Chaque titulaire des tâches de réception les termine lui-même
  await terminerMesTaches(yasmine);
  for (const compte of ["odette", "honore"]) {
    const p = await session(browser, compte);
    await terminerMesTaches(p);
    await p.context().close();
  }

  // 3. Mme Yasmine joint la preuve et passe l'étape depuis le dossier
  await yasmine.goto("/dossiers");
  await yasmine.getByPlaceholder(/Rechercher par numéro/).fill(CLIENT);
  await yasmine.getByText(CLIENT).first().click();
  await yasmine.waitForURL(/\/dossiers\/[0-9a-f-]+$/);
  await yasmine.waitForLoadState("networkidle");
  await yasmine.getByRole("tab", { name: /Documents/ }).click();
  await yasmine.locator('input[type="file"]').last().setInputFiles({ name: "bl-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF E2E ${Date.now()}`) });
  await yasmine.getByRole("button", { name: "Envoyer" }).last().click();
  await expect(yasmine.getByText("Document uploadé avec succès").first()).toBeVisible();
  await yasmine.getByRole("button", { name: /Passer à : Soumission SGS/ }).click();
  await yasmine.getByRole("button", { name: "Confirmer la passation" }).click();
  await expect(yasmine.getByText("Dossier avancé").first()).toBeVisible({ timeout: 20_000 });
  await expect(yasmine.getByText("Soumission SGS").first()).toBeVisible();

  // 4. La Direction supervise : le dossier apparaît dans le pipeline, à l'étape Soumission SGS
  const delba = await session(browser, "delba");
  await delba.goto("/supervision");
  await delba.getByPlaceholder("Rechercher (n°, client, responsable)…").fill(CLIENT);
  const carte = delba.locator(".stat-card", { hasText: CLIENT });
  await expect(carte).toBeVisible();
  await expect(carte.getByText("Soumission SGS").first()).toBeVisible();

  // 5. Mr Yaya voit le dossier (la tâche « paiement » lui est attribuée) mais ne peut pas terminer l'étape en cours
  const yaya = await session(browser, "yaya");
  await yaya.goto("/dossiers");
  await yaya.getByText(CLIENT).first().click();
  await yaya.waitForURL(/\/dossiers\/[0-9a-f-]+$/);
  await yaya.waitForLoadState("networkidle");
  await expect(yaya.getByRole("button", { name: /Passer à/ })).toHaveCount(0);

  // 6. Mr Aliou (Kribi) n'intervient pas sur ce dossier Douala : il ne le voit pas
  const aliou = await session(browser, "aliou");
  await aliou.goto("/dossiers");
  await aliou.waitForLoadState("networkidle");
  await expect(aliou.getByText(CLIENT)).toHaveCount(0);
});
