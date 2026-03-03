# Aplicativo Plantilla Óptima (PO) — GitHub Pages

Este paquete es un **frontend estático** (HTML/CSS/JS). Procesa los Excel **localmente en el navegador**.

## Orden recomendado para subir a GitHub

1. Crea un repositorio (ej. `po-app`).
2. Sube **estos archivos y carpetas** en la raíz del repo:
   - `index.html`
   - `styles.css`
   - `config.js`
   - `app.js`
   - `assets/` (vacío por ahora, por si luego agregas logos o iconos)
3. Activa GitHub Pages:
   - Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / Folder: `/ (root)`.

## Qué hace hoy

- Muestra el **catálogo vigente 00065** (áreas, familias, figuras).
- Permite subir Excel (DTD, necesidades/excesos, otros) y **detecta textos** que coincidan con figuras vigentes.
- Marca como **observación crítica** textos “parecidos” a figuras (heurística) que **no están** en el catálogo.
- Permite subir una tabla de **equivalencias** (CSV/XLSX) para sugerir homologación cuando cambiaron nombres.

## Equivalencias (opcional)

Formato recomendado (CSV):

```
anterior,nueva
"Informatica","Soporte informático"
```

O Excel con encabezados similares a: `Anterior` y `Nueva`.

## Próximo paso (cuando tengas más insumos)

- Conectar el cálculo completo de **necesidad docente / plantilla óptima** leyendo celdas específicas de la Matriz DTD.
- Incorporar validaciones por AMIE, paralelos, aforos y reglas por nivel/modalidad.

