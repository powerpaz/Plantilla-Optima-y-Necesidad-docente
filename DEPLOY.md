# 🚀 Guía Rápida - Despliegue en GitHub Pages

## Paso 1: Preparar el repositorio

```bash
# Si aún no tienes un repositorio, créalo:
git init
git add .
git commit -m "feat: PO-App v18 con validación completa y reportes PDF/JSON"
```

## Paso 2: Conectar con GitHub

### Opción A: Repositorio nuevo
```bash
# Crear repositorio en GitHub (https://github.com/new)
# Luego conectar:
git remote add origin https://github.com/TU-USUARIO/PO-App-v18.git
git branch -M main
git push -u origin main
```

### Opción B: Repositorio existente
```bash
git remote set-url origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

## Paso 3: Activar GitHub Pages

1. Ve a tu repositorio en GitHub
2. Click en **Settings** (Configuración)
3. En el menú lateral, click en **Pages**
4. En **Source**, selecciona:
   - Branch: `main`
   - Folder: `/docs`
5. Click en **Save**

## Paso 4: Verificar despliegue

Espera 1-2 minutos y accede a:
```
https://TU-USUARIO.github.io/TU-REPO/
```

## 🔧 Actualizar la aplicación

Cada vez que hagas cambios:

```bash
# Editar archivos necesarios (app.js, index.html, etc.)

# Copiar cambios a /docs
cp index.html app.js config.js styles.css docs/
cp -r vendor docs/

# Commit y push
git add .
git commit -m "update: descripción de cambios"
git push
```

## ⚡ Cache busting

Si los cambios no se reflejan:

1. **Limpiar caché del navegador**: `Ctrl + Shift + R` (Windows/Linux) o `Cmd + Shift + R` (Mac)
2. **Incrementar versión** en `config.js`:
   ```javascript
   window.APP_CONFIG={version:'v18.1.0', mode:'institucional_sin_cdn'};
   ```
3. **Actualizar cache busters** en `index.html`:
   ```html
   <script defer src="app.js?v=18.1.0"></script>
   ```

## 📁 Estructura recomendada

```
PO-App-v18/
├── .gitignore          ← Ignorar archivos innecesarios
├── README.md           ← Documentación principal
├── DEPLOY.md           ← Esta guía
├── index.html          ← Archivo fuente
├── app.js              ← Archivo fuente
├── config.js           ← Archivo fuente
├── styles.css          ← Archivo fuente
├── vendor/             ← Librerías locales
└── docs/               ← Copias para GitHub Pages
    ├── index.html
    ├── app.js
    ├── config.js
    ├── styles.css
    └── vendor/
```

## 🐛 Solución de problemas

### "404 - There isn't a GitHub Pages site here"
- Verifica que GitHub Pages esté activado en Settings
- Asegúrate de que la carpeta `/docs` tenga todos los archivos
- Espera 2-3 minutos y recarga

### Los cambios no se ven
- Limpia caché del navegador
- Verifica que copiaste los archivos a `/docs`
- Incrementa la versión en los cache busters

### Error de CORS con vendor/
- Las librerías están locales, no debería haber errores CORS
- Verifica que la carpeta `vendor/` esté en `/docs`
- Revisa la consola del navegador para más detalles

## 📞 Soporte

Si encuentras problemas:
1. Revisa la consola del navegador (F12)
2. Usa el botón "Diagnóstico" en la app
3. Verifica los Actions en GitHub (si hay errores de build)

---

¡Listo! Tu aplicación debería estar funcionando en: `https://TU-USUARIO.github.io/TU-REPO/`
