const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Ouvre une page imprimable (en-tête société) et lance l'impression du navigateur. */
export function printDocument(titre: string, contenu: string, entreprise?: { raisonSociale?: string; adresse?: string; telephone?: string; niu?: string; rccm?: string }) {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) throw new Error("Autorisez les fenêtres pop-up pour imprimer");
  const entete = entreprise?.raisonSociale
    ? `<header><strong>${escapeHtml(entreprise.raisonSociale)}</strong><br>${escapeHtml([entreprise.adresse, entreprise.telephone].filter(Boolean).join(" — "))}${entreprise.niu || entreprise.rccm ? `<br><small>${escapeHtml([entreprise.niu && `NIU ${entreprise.niu}`, entreprise.rccm && `RCCM ${entreprise.rccm}`].filter(Boolean).join(" · "))}</small>` : ""}</header>`
    : "";
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(titre)}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#111}header{border-bottom:2px solid #F07B37;padding-bottom:10px;margin-bottom:24px}
h1{font-size:18px;margin:0 0 16px}pre{white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6}</style></head>
<body>${entete}<h1>${escapeHtml(titre)}</h1><pre>${escapeHtml(contenu)}</pre></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}
