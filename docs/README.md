# PO-App v10 (Institucional, sin CDN)

Esta versión **no depende de CDNs** (jsdelivr/cdnjs/unpkg). Trae las librerías dentro de `vendor/`.

## Publicación en GitHub Pages (evitar que se quede en v7)

1. En tu repo, borra/actualiza estos archivos en la **raíz**:
   - `index.html`, `app.js`, `styles.css`, `config.js`
   - carpeta `vendor/`
2. Sube **todo** el contenido de este ZIP (incluida `vendor/`).
3. En GitHub: Settings → Pages → Source: `Deploy from a branch` → Branch: `main` (o `master`) → Folder: `/ (root)`.
4. Abre tu página y fuerza recarga:
   - Windows: **Ctrl + F5**
   - Alternativa: modo incógnito.

Si en el encabezado no dice **PO-App v10**, aún estás viendo una versión cacheada.
