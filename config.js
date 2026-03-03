// Configuración base (puedes editar y re-subir en GitHub Pages)
// Catálogo vigente (MINEDUC-MINEDUC-2024-00065-A) — Art. 4: 3 áreas, 11 familias, 34 figuras.
window.PO_CONFIG = {
  normaVigente: {
    codigo: "MINEDUC-MINEDUC-2024-00065-A",
    areas: [
      {
        area: "Deportes y salud",
        familias: [
          { familia: "Deportes", figuras: ["Actividad física, deporte y recreación", "Gestión deportiva y cultural"] },
          { familia: "Salud y servicio", figuras: ["Seguridad ciudadana", "Atención a la primera infancia", "Asistencia y cuidado a grupos prioritarios"] }
        ]
      },
      {
        area: "Artística",
        familias: [
          { familia: "Artes", figuras: ["Gestión cultural y artes plásticas", "Gestión cultural y artes escénicas", "Gestión cultural y música"] },
          { familia: "Diseño", figuras: ["Diseño de modas", "Diseño gráfico y multimedia"] }
        ]
      },
      {
        area: "Técnica",
        familias: [
          { familia: "Administrativa y financiera", figuras: ["Gestión financiera", "Gestión administrativa y logística"] },
          { familia: "Agropecuaria", figuras: ["Manejo de recursos hidrobiológicos", "Producción agropecuaria sostenible"] },
          { familia: "Ambiente", figuras: ["Gestión ambiental y desarrollo sostenible", "Conservación y manejo de áreas protegidas"] },
          { familia: "Construcción sostenible", figuras: ["Climatización", "Construcción de obra civil", "Estructuras y construcciones metálicas", "Instalaciones eléctricas"] },
          { familia: "Industrial", figuras: ["Electrónica", "Mecatrónica", "Fabricación en madera", "Electromecánica industrial", "Electromecánica automotriz", "Conservación y procesamiento de alimentos", "Producción de calzado"] },
          { familia: "Tecnologías", figuras: ["Seguridad Informática", "Redes y telecomunicaciones", "Ciencias de Datos", "Soporte informático", "Desarrollo de software"] },
          { familia: "Turismo", figuras: ["Hostelería y arte culinario", "Gestión turística"] }
        ]
      }
    ]
  },

  // Glosario mínimo (Art. 3)
  glosario: [
    {
      termino: "Área",
      definicion: "Campo amplio de conocimiento técnico vinculado a sectores productivos, económicos y sociales, para establecer familias profesionales pertinentes al territorio."
    },
    {
      termino: "Familia profesional",
      definicion: "Campo específico del conocimiento técnico que organiza procesos/productos/servicios en itinerarios formativos; orienta afinidad de competencias, cualificaciones comunes y traslado entre figuras relacionadas; facilita especialización y homologación."
    },
    {
      termino: "Figura profesional",
      definicion: "Campo detallado del conocimiento técnico que guía contenidos de aprendizaje en ámbitos productivos y de servicios, alineado al sector laboral y continuidad a educación superior."
    }
  ],

  // Heurísticas de lectura de Excel
  excel: {
    // Posibles nombres de hojas donde suele existir información clave
    sheetsPriority: ["Nómina", "Nomina", "NOMINA", "PAR_PO", "Par_PO", "PO", "PlantillaOptima", "NECESIDAD"],
    // Posibles encabezados donde suelen aparecer figuras/itinerarios
    figureHeaders: [
      "figura profesional", "figura", "oferta formativa", "especialidad", "especialidad técnica", "familia profesional"
    ]
  }
};
