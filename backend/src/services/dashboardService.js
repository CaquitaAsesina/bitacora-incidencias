/**
 * =====================================================================
 * services/dashboardService.js — Consultas del dashboard
 * =====================================================================
 * Cada función devuelve los datos de un gráfico/tarjeta del dashboard.
 * Los filtros de fecha (fecha_desde/fecha_hasta) se aplican con filtroFechas().
 *
 * Para extender: agrega aquí la consulta y exponla en dashboardController.js.
 * =====================================================================
 */
import pool from '../config/db.js';

/**
 * MÓDULO DASHBOARD
 * 
 * NOTAS:
 * - Top responsables agrupa por usuario_id (JOIN usuarios para mostrar nombre + apellido)
 * - No usa el campo responsable (VARCHAR) para este cálculo
 * - Usa índices existentes: idx_incidencias_fecha, idx_incidencias_centro, idx_incidencias_sistema
 */

/**
 * Construye el filtro de rango de fechas (fecha_desde / fecha_hasta) sobre la columna fecha.
 * Acepta formato YYYY-MM-DD. Si se envia un rango invertido, se corrige intercambiando los limites.
 * Devuelve { sql, params } donde sql ya incluye los "AND" que apliquen.
 */
function filtroFechas(filtros = {}) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;

  // Ignora valores con formato no ISO para no romper la consulta
  const desde = regex.test(String(filtros.fecha_desde || '').trim()) ? String(filtros.fecha_desde).trim() : '';
  const hasta = regex.test(String(filtros.fecha_hasta || '').trim()) ? String(filtros.fecha_hasta).trim() : '';

  let sql = '';
  const params = [];

  if (desde && hasta) {
    // Si el rango viene invertido, se corrige intercambiando los limites
    if (desde > hasta) {
      sql = ' AND fecha BETWEEN ? AND ?';
      params.push(hasta, desde);
    } else {
      sql = ' AND fecha BETWEEN ? AND ?';
      params.push(desde, hasta);
    }
  } else if (desde) {
    sql = ' AND fecha >= ?';
    params.push(desde);
  } else if (hasta) {
    sql = ' AND fecha <= ?';
    params.push(hasta);
  }

  return { sql, params };
}

/**
 * Tarjetas resumen del dashboard.
 * @param {{ fecha_desde?: string, fecha_hasta?: string }} filtros
 * @returns {Promise<object>} total, abiertas, cerradas, usuarios,
 *   tiempo_promedio_resolucion, incidencias_hoy y tasa_resolucion.
 */
