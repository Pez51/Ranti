// Catálogo UCSM de pregrado (presencial y virtual), consultado en octubre de 2026.
// Fuentes: https://ucsm.edu.pe/cato-xp-2026-liderazgo-ucsm-educacion-superior/
// https://www2.ucsm.edu.pe/catoxp/nuestras-carreras/
// https://www2.ucsm.edu.pe/virtual/carreras-profesionales-ucsm-virtual/
// https://www2.ucsm.edu.pe/virtual/tasas-educativas/
// La API entrega y valida este mismo catálogo para evitar listas divergentes.
export const academicCatalog = Object.freeze([
  { faculty: 'Ciencias Contables y Financieras', careers: ['Contabilidad'] },
  { faculty: 'Ciencias Económico Administrativas', careers: [
    'Administración de Empresas', 'Administración y Gestión Pública',
    'Administración y Marketing', 'Administración y Negocios Internacionales',
    'Economía y Finanzas', 'Ingeniería Comercial', 'Marketing y Gestión Comercial',
  ] },
  { faculty: 'Ciencias Jurídicas y Políticas', careers: ['Ciencia Política y Gobierno', 'Derecho'] },
  { faculty: 'Ciencias Sociales y Humanidades', careers: [
    'Comunicación Social', 'Diseño Gráfico Publicitario', 'Educación Inicial',
    'Educación Primaria', 'Educación Secundaria', 'Marketing Digital', 'Psicología', 'Publicidad y Multimedia',
    'Teología', 'Trabajo Social', 'Turismo y Gastronomía', 'Turismo y Hotelería',
  ] },
  { faculty: 'Odontología', careers: ['Odontología'] },
  { faculty: 'Obstetricia y Puericultura', careers: ['Obstetricia y Puericultura'] },
  { faculty: 'Enfermería', careers: ['Enfermería'] },
  { faculty: 'Ciencias Farmacéuticas, Bioquímicas y Biotecnológicas', careers: [
    'Farmacia y Bioquímica', 'Ingeniería Biotecnológica',
  ] },
  { faculty: 'Medicina Humana', careers: ['Medicina Humana'] },
  { faculty: 'Ciencias e Ingenierías Físicas y Formales', careers: [
    'Ingeniería Biomédica', 'Ingeniería de Minas', 'Ingeniería de Sistemas',
    'Ingeniería de Seguridad Industrial y Minera', 'Ingeniería Electrónica',
    'Ingeniería en Inteligencia Artificial', 'Ingeniería Industrial',
    'Ingeniería Mecánica', 'Ingeniería Mecánica Eléctrica', 'Ingeniería Mecatrónica',
  ] },
  { faculty: 'Ciencias e Ingenierías Biológicas y Químicas', careers: [
    'Ingeniería Agronómica y Agrícola', 'Ingeniería de Industria Alimentaria',
    'Medicina Veterinaria y Zootecnia',
  ] },
  { faculty: 'Arquitectura e Ingeniería Civil y del Ambiente', careers: [
    'Arquitectura', 'Ingeniería Ambiental', 'Ingeniería Civil',
  ] },
]);

export function isAcademicSelection(faculty, career) {
  return academicCatalog.some(entry => entry.faculty === faculty && entry.careers.includes(career));
}
