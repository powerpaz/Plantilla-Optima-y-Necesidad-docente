# 🎓 PO-App v19 - Validador Oficial MinEduc Ecuador

**Sistema de validación de Plantilla Óptima según Norma Técnica 06-2025**  
Ministerio de Educación del Ecuador

## 📋 Descripción

Aplicación web para validar archivos de Matriz DTD (Distributivo de Trabajo Docente) conforme a la **Norma Técnica de Plantilla Óptima de docentes, directivos y otros profesionales de la educación** en instituciones educativas fiscales y fiscomisionales.

### ✅ Características Principales

- **Validación automática** de 11 pasos de la metodología oficial
- **Verificación de coherencia** entre hojas (AMIE, Nómina, Par_PO, DIS_TRA)
- **Cumplimiento LOEI reformada** (25 períodos pedagógicos semanales)
- **Reportes profesionales** en PDF y JSON
- **Sin dependencias externas** (modo institucional sin CDN)
- **Interfaz intuitiva** con feedback visual claro

## 🔍 Validaciones Implementadas

### Paso 1-2: Código AMIE
- ✅ Verifica que el código AMIE esté presente
- ✅ Valida que el código esté seleccionado (no sea 0)
- ✅ Aplica a hojas: Nómina, Par_PO, DIS_TRA

### Paso 3: Nómina Docente
- ✅ Verifica que la tabla de nómina tenga encabezados válidos
- ✅ Detecta filas sin datos críticos (cédula, nombres)
- ✅ Valida estructura de la tabla

### Paso 4: Función en la IE (FUNxIE)
- ✅ Verifica que cada docente tenga asignada su función
- ✅ Detecta campos vacíos en FUNxIE
- ✅ Reporta como observación (warning)

### Paso 5: Estado "Esta en la IE"
- ✅ Valida que esté marcado Si/No para cada persona
- ✅ Detecta campos sin completar
- ✅ Reporta como observación (warning)

### Paso 8-9: Información Par_PO
- ❌ **ERROR si falta:** AMIE, Nombre IE, Modalidad, Tipo Educación, Año Lectivo, Categoría
- ⚠️ **WARNING si falta:** Información de paralelos

### Paso 11: Distributivo de Trabajo (DIS_TRA)
- ✅ Valida que las horas totales sean numéricas
- ⚠️ **WARNING:** Si excede 25 horas pedagógicas (LOEI reformada)
- ✅ Detecta errores en formato de datos

### Coherencia General
- ❌ **ERROR CRÍTICO:** Si el AMIE es diferente entre hojas
- ✅ Valida consistencia de datos institucionales

## 📁 Estructura de Archivos Requerida

La Matriz DTD debe contener las siguientes hojas:

```
Matriz_DTD.xlsm
├── Pasos          → Flujo de trabajo (11 pasos)
├── Nómina         → Personal docente y administrativo
├── Par_PO         → Paralelos y plantilla óptima
├── DIS_TRA        → Distributivo de trabajo docente
├── Param          → Parámetros del sistema (opcional)
└── PlanEstudio    → Plan de estudios (opcional)
```

### Hoja "Nómina" - Estructura esperada:

```
Fila 5:  AMIE: [código]
Fila 6:  Institución Educativa: [nombre]
...
Fila 16: [Encabezados] Nro. | Test_CH | FUN_HOM | FUNxIE | Esta en la IE | ...
Fila 17+: [Datos de personal]
```

### Hoja "Par_PO" - Campos obligatorios:

```
- AMIE
- NOMBRE DE LA IE
- MODALIDAD
- TIPO DE EDUCACIÓN
- AÑO LECTIVO
- CATEGORÍA
- Información de paralelos por nivel
```

### Hoja "DIS_TRA" - Estructura esperada:

```
Encabezados: Nro. | Nómina | Función | Nivel/Subnivel | Asignaturas | Tot_General
Datos: Distribución horaria (máx 25 períodos pedagógicos)
```

## 🚀 Instalación y Uso

### Opción 1: Uso Online (GitHub Pages)

1. Accede a: `https://TU-USUARIO.github.io/PO-App-v19/`
2. Selecciona tu archivo Matriz DTD (.xlsm o .xlsx)
3. Haz clic en "Validar Matriz DTD"
4. Revisa el reporte de validación
5. Descarga el reporte en PDF o JSON

### Opción 2: Uso Local

```bash
# Clonar repositorio
git clone https://github.com/TU-USUARIO/PO-App-v19.git
cd PO-App-v19

# Abrir con servidor local
python3 -m http.server 8000

# O con Node.js
npx serve .

# Acceder a http://localhost:8000
```

## 📊 Interpretación de Resultados

### Estado de Validación

| Estado | Significado |
|--------|------------|
| ✅ **VALIDADO** | Sin errores críticos ni observaciones |
| ✓ **VALIDADO CON OBSERVACIONES** | Sin errores pero hay warnings |
| ⚠️ **ERRORES CRÍTICOS** | Hay errores que deben corregirse |

### Severidad de Issues

- **❌ ERROR:** Incumplimiento crítico que debe corregirse obligatoriamente
- **⚠️ WARNING:** Observación que se recomienda revisar

## 📄 Exportación de Reportes

### PDF
- Formato profesional para presentación oficial
- Incluye tabla de inconsistencias
- Metadata completa (fecha, archivo, estado)
- Logo y branding MinEduc

### JSON
- Formato estructurado para integración con sistemas
- Datos completos de validación
- Ideal para procesamiento automático

## 🛠️ Despliegue en GitHub Pages

```bash
# 1. Crear repositorio en GitHub
# 2. Subir archivos
git init
git add .
git commit -m "feat: PO-App v19 validador MinEduc Ecuador"
git remote add origin https://github.com/TU-USUARIO/PO-App-v19.git
git push -u origin main

# 3. Activar GitHub Pages
# Settings → Pages → Source: main → Folder: root
```

## 📞 Soporte Técnico

### Problemas Comunes

**El botón "Validar" no funciona:**
- Usa el botón "Diagnóstico" para verificar librerías
- Asegúrate de que el archivo sea .xlsx o .xlsm
- Verifica la consola del navegador (F12)

**El archivo no se valida:**
- Verifica que contenga las hojas requeridas
- Asegúrate de que el formato sea compatible (Excel 2007+)
- Revisa que los nombres de las hojas sean exactos

**Los resultados parecen incorrectos:**
- Verifica que la estructura del archivo coincida con la Matriz DTD oficial
- Revisa que los encabezados sean los correctos
- Consulta la documentación de la Norma Técnica

## 📖 Referencias

- **Norma Técnica:** PO-06-2025 (Borrador)
- **Ministerio:** Educación del Ecuador
- **LOEI Reformada:** 25 períodos pedagógicos semanales
- **Archivo ejemplo:** `Matriz_DTD_01-2026_VC_ejemplo.xlsm`

## 🔒 Privacidad y Seguridad

- ✅ **Sin conexión a internet:** Toda la validación se realiza localmente en el navegador
- ✅ **Sin envío de datos:** Los archivos no se cargan a ningún servidor
- ✅ **Privacidad garantizada:** Los datos permanecen en tu computadora

## 📝 Licencia

Sistema oficial para uso del Ministerio de Educación del Ecuador y sus distritos.

---

**Versión:** 19.0.0  
**Última actualización:** Marzo 2026  
**Compatibilidad:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+  
**Modo:** Institucional (sin CDN) · Totalmente offline
