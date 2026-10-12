import { test, expect, Page } from "@playwright/test";

const PASSWORD = "finitrans2025";

/** Pages de l'application et module requis. */
const PAGES: [string, string][] = [
  ["/dashboard", "dashboard"], ["/mon-espace", "mon_espace"], ["/supervision", "supervision"],
  ["/exploitation", "exploitation"], ["/dossiers", "dossiers"], ["/codage", "codage"], ["/sorties", "sorties"],
  ["/logistique", "logistique"], ["/kribi", "kribi"], ["/administratif", "administratif"], ["/finance", "finance"],
  ["/di", "di"], ["/comptabilite", "comptabilite"], ["/comptabilite-avancee", "comptabilite_avancee"],
  ["/administration", "administration"], ["/employes", "employes"], ["/reporting", "reporting"],
  ["/performance", "performance"], ["/messagerie", "messagerie"], ["/alertes", "alertes"], ["/parametres", "parametres"],
];

const COMPTES = ["delba", "soudi", "yaya", "odette", "wandala", "rasoul", "yasmine", "honore", "aliou", "raphael"];

async function connexion(page: Page, compte: string) {
  await page.goto("/");
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first().fill(`${compte}@finitrans.cm`);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(url => !url.pathname.endsWith("/") || url.pathname.length > 1, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

for (const compte of COMPTES) {
  test(`compte ${compte} : chaque page autorisée fonctionne, les autres sont refusées`, async ({ page }) => {
    const erreurs: string[] = [];
    let pageAutorisee = false;
    page.on("pageerror", err => erreurs.push(`[JS] ${page.url()} : ${err.message}`));
    page.on("response", res => {
      const url = res.url();
      if (!url.includes("/api/")) return;
      const s = res.status();
      // 401 géré par le rafraîchissement ; 403 attendu sur les ressources hors rôle ; 404 toléré sur ressources optionnelles
      const chemin = url.replace(/^https?:\/\/[^/]+/, "");
      if (s >= 500 || s === 400) erreurs.push(`[HTTP ${s}] ${res.request().method()} ${chemin}`);
      // Sur une page autorisée, aucune donnée affichée ne doit être refusée (section vide silencieuse)
      if ((s === 403 || s === 404) && pageAutorisee) erreurs.push(`[HTTP ${s}] ${res.request().method()} ${chemin} (page ${new URL(page.url()).pathname})`);
    });

    await connexion(page, compte);
    const user = await page.evaluate(() => JSON.parse(localStorage.getItem("ft_user") ?? "{}"));
    const modules: string[] = user.modules ?? [];
    expect(modules.length, "modules du rôle").toBeGreaterThan(3);

    for (const [chemin, module] of PAGES) {
      pageAutorisee = modules.includes(module);
      await page.goto(chemin);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const texte = await page.locator("body").innerText();
      expect(await page.locator('[data-testid="error-boundary"]').count(), `écran d'erreur sur ${chemin}`).toBe(0);
      if (modules.includes(module)) {
        expect(texte, `${chemin} ne doit pas être refusé à ${compte}`).not.toContain("Module non attribué à votre rôle");
      } else {
        expect(texte, `${chemin} doit être refusé à ${compte}`).toContain("Module non attribué à votre rôle");
      }
    }

    // La barre latérale ne propose que les modules du rôle
    pageAutorisee = false;
    await page.goto("/mon-espace");
    const liens = await page.locator('nav[aria-label="Navigation principale"] a').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute("href")));
    for (const href of liens) {
      const mod = PAGES.find(([c]) => c === href)?.[1];
      if (mod) expect(modules, `lien ${href} visible`).toContain(mod);
    }

    expect(erreurs, erreurs.join("\n")).toEqual([]);
  });
}
