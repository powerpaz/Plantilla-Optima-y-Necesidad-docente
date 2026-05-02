# 🚀 Guía Rápida - Validación de Matriz DTD

## Para Técnicos del Distrito

### 1️⃣ Cargar archivo
- Abre la aplicación en tu navegador
- Haz clic en "Examinar" o "Seleccionar archivo"
- Selecciona tu archivo `Matriz_DTD_*.xlsm`

### 2️⃣ Validar
- Haz clic en el botón **"Validar Matriz DTD"**
- Espera unos segundos mientras se procesa
- Revisa el resumen de estado

### 3️⃣ Interpretar Resultados

#### ✅ VALIDADO (Verde)
**Significado:** La matriz cumple todos los requisitos  
**Acción:** Puedes proceder. Descarga el reporte como evidencia.

#### ✓ VALIDADO CON OBSERVACIONES (Amarillo)
**Significado:** No hay errores críticos, pero hay recomendaciones  
**Acción:** Revisa las observaciones. No son obligatorias pero se recomienda corregirlas.

#### ⚠️ ERRORES CRÍTICOS (Rojo)
**Significado:** Hay problemas que DEBEN corregirse  
**Acción:** Revisa la tabla de inconsistencias y corrige según el paso indicado.

### 4️⃣ Corregir Errores

La tabla de inconsistencias te mostrará:

| Severidad | Hoja | Paso | Fila | Descripción |
|-----------|------|------|------|-------------|
| ❌ ERROR | Nómina | 2 | 5 | Debe seleccionar un código AMIE válido |

**Cómo corregir:**
1. Abre tu archivo Excel (Matriz DTD)
2. Ve a la **Hoja** indicada
3. Busca la **Fila** señalada
4. Revisa el **Paso** de la metodología
5. Corrige según la **Descripción**
6. Guarda el archivo
7. Vuelve a validar

### 5️⃣ Descargar Reporte

Una vez validado (con o sin observaciones):
- **PDF:** Para presentar a autoridades o archivar
- **JSON:** Para integrar con otros sistemas

---

## Errores Más Comunes

### ❌ "Debe seleccionar un código AMIE válido"
**Causa:** El campo AMIE está vacío o es "0"  
**Solución:** En la hoja Nómina (fila 5), selecciona el código AMIE de tu institución desde la lista desplegable

### ❌ "Falta completar MODALIDAD"
**Causa:** Campo obligatorio vacío en Par_PO  
**Solución:** En la hoja Par_PO, completa todos los campos marcados como obligatorios

### ⚠️ "Total de horas (28) excede las 25 horas pedagógicas"
**Causa:** La distribución horaria excede el límite de LOEI reformada  
**Solución:** Revisa la distribución en DIS_TRA y ajusta para que no supere 25 horas

### ❌ "AMIE diferente entre Nómina y Par_PO"
**Causa:** Códigos AMIE inconsistentes entre hojas  
**Solución:** Asegúrate de usar el mismo código AMIE en todas las hojas

---

## Checklist Antes de Validar

- [ ] El archivo es formato .xlsm o .xlsx
- [ ] Contiene las hojas: Pasos, Nómina, Par_PO, DIS_TRA
- [ ] El código AMIE está seleccionado (no es 0)
- [ ] La nómina tiene datos de personal
- [ ] Los campos obligatorios de Par_PO están completos
- [ ] La distribución horaria está cargada en DIS_TRA

---

## ¿Necesitas Ayuda?

1. **Botón Diagnóstico:** Verifica que la aplicación funcione correctamente
2. **Consola del navegador:** Presiona F12 para ver errores técnicos
3. **Documentación completa:** Revisa README.md
4. **Archivo de ejemplo:** Usa `Matriz_DTD_01-2026_VC_ejemplo.xlsm` como referencia

---

**Recuerda:** Este validador verifica el cumplimiento de la **Norma Técnica PO-06-2025**.  
Todos los pasos validados corresponden a la metodología oficial del MinEduc.
