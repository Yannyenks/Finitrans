/**
 * Parcours SaaS dans l'interface réelle : site public, inscription d'une entreprise,
 * espace isolé, demande de démonstration, déconnexion.
 */
import { test, expect } from "@playwright/test";

const SUFFIXE = Date.now().toString(36);
const EMAIL = `dg.${SUFFIXE}@atlas-e2e.test`;
const PASSWORD = "Transit2026secure";
const ENTREPRISE = `Atlas Freight ${SUFFIXE}`;

test("une entreprise crée son espace depuis le site et arrive dans un espace isolé", async ({ page, request }) => {
  const erreurs: string[] = [];
  page.on("pageerror", e => erreurs.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: "fr", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Chaque dossier");
  await page.getByRole("link", { name: /Créer l'espace de mon entreprise/ }).first().click();
  await expect(page).toHaveURL(/\/inscription$/);

  await page.getByLabel("Nom de l'entreprise").fill(ENTREPRISE);
  await page.getByLabel("Votre nom complet").fill("Awa Diallo");
  await page.getByLabel("Email professionnel").fill(EMAIL);
  await page.getByLabel("Pays principal d'activité").selectOption("SN");
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  const creer = page.getByRole("button", { name: "Créer mon espace" });
  await expect(creer).toBeDisabled(); // conditions non acceptées
  await page.getByRole("checkbox").check();
  await creer.click();

  // L'espace s'ouvre directement, au nom de l'entreprise, avec l'essai affiché
  await page.waitForURL(u => !u.pathname.startsWith("/inscription"), { timeout: 30_000 });
  await expect(page.getByText(ENTREPRISE).first()).toBeVisible();
  await expect(page.getByText(/Essai Business/)).toBeVisible();

  // Aucun dossier d'une autre entreprise : la liste est vide
  await page.goto("/dossiers");
  await page.waitForLoadState("networkidle");
  const jeton = await page.evaluate(() => localStorage.getItem("ft_access_token"));
  const liste = await request.get("/api/dossiers?limit=200", { headers: { Authorization: `Bearer ${jeton}` } });
  expect(liste.status()).toBe(200);
  expect((await liste.json()).meta.total).toBe(0);

  // Un dossier FINITRANS ouvert par son adresse directe : introuvable pour cette entreprise
  const delba = await request.post("/api/auth/login", { data: { email: "delba@finitrans.cm", password: "finitrans2025" } });
  const tokenA = (await delba.json()).accessToken;
  const dossiersA = await request.get("/api/dossiers?limit=1", { headers: { Authorization: `Bearer ${tokenA}` } });
  const idA = (await dossiersA.json()).data[0].id;
  const croise = await request.get(`/api/dossiers/${idA}`, { headers: { Authorization: `Bearer ${jeton}` } });
  expect(croise.status()).toBe(404);

  // Déconnexion : retour à la page de connexion
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Déconnexion" }).first().click();
  await page.waitForURL(/\/connexion/);

  // L'email retrouve l'espace de l'entreprise
  await page.getByLabel("Email professionnel").fill(EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /Se connecter/ }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/connexion"), { timeout: 30_000 });
  await expect(page.getByText(ENTREPRISE).first()).toBeVisible();

  expect(erreurs, erreurs.join("\n")).toEqual([]);
});

test("mauvais mot de passe : message affiché, pas de rechargement", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Email professionnel").fill("delba@finitrans.cm");
  await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: /Se connecter/ }).click();
  await expect(page.getByRole("alert")).toContainText("Identifiants incorrects");
  await expect(page).toHaveURL(/\/connexion$/);
});

test("une demande de démonstration n'est confirmée qu'après son enregistrement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "fr", exact: true }).click();
  await page.locator("#demo").scrollIntoViewIfNeeded();
  await page.getByLabel("Nom complet").fill("Jean Mbarga");
  await page.getByLabel("Entreprise", { exact: true }).fill(`Prospect ${SUFFIXE}`);
  await page.getByLabel("Email professionnel").fill(`contact.${SUFFIXE}@prospect.test`);
  await page.getByLabel("Taille de l'équipe").selectOption("11-50");
  const reponse = page.waitForResponse(r => r.url().includes("/api/public/demandes-demo"));
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  expect((await reponse).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText("Demande enregistrée");
});
