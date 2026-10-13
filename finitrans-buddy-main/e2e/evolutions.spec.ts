import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";
// Les sessions ouvertes par un test sont fermées à la fin de celui-ci (sinon elles continuent
// d'interroger l'API en arrière-plan et ralentissent les tests suivants)
const contextes: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contextes.splice(0).map(c => c.close().catch(() => {}))); });


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

test("les employés arrivent sur Alertes ; la Direction sur son pilotage", async ({ browser }) => {
  for (const compte of ["odette", "yaya", "aliou"]) {
    const p = await session(browser, compte);
    await expect(p).toHaveURL(/\/alertes$/);
    await p.context().close();
  }
  const delba = await session(browser, "delba");
  await expect(delba).toHaveURL(/\/dashboard$/);
});

test("DI sous 20 % : badge d'alarme et historique des DI", async ({ browser }) => {
  const yasmine = await session(browser, "yasmine");
  // DI consommée à 85 % via l'API (même session)
  const di = await yasmine.evaluate(async (suffixe) => {
    const token = localStorage.getItem("ft_access_token");
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const r = await fetch("/api/di", { method: "POST", headers: h, body: JSON.stringify({ numero: `DI-E2E-${suffixe}`, client: "CLIENT ALARME", montant: 1000000, dateEmission: new Date().toISOString() }) });
    const d = await r.json();
    await fetch(`/api/di/${d.id}/mouvements`, { method: "POST", headers: h, body: JSON.stringify({ type: "debit", montant: 850000, motif: "Débit test alarme", categorie: "droits_douane" }) });
    return d;
  }, SUFFIXE);
  await yasmine.goto("/di");
  await expect(yasmine.getByRole("button", { name: /DI < 20 %/ })).toBeVisible({ timeout: 20_000 });
  await yasmine.getByRole("tab", { name: "Historique des DI" }).click();
  await yasmine.getByPlaceholder(/DI, client, dossier/).fill(di.numero);
  await expect(yasmine.getByText("Débit test alarme")).toBeVisible();
});

test("Logistique : véhicule, chauffeur et transport d'un TC daté", async ({ browser }) => {
  const yaya = await session(browser, "yaya");
  await yaya.goto("/logistique");
  await expect(yaya.getByRole("tab", { name: /Droits/ })).toHaveCount(0);
  await expect(yaya.getByRole("tab", { name: /Paiements/ })).toHaveCount(0);

  await yaya.getByRole("tab", { name: /Véhicules \(/ }).click();
  await yaya.getByRole("button", { name: "Nouveau véhicule" }).click();
  await yaya.getByPlaceholder("LT 1234 AB").fill(`LT ${SUFFIXE} E2E`);
  await yaya.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(yaya.getByText("Véhicule ajouté").first()).toBeVisible();

  await yaya.getByRole("tab", { name: /Chauffeurs/ }).click();
  await yaya.getByRole("button", { name: "Nouveau chauffeur" }).click();
  const dlg = yaya.getByRole("dialog");
  await dlg.locator("input").nth(0).fill(`Chauffeur E2E ${SUFFIXE}`);
  await dlg.locator("input").nth(1).fill("+237 677 00 00 00");
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  await expect(yaya.getByText("Chauffeur ajouté").first()).toBeVisible();

  await yaya.getByRole("tab", { name: /Transports TC/ }).click();
  await yaya.getByRole("button", { name: "Nouveau transport" }).click();
  const t = yaya.getByRole("dialog");
  await t.getByPlaceholder("MSCU1234567").fill(`TCNU${SUFFIXE}`);
  await t.getByRole("combobox").nth(2).click();
  await yaya.getByRole("option", { name: new RegExp(`LT ${SUFFIXE} E2E`) }).click();
  await t.getByRole("combobox").nth(3).click();
  await yaya.getByRole("option", { name: new RegExp(`Chauffeur E2E ${SUFFIXE}`) }).click();
  await t.getByPlaceholder("Yaoundé — client").fill("Yaoundé E2E");
  await t.getByRole("button", { name: "Enregistrer" }).click();
  await expect(yaya.getByText("Transport planifié").first()).toBeVisible();
  const ligne = yaya.locator("tr", { hasText: `TCNU${SUFFIXE}` });
  await expect(ligne).toContainText(`Chauffeur E2E ${SUFFIXE}`);
  await ligne.getByRole("button", { name: "Départ" }).click();
  await expect(ligne).toContainText("En route");
});

test("Messagerie : mentionner une personne avec @", async ({ browser }) => {
  const yaya = await session(browser, "yaya");
  await yaya.goto("/messagerie");
  // Conversation créée via l'API pour cibler le test
  const convId = await yaya.evaluate(async (suffixe) => {
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ft_access_token")}` };
    const emps = await (await fetch("/api/employes?limit=100", { headers: h })).json();
    const wandala = emps.data.find((e: any) => e.email === "wandala@finitrans.cm");
    const r = await fetch("/api/messagerie/conversations", { method: "POST", headers: h, body: JSON.stringify({ titre: `Mention E2E ${suffixe}`, participantIds: [wandala.id] }) });
    return (await r.json()).id;
  }, SUFFIXE);
  await yaya.goto(`/messagerie?conversation=${convId}`);
  const zone = yaya.getByPlaceholder(/tapez @ pour mentionner/);
  await zone.fill("Bonjour @odet");
  await yaya.getByRole("option", { name: /Mme ODETTE/ }).click();
  await zone.pressSequentially("merci de vérifier");
  await zone.press("Enter");
  await expect(yaya.getByText("1 personne(s) mentionnée(s) et notifiée(s)").first()).toBeVisible();

  const odette = await session(browser, "odette");
  const notifs = await odette.evaluate(async () => {
    const r = await fetch("/api/notifications?limit=10", { headers: { Authorization: `Bearer ${localStorage.getItem("ft_access_token")}` } });
    return (await r.json()).data.map((n: any) => n.titre);
  });
  expect(notifs).toContain("Mr YAYA vous a mentionné");
});
