# 📊 PO-App v18 - Plantilla Óptima y Necesidad Docente

Sistema de validación automática de plantillas educativas con generación de reportes PDF/JSON. Compatible con GitHub Pages y entornos institucionales sin CDN.

## 🚀 Características v18 (NUEVAS)

### ✅ Validación Completa
- **Lectura de archivos Excel** (.xlsx, .xlsm)
- **Validación automática** de hojas: Nómina, Par_PO, DIS_TRA, Param
- **Detección de inconsistencias** con severidad (errores críticos y advertencias)
- **Estado visual** con badges de estado

### 📄 Generación de Reportes
- **Exportación PDF** con jsPDF y autoTable
- **Exportación JSON** estructurado
- **Reporte detallado** con timestamp, nombre de archivo y lista de issues
- **Tabla interactiva** de inconsistencias con resaltado por severidad

### 🎨 Interfaz Mejorada
- **UI moderna** con tema oscuro profesional
- **Feedback visual** claro (success, warning, error states)
- **Responsive design** optimizado para móviles
- **Animaciones sutiles** para mejor UX

### 🔧 Funcionalidades Adicionales
- **Calculadora de plantilla óptima** (Inicial y EGB/BGU)
- **Tabla comparativa LOEI** (anterior vs reformada)
- **Validador de figuras profesionales** con catálogo
- **Sistema de diagnóstico** para debugging

## 📦 Instalación

### Opción 1: GitHub Pages (Recomendado)

1. **Hacer fork** de este repositorio
2. **Ir a Settings** → Pages
3. **Source**: Deploy from branch `main`
4. **Folder**: `/docs` o `/root` según tu estructura
5. Esperar 1-2 minutos y acceder a: `https://tu-usuario.github.io/PO_App_v18/`

### Opción 2: Local

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/PO_App_v18.git
cd PO_App_v18

# Abrir con un servidor local (Python)
python3 -m http.server 8000

# O con Node.js
npx serve .

# Acceder a http://localhost:8000
```

## 🗂️ Estructura del Proyecto

```
PO_App_v18/
├── index.html          # Página principal
├── app.js              # Lógica de validación y reportes
├── config.js           # Configuración de versión
├── styles.css          # Estilos modernos
├── vendor/             # Librerías locales (sin CDN)
│   ├── xlsx.full.min.js
│   ├── jspdf.umd.min.js
│   └── jspdf.plugin.autotable.min.js
├── docs/               # Carpeta para GitHub Pages (copia de archivos)
└── README.md           # Este archivo
```

## 📝 Uso

### 1. Cargar Archivo Excel
- Haz clic en "Examinar" y selecciona tu archivo `.xlsx` o `.xlsm`
- El sistema detectará automáticamente las hojas

### 2. Validar
- Presiona **"Validar y generar reporte"**
- El sistema analizará:
  - ✅ Hoja **Nómina**: Identificadores y estructura
  - ✅ Hoja **Par_PO**: Valores numéricos en paralelos
  - ✅ Hoja **DIS_TRA**: Validación de horas
  - ✅ Hoja **Param**: Parámetros críticos

### 3. Revisar Resultados
- **Estado general**: VALIDADO / VALIDADO CON ADVERTENCIAS / ERRORES CRÍTICOS
- **Tabla de issues**: Lista detallada con severidad, hoja y fila
- **Resumen**: Contador de errores y advertencias

### 4. Descargar Reporte
- **PDF**: Documento profesional con tabla de issues
- **JSON**: Datos estructurados para integración con otros sistemas

## 🔍 Sistema de Diagnóstico

Si el botón "Validar" no funciona:

1. Presiona **"Diagnóstico"**
2. Verifica que aparezcan:
   - ✅ `XLSX: Cargado`
   - ✅ `jsPDF: Cargado`
3. Si alguna librería falta, revisa la carpeta `vendor/`

## 🛠️ Calculadora de Plantilla Óptima

### Nivel Inicial (3-4 años)
- **Fórmula**: 1 docente por paralelo
- Ingresa el número de paralelos
- Resultado: docentes requeridos

### EGB/BGU
- **Fórmula**: `(Paralelos × Carga horaria) / Períodos semanales`
- Ingresa: paralelos, carga horaria semanal
- Períodos semanales: 25 (LOEI reformada)

## 📊 Comparativo LOEI

Visualiza las diferencias entre:
- **LOEI anterior**: 30 períodos pedagógicos
- **LOEI reformada**: 25 períodos pedagógicos

Mantiene 40 horas reloj semanales en ambos casos.

## ⚙️ Configuración Avanzada

### Modificar Catálogo de Figuras Profesionales

Edita en `app.js` las variables:
```javascript
const catalogo00065 = [
  "ADMINISTRACION DE SISTEMAS",
  "CONTABILIDAD Y AUDITORIA",
  // Agregar más...
];

const equivalencias = {
  "ADMINISTRACION DE SISTEMAS": "TECNOLOGÍAS DE LA INFORMACIÓN"
};
```

### Cambiar Parámetros de Validación

En `app.js`, modifica las funciones:
- `validateNomina(data)`
- `validateParPO(data)`
- `validateDisTra(data)`
- `validateParam(data)`

## 🐛 Solución de Problemas

### El botón "Validar" no responde
- ✅ Verifica que hayas seleccionado un archivo
- ✅ Usa el botón "Diagnóstico" para verificar librerías
- ✅ Revisa la consola del navegador (F12) para errores

### El archivo no se carga
- ✅ Asegúrate de que sea `.xlsx` o `.xlsm`
- ✅ Verifica que el archivo no esté corrupto
- ✅ Intenta con un archivo de prueba más pequeño

### GitHub Pages no actualiza
- ✅ Limpia caché del navegador (Ctrl+Shift+R)
- ✅ Espera 1-2 minutos tras hacer push
- ✅ Verifica que los archivos estén en la carpeta correcta (`/docs` o root)

## 🚀 Próximas Mejoras (v19)

- [ ] Exportación a Excel modificado
- [ ] Historial de validaciones
- [ ] Comparación entre versiones de archivos
- [ ] Integración con APIs institucionales
- [ ] Modo offline con Service Workers
- [ ] Validación de múltiples archivos simultáneos
- [ ] Gráficos de tendencias

## 📄 Licencia

MIT License - Libre para uso educativo e institucional

## 👨‍💻 Autor

Desarrollado para optimizar la gestión de plantillas docentes en instituciones educativas de Ecuador.

---

**Versión**: 18.0.0  
**Última actualización**: Marzo 2026  
**Modo**: Institucional (sin CDN)  
**Compatibilidad**: GitHub Pages, navegadores modernos
