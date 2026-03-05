# PO-App v12 (Institucional, sin CDN) — Publicación dual (root y /docs)

Este paquete está diseñado para **evitar el error de “No se cargó XLSX”** en redes institucionales (bloqueo de CDN) y para **evitar confusión** con GitHub Pages.

## Qué incluye
- Librerías **locales** en `vendor/` (XLSX + jsPDF + AutoTable). **No usa CDN**.
- Validador de plantilla **.xlsx/.xlsm**:
  - Hojas obligatorias: `Pasos`, `Nómina`, `Par_PO`, `DIS_TRA`, `PlanEstudio`, `Param`.
  - Validaciones mínimas:
    - **Nómina**: AMIE (B5/B4), cédula 10 dígitos, FUNxIE obligatorio, “Está en la IE” Si/No, duplicados.
    - **Par_PO**: Grado/Curso, Jornada, Estudiantes numérico >= 0, BT/BTP con especialidad (si existe columna).
    - **DIS_TRA**: detecta valores negativos.
  - Reporte: **pantalla + JSON + PDF**.
- Checklist automático: lee la hoja `Pasos` y la muestra como tabla.

## Publicación en GitHub Pages (sin errores)
Este repo viene en **modo dual**:
- Archivos en la raíz (root)
- Los mismos archivos dentro de `docs/`

Así, funciona si Pages publica desde:
- `/(root)` **o**
- `/docs`

### Opción A (recomendada): Pages desde `/docs`
1. Repo → **Settings → Pages**
2. Source: Deploy from a branch
3. Branch: `main`
4. Folder: `/docs`
5. Save

### Opción B: Pages desde `/(root)`
En la misma pantalla, cambia Folder a `/(root)`.

## Nota sobre macros
El sistema **no ejecuta macros** (solo **lee** datos del archivo). `.xlsm` se lee como libro Excel.

## Archivos clave
- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `vendor/` (**obligatorio**)

## Acción opcional
Incluye un workflow `.github/workflows/sync-to-docs.yml` para mantener `docs/` sincronizado si editas el root.
