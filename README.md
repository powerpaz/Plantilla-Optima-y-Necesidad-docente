# PO-Check (MVP) — Distributivo Docente / Plantilla Óptima
Aplicativo web (GitHub Pages) para cargar archivos Excel (.xlsx/.xlsm) y validar estructura base.
Este MVP valida que exista la hoja **NOMINE** y genera un log descargable.

## Estructura del repo
- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `README.md`

## Publicación en GitHub Pages
1. Crea un repo (ej.: `po-check`)
2. Sube estos archivos a la raíz del repo
3. Settings → Pages → Deploy from a branch → Branch: `main` / root
4. Abre la URL que te genera GitHub Pages

## Qué valida (v0.1)
- Hojas detectadas
- Existencia de hoja `NOMINE`
- Rango usado en NOMINE (aprox. filas x columnas)

## Próximo (v0.2)
- Validar columnas/campos mínimos de NOMINE según la Matriz DTD oficial
- Detectar fórmulas rotas / celdas con fórmula editadas
- Motor de cálculo PO/ND + comparativo con archivos de necesidades/excesos
