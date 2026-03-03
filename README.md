# Geoportal AMIE (ultralight)

## Estructura
- index.html
- styles.css
- app.js
- config.js (por defecto usa CSV local)
- config.example.js (plantilla)
- data/instituciones_geo_fixed.csv (tu base de puntos)

## Cómo usar (GitHub Pages)
1. Sube esta carpeta al root del repo.
2. Verifica que `index.html` esté en la raíz.
3. Habilita GitHub Pages (branch main / root).

## Datos
- CSV local: `data/instituciones_geo_fixed.csv`
- Campos mínimos: `amie, nombre, provincia, canton, parroquia, tipo, sostenimiento, lat, lon`
- Si tu CSV tiene otros nombres, la app intenta detectarlos (AMIE/CODAMIE, LAT/LON, etc.)

## Supabase (opcional)
1. Copia `config.example.js` como `config.js`.
2. Configura `SUPABASE_URL`, `SUPABASE_KEY` (anon) y `TABLE` (por defecto: instituciones).
3. Campos esperados en la tabla: `amie, nombre, tipo, sostenimiento, provincia, canton, parroquia, lat, lon`

