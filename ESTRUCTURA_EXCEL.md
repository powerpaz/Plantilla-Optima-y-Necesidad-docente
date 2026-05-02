# 📊 Estructura de Archivos Excel - PO-App v18

Este documento describe la estructura esperada de los archivos Excel (.xlsx / .xlsm) que PO-App puede validar.

## 📋 Hojas Requeridas

### 1. Hoja "Nómina"

**Propósito**: Lista de personal docente

**Estructura mínima**:
```
| Nómina        | Par_PO | DIS_TRA | Param |
|---------------|--------|---------|-------|
| Identificador | ...    | ...     | ...   |
| DOC001        | ...    | ...     | ...   |
| DOC002        | ...    | ...     | ...   |
```

**Validaciones**:
- ✅ Columna "Nómina" no debe estar vacía
- ✅ Cada fila debe tener un identificador único
- ⚠️ Se detectan filas vacías y se reportan como advertencia

---

### 2. Hoja "Par_PO"

**Propósito**: Paralelos y plantilla óptima

**Estructura mínima**:
```
| Nivel/Grado | Paralelos | Carga Horaria | ... |
|-------------|-----------|---------------|-----|
| Inicial 3   | 2         | 25            | ... |
| Inicial 4   | 3         | 25            | ... |
| 1ro EGB     | 4         | 30            | ... |
```

**Validaciones**:
- ✅ Columna "Paralelos" debe contener valores numéricos
- ❌ ERROR si hay texto en campos numéricos
- ✅ Se permiten decimales (ej: 2.5 paralelos)

---

### 3. Hoja "DIS_TRA"

**Propósito**: Distribución de trabajo docente

**Estructura mínima**:
```
| Docente | Asignatura      | Horas | Paralelo | ... |
|---------|-----------------|-------|----------|-----|
| DOC001  | Matemática      | 6     | 1ro A    | ... |
| DOC001  | Física          | 4     | 2do B    | ... |
| DOC002  | Lengua          | 5     | 3ro C    | ... |
```

**Validaciones**:
- ✅ Columna "Horas" debe ser numérica
- ❌ ERROR si hay valores no numéricos en horas
- ⚠️ Se advierte si la hoja está vacía

---

### 4. Hoja "Param"

**Propósito**: Parámetros del sistema

**Estructura mínima**:
```
| Parámetro              | Valor |
|------------------------|-------|
| PERIODOS_SEMANALES     | 25    |
| HORAS_RELOJ_PERIODO    | 0.8   |
| ACOMPAÑAMIENTO_HORAS   | 12.5  |
```

**Validaciones**:
- ✅ Debe existir "PERIODOS_SEMANALES"
- ❌ ERROR si falta este parámetro crítico
- ⚠️ Se advierte si la hoja no existe

---

### 5. Hoja "Pasos" (Opcional)

**Propósito**: Flujo de trabajo recomendado

**Estructura**:
```
| Paso | Descripción                           | Estado    |
|------|---------------------------------------|-----------|
| 1    | Revisar datos de nómina               | Pendiente |
| 2    | Validar paralelos                     | En proceso|
| 3    | Calcular plantilla óptima             | Completo  |
```

**Nota**: Esta hoja es opcional pero se recomienda para documentar el proceso.

---

## 🎯 Ejemplos de Validación

### ✅ Caso Válido
```
Archivo: plantilla_2024_marzo.xlsx
Hojas detectadas: Nómina, Par_PO, DIS_TRA, Param
Estado: VALIDADO
Errores: 0
Advertencias: 0
```

### ⚠️ Caso con Advertencias
```
Archivo: plantilla_incompleta.xlsx
Hojas detectadas: Nómina, Par_PO, DIS_TRA
Estado: VALIDADO CON ADVERTENCIAS
Errores: 0
Advertencias: 1
- WARNING: Hoja Param no existe
```

### ❌ Caso con Errores
```
Archivo: plantilla_erronea.xlsx
Hojas detectadas: Nómina, Par_PO, DIS_TRA, Param
Estado: ERRORES CRÍTICOS
Errores: 3
Advertencias: 1

Issues:
1. ERROR | Par_PO | Fila 5 | Valor no numérico en paralelos: "tres"
2. ERROR | DIS_TRA | Fila 12 | Horas no numéricas: "N/A"
3. ERROR | Param | Fila 0 | Falta parámetro PERIODOS_SEMANALES
4. WARNING | Nómina | Fila 8 | Fila sin identificador en columna Nómina
```

---

## 📂 Formatos Soportados

### ✅ Soportados
- `.xlsx` - Excel 2007+ (Office Open XML)
- `.xlsm` - Excel con macros habilitadas

### ❌ No Soportados
- `.xls` - Excel 97-2003 (formato binario antiguo)
- `.csv` - Valores separados por comas (usar solo para datos tabulares simples)
- `.ods` - OpenDocument Spreadsheet (LibreOffice/OpenOffice)

**Nota**: Para archivos `.xls`, conviértelos a `.xlsx` usando Excel:
1. Abrir archivo .xls
2. Archivo → Guardar como
3. Tipo: "Libro de Excel (*.xlsx)"

---

## 🔧 Recomendaciones

### Para mejores resultados:

1. **Usa nombres de hoja exactos**: "Nómina", "Par_PO", "DIS_TRA", "Param"
2. **Evita celdas combinadas** en áreas de datos
3. **No modifiques fórmulas** si las hay
4. **Usa formato numérico** para números (no texto)
5. **Elimina filas/columnas completamente vacías** innecesarias
6. **Mantén los encabezados** en la fila 1
7. **No uses colores o formato** como datos (solo visual)

### Errores comunes a evitar:

❌ Espacios extra en nombres de columnas  
❌ Texto en columnas numéricas (ej: "dos" en vez de 2)  
❌ Fórmulas rotas o referencias circulares  
❌ Hojas ocultas con datos críticos  
❌ Caracteres especiales en identificadores  

---

## 🧪 Probar tu Archivo

Antes de subir tu archivo a producción:

1. **Abre la app** en modo desarrollo
2. **Carga tu archivo** Excel
3. **Revisa el reporte** de validación
4. **Corrige los errores** críticos
5. **Evalúa las advertencias** (opcional, pero recomendado)
6. **Descarga el reporte** PDF/JSON para archivo

---

## 📞 Soporte

Si tu archivo tiene una estructura diferente y necesitas soporte personalizado:

1. Revisa el código en `app.js` - funciones `validate*`
2. Adapta las validaciones según tu estructura
3. Documenta los cambios en un fork del proyecto

---

**Última actualización**: 2026-03-05  
**Versión del documento**: 1.0
