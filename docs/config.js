// PO-App v5 - configuración (ajustable)
// Puedes reemplazar estos arrays con catálogos oficiales completos (00065, 00086) y equivalencias.

window.PO_CONFIG = {
  envLabel: "Institucional (sin CDN)",
  // Fórmulas base (según imágenes oficiales compartidas)
  formulas: {
    inicial_docentes_por_paralelo: 1,
    egb_bgu_periodos_default: 25, // LOEI reformada
    horas_reloj_semanales: 40
  },

  // Jornada docente (comparativo)
  loei: {
    anterior: { periodos_pedagogicos: 30, acomp_periodos: 10, actividades_hrs_reloj_sem: 10 },
    reformada:{ periodos_pedagogicos: 25, acomp_periodos: 5,  actividades_hrs_reloj_sem: 10 }
  },

  // Catálogos (demo). Reemplazables por oficiales.
  catalogos: {
    vigente_2024_00065: [
      // demo (para que funcione). Sustituir por oficial completo.
      "DESARROLLO DE SOFTWARE",
      "REDES Y TELECOMUNICACIONES",
      "SOPORTE INFORMATICO",
      "CIENCIAS DE DATOS",
      "SEGURIDAD INFORMATICA"
    ],
    catalogo_2023_00086: [
      // demo
      "ADMINISTRACION DE SISTEMAS",
      "DESARROLLO DE SOFTWARE",
      "REDES Y TELECOMUNICACIONES"
    ],
    equivalencias: {
      // demo
      "ADMINISTRACION DE SISTEMAS": "DESARROLLO DE SOFTWARE"
    }
  }
};
