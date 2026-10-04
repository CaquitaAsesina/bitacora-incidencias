import pool from '../config/db.js';

/**
 * MÓDULO DASHBOARD
 * 
 * NOTAS:
 * - Top responsables agrupa por usuario_id (JOIN usuarios para mostrar nombre + apellido)
 * - No usa el campo responsable (VARCHAR) para este cálculo
 * - Usa índices existentes: idx_incidencias_fecha, idx_incidencias_centro, idx_incidencias_sistema
 */

export async function obtenerKPIs() {
  // Total incidencias
  const [totalRows] = await pool.query('SELECT COUNT(*) as total FROM incidencias');
  const total = totalRows[0].total || 0;

  // Abiertas
  const [abiertasRows] = await pool.query('SELECT COUNT(*) as abiertas FROM incidencias WHERE hora_fin IS NULL');
  const abiertas = abiertasRows[0].abiertas || 0;

  // Cerradas
  const cerradas = total - abiertas;

  // Tiempo promedio de resolución (en segundos, luego convertir a HH:MM:SS)
  const [promRows] = await pool.query(
    'SELECT AVG(TIME_TO_SEC(tiempo_solucion)) as promedio_segundos FROM incidencias WHERE hora_fin IS NOT NULL AND tiempo_solucion IS NOT NULL'
  );
  let promedioSegundos = promRows[0].promedio_segundos || 0;
  if (isNaN(promedioSegundos)) promedioSegundos = 0;
  const promedioHHMMSS = segundosAHHMMSS(Math.floor(promedioSegundos));

  // Incidencias hoy
  const [hoyRows] = await pool.query('SELECT COUNT(*) as hoy FROM incidencias WHERE fecha = CURDATE()');
  const hoy = hoyRows[0].hoy || 0;

  // Tasa de resolución
  const tasaResolucion = total === 0 ? 0 : ((cerradas / total) * 100).toFixed(2);

  return {
    total,
    abiertas,
    cerradas,
    tiempo_promedio_resolucion: promedioHHMMSS,
    incidencias_hoy: hoy,
    tasa_resolucion: parseFloat(tasaResolucion),
  };
}

function segundosAHHMMSS(segundos) {
  if (segundos < 0) segundos = 0;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const segs = segundos % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
}

export async function incidenciasPorDia(dias = 30) {
  const [rows] = await pool.query(
    `SELECT 
       fecha,
       COUNT(*) as creadas,
       SUM(CASE WHEN hora_fin IS NOT NULL THEN 1 ELSE 0 END) as cerradas
     FROM incidencias
     WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY fecha
     ORDER BY fecha ASC`,
    [parseInt(dias)]
  );

  return rows.map((row) => ({
    fecha: row.fecha,
    creadas: row.creadas,
    cerradas: row.cerradas,
  }));
}

export async function porSistema() {
  const [rows] = await pool.query(
    `SELECT sistema, COUNT(*) as total
     FROM incidencias
     GROUP BY sistema
     ORDER BY total DESC
     LIMIT 10`
  );
  return rows;
}

export async function porTipoCentro() {
  const [rows] = await pool.query(
    `SELECT tipo_centro, COUNT(*) as total
     FROM incidencias
     GROUP BY tipo_centro
     ORDER BY total DESC`
  );
  return rows;
}

export async function porCentro() {
  const [rows] = await pool.query(
    `SELECT 
       centro,
       COUNT(*) as total,
       SUM(CASE WHEN hora_fin IS NULL THEN 1 ELSE 0 END) as abiertas,
       SUM(CASE WHEN hora_fin IS NOT NULL THEN 1 ELSE 0 END) as cerradas
     FROM incidencias
     GROUP BY centro
     ORDER BY total DESC`
  );
  return rows;
}

export async function porTipoIncidencia() {
  const [rows] = await pool.query(
    `SELECT incidencia, COUNT(*) as total
     FROM incidencias
     GROUP BY incidencia
     ORDER BY total DESC`
  );
  return rows;
}

export async function porResponsable() {
  // Top responsables: agrupa por usuario_id, JOIN usuarios
  const [rows] = await pool.query(
    `SELECT 
       i.usuario_id,
       CONCAT(u.nombre, ' ', u.apellido) as nombre_responsable,
       COUNT(*) as total
     FROM incidencias i
     INNER JOIN usuarios u ON u.id = i.usuario_id
     GROUP BY i.usuario_id, u.nombre, u.apellido
     ORDER BY total DESC
     LIMIT 10`
  );
  return rows;
}

export async function heatmap() {
  const [rows] = await pool.query(
    `SELECT 
       DAYOFWEEK(fecha) as dia_semana,  -- 1=Domingo, 2=Lunes...
       HOUR(hora_inicio) as hora,
       COUNT(*) as total
     FROM incidencias
     GROUP BY DAYOFWEEK(fecha), HOUR(hora_inicio)`
  );
  return rows;
}

export default {
  obtenerKPIs,
  incidenciasPorDia,
  porSistema,
  porTipoCentro,
  porCentro,
  porTipoIncidencia,
  porResponsable,
  heatmap,
};
