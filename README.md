# PO-App v7 (GitHub Pages)

## ¿Qué hace?

1. **Valida una plantilla PO (.xlsm/.xlsx)** siguiendo la lógica de la Matriz DTD (estructura de hojas + campos obligatorios) y genera un **reporte de inconsistencias**:
   - Hojas obligatorias presentes.
   - **Nómina**: AMIE, cédulas (10 dígitos), FUNxIE, “Está en la IE”.
   - **Par_PO**: Grado/Curso, Jornada, Paralelo, Nro. estudiantes (entero ≥ 0), y alerta para BT/BTP sin especialidad.
   - **DIS_TRA**: docentes con carga horaria (sumatoria > 0), valores numéricos no negativos, alertas por totales altos.

2. Mantiene utilidades existentes:
   - **Cálculo general** de Plantilla Óptima (Inicial / EGB-BGU).
   - Comparativo **LOEI anterior vs reformada** (períodos pedagógicos → horas reloj).
   - Validación de **figuras profesionales** (00086 → 00065 + equivalencias).

> Nota: SheetJS (XLSX) **no calcula fórmulas**. El validador se enfoca en **datos ingresados** y en estructura.

---

## Uso rápido

1. Abrir `index.html` (o desplegar en GitHub Pages).
2. En **“Cargar plantilla PO (.xlsm) y validar”**:
   - Seleccionar archivo.
   - Clic **“Validar y generar reporte”**.
   - Descargar **PDF** o **JSON**.

---

## Ajustes típicos

- Si cambias nombres de hojas/cabeceras: el validador lo marcará **CRÍTICO**.
- Si una IE agrega docentes manualmente: asegúrate de completar **FUNxIE**, **Está en la IE**, y en **Observación** indicar “Docente remitido por la IE”.

---

## Estructura

- `index.html` UI
- `styles.css` estilos
- `config.js` catálogos/constantes
- `app.js` lógica (validador + PDF)

