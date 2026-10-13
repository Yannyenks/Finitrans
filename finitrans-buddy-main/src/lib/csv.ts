/** Génère et télécharge un fichier CSV (séparateur « ; », ouvrable directement dans Excel). */
export function telechargerCsv(nomFichier: string, lignes: Record<string, unknown>[]) {
  if (lignes.length === 0) return;
  const entetes = Object.keys(lignes[0]);
  const cellule = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenu = [entetes.join(";"), ...lignes.map(l => entetes.map(e => cellule(l[e])).join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + contenu], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