export async function obtenerKPIs(filtros) {
  const f = filtroFechas(filtros);

  // Total incidencias
  const [totalRows] = await pool.query(`SELECT COUNT(*) as total FROM incidencias WHERE 1=1${f.sql}`, f.params);
  const total = totalRows[0].total || 0;

  // Abiertas
  const [abiertasRows] = await pool.query(
    `SELECT COUNT(*) as abiertas FROM incidencias WHERE hora_fin IS NULL${f.sql}`, f.params
  );
  const abiertas = abiertasRows[0].abiertas || 0;

  // Cerradas
  const cerradas = total - abiertas;

  // Usuarios registrados
  const [usuariosRows] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
  const usuarios = Number(usuariosRows[0].total) || 0;

  // Tiempo promedio de resolución (en segundos, luego convertir a HH:MM:SS)
  const [promRows] = await pool.query(
    `SELECT AVG(TIME_TO_SEC(tiempo_solucion)) as promedio_segundos FROM incidencias
     WHERE hora_fin IS NOT NULL AND tiempo_solucion IS NOT NULL${f.sql}`, f.params
  );
  let promedioSegundos = promRows[0].promedio_segundos || 0;
  if (isNaN(promedioSegundos)) promedioSegundos = 0;
  const promedioHHMMSS = segundosAHHMMSS(Math.floor(promedioSegundos));

  // Incidencias hoy
  const [hoyRows] = await pool.query(
    `SELECT COUNT(*) as hoy FROM incidencias WHERE fecha = CURDATE()${f.sql}`, f.params
  );
  const hoy = hoyRows[0].hoy || 0;

  // Tasa de resolución
  const tasaResolucion = total === 0 ? 0 : ((cerradas / total) * 100).toFixed(2);

  return {
    total,
    abiertas,
    cerradas,
    usuarios,
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

/**
 * Incidencias creadas/cerradas por día en los últimos `dias` días.
 * @param {number|string} dias
 */
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

/** Top 10 sistemas con más incidencias. */
export async function porSistema(filtros) {
  const f = filtroFechas(filtros);
  const [rows] = await pool.query(
    `SELECT sistema, COUNT(*) as total
     FROM incidencias WHERE 1=1${f.sql}
     GROUP BY sistema
     ORDER BY total DESC
     LIMIT 10`,
    f.params
  );
  return rows;
}

/** Distribución por tipo de centro (DISTRIBUCION/TRANSFERENCIA). */
export async function porTipoCentro(filtros) {
  const f = filtroFechas(filtros);
  const [rows] = await pool.query(
    `SELECT tipo_centro, COUNT(*) as total
     FROM incidencias WHERE 1=1${f.sql}
     GROUP BY tipo_centro
     ORDER BY total DESC`,
    f.params
  );
  return rows;
}

/** Incidencias por centro, desglosadas en abiertas/cerradas. */
export async function porCentro(filtros) {
  const f = filtroFechas(filtros);
  const [rows] = await pool.query(
    `SELECT 
       centro,
       COUNT(*) as total,
       SUM(CASE WHEN hora_fin IS NULL THEN 1 ELSE 0 END) as abiertas,
       SUM(CASE WHEN hora_fin IS NOT NULL THEN 1 ELSE 0 END) as cerradas
     FROM incidencias WHERE 1=1${f.sql}
     GROUP BY centro
     ORDER BY total DESC`,
    f.params
  );
  return rows;
}

/** Incidencias por tipo de incidencia. */
export async function porTipoIncidencia(filtros) {
  const f = filtroFechas(filtros);
  const [rows] = await pool.query(
    `SELECT incidencia, COUNT(*) as total
     FROM incidencias WHERE 1=1${f.sql}
     GROUP BY incidencia
     ORDER BY total DESC`,
    f.params
  );
  return rows;
}

/** Top 10 responsables agrupados por usuario_id (JOIN usuarios). */
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

/** Matriz día de la semana x hora con el conteo de incidencias. */
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

/**
 * Incidencias cerradas ordenadas por tiempo de solución.
 * Devuelve una fila por ticket con el tiempo en minutos para el gráfico de líneas.
 */
export async function porTiempoSolucion(limite = 30, filtros) {
  const f = filtroFechas(filtros);

  const [rows] = await pool.query(
    `SELECT 
       i.id,
       i.ticket,
       i.incidencia,
       i.centro,
       i.sistema,
       i.fecha,
       i.tiempo_solucion,
       TIME_TO_SEC(i.tiempo_solucion) / 60 as minutos
     FROM incidencias i
     WHERE i.hora_fin IS NOT NULL
       AND i.tiempo_solucion IS NOT NULL${f.sql}
     ORDER BY i.fecha DESC, i.id DESC
     LIMIT ?`,
    [...f.params, Number(limite)]
  );

  const [stats] = await pool.query(
    `SELECT
       COUNT(*) as total,
       AVG(TIME_TO_SEC(tiempo_solucion) / 60) as promedio_min,
       MIN(TIME_TO_SEC(tiempo_solucion) / 60) as minimo_min,
       MAX(TIME_TO_SEC(tiempo_solucion) / 60) as maximo_min
     FROM incidencias
     WHERE tiempo_solucion IS NOT NULL${f.sql}`,
    f.params
  );

  return { series: rows, estadisticas: stats[0] };
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
  porTiempoSolucion,
};
