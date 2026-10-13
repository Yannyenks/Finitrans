import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";

/** Assignation des étapes du parcours, compte rendu de clôture et bibliothèque documentaire. */
const PASSWORD = "finitrans2025";
const SUFFIXE = `${Date.now() % 100000}`;

const contextes: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contextes.splice(0).map(c => c.close().catch(() => {}))); });

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

test("un responsable confie l'étape « Bon Compagnie » ; à la clôture le compte rendu PDF est archivé", async ({ browser }) => {
  const yasmine = await session(browser, "yasmine");
  const creation = await appel(yasmine, "POST", "/api/dossiers", {
    client: `CLIENT PARCOURS ${SUFFIXE}`, compagnie: "MSC", conteneur: `MSCU${SUFFIXE}8`, marchandise: "Pneumatiques",
    site: "Douala", dateArrivee: new Date().toISOString(),
  });
  expect(creation.status).toBe(201);
  const dossier = creation.body as { id: string; numero: string };

  await yasmine.goto(`/dossiers/${dossier.id}`);
  const equipe = yasmine.getByTestId("equipe-parcours");
  await expect(equipe.locator('[data-etape="bon_compagnie"]')).toBeVisible();
  await equipe.getByRole("button", { name: "Assigner l'étape Bon Compagnie" }).click();
  const dlg = yasmine.getByRole("dialog");
  await dlg.getByPlaceholder("Rechercher un employé…").fill("rasoul");
  await dlg.getByRole("option", { name: /RASOUL/ }).click();
  await dlg.getByPlaceholder(/Consignes/).fill("Client prioritaire, relancer MSC dès réception du BAD");
  await dlg.getByRole("button", { name: "Confier l'étape" }).click();
  await expect(yasmine.getByText(/confiée à Mr RASOUL/).first()).toBeVisible();
  await expect(equipe.locator('[data-etape="bon_compagnie"]')).toContainText("désigné par");

  // Mr Rasoul est prévenu et retrouve le dossier
  const rasoul = await session(browser, "rasoul");
  const notifs = await appel(rasoul, "GET", "/api/notifications");
  const liste = notifs.body.data ?? notifs.body;
  expect(liste.some((n: any) => n.dossierId === dossier.id)).toBe(true);

  // Clôture par la Direction → bandeau, compte rendu, bibliothèque
  const delba = await session(browser, "delba");
  expect((await appel(delba, "PATCH", `/api/dossiers/${dossier.id}/status`, { status: "cloture" })).status).toBe(200);
  await yasmine.reload();
  const bandeau = yasmine.getByTestId("bandeau-cloture");
  await expect(bandeau).toBeVisible();
  const pdf = yasmine.waitForResponse(r => r.url().includes(`/api/dossiers/${dossier.id}/compte-rendu`));
  await bandeau.getByRole("button", { name: "Ouvrir le compte rendu" }).click();
  expect((await pdf).headers()["content-type"]).toContain("application/pdf");

  await bandeau.getByRole("button", { name: "Bibliothèque" }).click();
  await expect(yasmine).toHaveURL(/\/bibliotheque\?dossier=/);
  await expect(yasmine.getByText(`Dossier ${dossier.numero}`)).toBeVisible();
  const carte = yasmine.getByTestId("document").filter({ hasText: `Compte-rendu-${dossier.numero}.pdf` });
  await expect(carte).toBeVisible();
  await carte.getByRole("button", { name: /Aperçu de/ }).click();
  await expect(yasmine.getByRole("dialog").getByText("Comptes rendus").first()).toBeVisible();
  await expect(yasmine.getByRole("dialog").locator("iframe")).toBeVisible({ timeout: 20_000 });
});

test("bibliothèque : dépôt, recherche, aperçu, favoris et confidentialité", async ({ browser }) => {
  const aliou = await session(browser, "aliou");
  await aliou.goto("/bibliotheque");
  await aliou.getByRole("button", { name: "Déposer", exact: true }).click();
  const depot = aliou.getByRole("dialog");
  await depot.getByLabel("Choisir des fichiers").setInputFiles([
    { name: `procedure-port-${SUFFIXE}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 procédure ${SUFFIXE}`) },
    { name: `note-interne-${SUFFIXE}.txt`, mimeType: "text/plain", buffer: Buffer.from(`Note interne confidentielle ${SUFFIXE}`) },
  ]);
  await depot.getByRole("combobox", { name: "Catégorie du document" }).click();
  await aliou.getByRole("option", { name: "Procédures" }).click();
  await depot.getByLabel("Étiquettes").fill("kribi, port");
  await depot.getByRole("button", { name: /Ajouter 2 documents/ }).click();
  await expect(aliou.getByText("2 documents ajoutés à la bibliothèque").first()).toBeVisible();

  // Recherche instantanée et aperçu
  await aliou.getByLabel("Rechercher dans la bibliothèque").fill(`procedure-port-${SUFFIXE}`);
  const carte = aliou.getByTestId("document").filter({ hasText: `procedure-port-${SUFFIXE}.pdf` });
  await expect(carte).toBeVisible();
  await expect(aliou.getByTestId("document")).toHaveCount(1);
  await carte.getByRole("button", { name: /Aperçu de/ }).click();
  const apercu = aliou.getByRole("dialog");
  await expect(apercu.getByText("kribi")).toBeVisible();
  await apercu.getByRole("button", { name: "Ajouter aux favoris" }).click();
  await expect(aliou.getByText("Ajouté aux favoris").first()).toBeVisible();
  await apercu.getByRole("button", { name: "Fermer" }).click();
  await expect(apercu).toBeHidden();

  await aliou.getByLabel("Rechercher dans la bibliothèque").fill("");
  await aliou.getByRole("navigation", { name: "Collections" }).getByRole("button", { name: /Mes favoris/ }).click();
  await expect(aliou.getByTestId("document")).toHaveCount(1);

  // Vue liste + passage en confidentiel de la note interne
  await aliou.getByRole("navigation", { name: "Collections" }).getByRole("button", { name: /Procédures/ }).click();
  await aliou.getByRole("button", { name: "Vue en liste" }).click();
  await aliou.getByTestId("document").filter({ hasText: `note-interne-${SUFFIXE}.txt` }).click();
  await aliou.getByRole("button", { name: "Modifier les informations" }).click();
  const edition = aliou.getByRole("dialog", { name: "Modifier les informations" });
  await edition.getByRole("switch").click();
  await edition.getByRole("button", { name: "Enregistrer" }).click();
  await expect(aliou.getByText("Informations mises à jour").first()).toBeVisible();

  // Un autre employé trouve la procédure mais pas la note confidentielle
  const odette = await session(browser, "odette");
  await odette.goto("/bibliotheque");
  await odette.getByLabel("Rechercher dans la bibliothèque").fill(SUFFIXE);
  await expect(odette.getByTestId("document").filter({ hasText: `procedure-port-${SUFFIXE}.pdf` })).toBeVisible();
  await expect(odette.getByTestId("document").filter({ hasText: `note-interne-${SUFFIXE}.txt` })).toHaveCount(0);
});
