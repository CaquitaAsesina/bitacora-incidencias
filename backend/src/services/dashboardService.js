/**
 * =====================================================================
 * services/dashboardService.js — Consultas del dashboard
 * =====================================================================
 * Cada función devuelve los datos de un gráfico/tarjeta del dashboard.
 * Todas aceptan el mismo juego de filtros (fecha_desde, fecha_hasta, centro,
 * sistema, incidencia, responsable, estado) para que los números de las
 * tarjetas y los de los gráficos siempre cuadren entre sí.
 *
 * ÍNDICES DEL SCHEMA Y CÓMO SE APROVECHAN (la columna `fecha` ya no existe:
 * el día del registro es `creado_en`, por eso todo agrupa por DATE(creado_en)):
 *   - idx_incidencias_creado_en          (creado_en)
 *       -> KPIs, series por día, tipo de incidencia y tiempo de solución.
 *   - idx_incidencias_centro_creado_en   (centro, creado_en)
 *       -> reporte por centro; sin rango de fechas MySQL recorre el índice en
 *          modo "loose index scan" y agrupa sin filesort.
 *   - idx_incidencias_sistema_creado_en  (sistema, creado_en) -> reporte por sistema.
 *   - idx_incidencias_responsable_creado_en (responsable, creado_en)
 *       -> reporte por responsable de negocio (texto libre).
 *   - idx_incidencias_hora_fin_creado_en (hora_fin, creado_en)
 *       -> abiertas/cerradas y series por día.
 *   - idx_incidencias_creado_por         (creado_por) -> ranking de autores.
 *
 * `tipo_centro` ya no existe en el schema: no hay gráfico ni endpoint de él.
 *
 * Para extender: agrega aquí la consulta y exponla en dashboardController.js.
 * =====================================================================
 */
import pool from '../config/db.js';

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filtros de fecha (fecha_desde / fecha_hasta) sobre DATE(creado_en).
 * Acepta YYYY-MM-DD; si el rango viene invertido se corrige intercambiando los
 * límites. Los límites llegan como fechas y se convierten a rangos de
 * timestamp para que un "hasta" incluya también los registros de ese día.
 * Devuelve { sql, params } con los "AND" que apliquen.
 */
function filtroFechas(filtros = {}) {
  const desde = REGEX_FECHA.test(String(filtros.fecha_desde || '').trim())
    ? String(filtros.fecha_desde).trim()
    : '';
  const hasta = REGEX_FECHA.test(String(filtros.fecha_hasta || '').trim())
    ? String(filtros.fecha_hasta).trim()
    : '';

  let sql = '';
  const params = [];

  if (desde && hasta) {
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    sql = ' AND creado_en >= ? AND creado_en < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(a, b);
  } else if (desde) {
    sql = ' AND creado_en >= ?';
    params.push(desde);
  } else if (hasta) {
    sql = ' AND creado_en < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(hasta);
  }

  return { sql, params };
}

/**
 * Filtros por dimensión. Son de igualdad EXACTA a propósito: cada una calza
 * con el prefijo de un índice compuesto (columna, creado_en). Con `=` el
 * planner puede usar el índice; con `LIKE '%x%'` no puede y acaba en filescan.
 * @param {string} alias prefijo de tabla ('i.' o '').
 */
function filtroDimensiones(filtros = {}, alias = '') {
  let sql = '';
  const params = [];

  for (const campo of ['centro', 'sistema', 'incidencia', 'responsable']) {
    const valor = filtros[campo] === null || filtros[campo] === undefined ? '' : String(filtros[campo]).trim();
    if (valor) {
      sql += ` AND ${alias}${campo} = ?`;
      params.push(valor);
    }
  }

  if (filtros.estado === 'abierta') {
    sql += ` AND ${alias}hora_fin IS NULL`;
  } else if (filtros.estado === 'cerrada') {
    sql += ` AND ${alias}hora_fin IS NOT NULL`;
  }

  const creadoPor = Number(filtros.creado_por);
  if (Number.isInteger(creadoPor) && creadoPor > 0) {
    sql += ` AND ${alias}creado_por = ?`;
    params.push(creadoPor);
  }

  return { sql, params };
}

/** Combina filtroFechas() + filtroDimensiones() en una sola línea de WHERE. */
function construirWhere(filtros = {}, alias = '') {
  const f = filtroFechas(filtros);
  const d = filtroDimensiones(filtros, alias);
  return { sql: f.sql + d.sql, params: [...f.params, ...d.params] };
}

/**
 * Tarjetas resumen del dashboard.
 * @param {object} filtros
 * @returns {Promise<object>} total, abiertas, cerradas, usuarios,
 *   tiempo_promedio_resolucion, incidencias_hoy, tiempo_promedio_minutos,
 *   tiempo_maximo, tasa_resolucion, centros, sistemas, autores.
 */
export async function obtenerKPIs(filtros) {
  const w = construirWhere(filtros, '');

  // Rendimiento: todos los contadores en UNA sola consulta con agregados
  // condicionales, en lugar de 4-5 consultas secuenciales. El conteo de
  // usuarios, autores y dimensiones son subconsultas de apoyo.
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(hora_fin IS NULL), 0) AS abiertas,
       AVG(CASE WHEN hora_fin IS NOT NULL AND tiempo_solucion IS NOT NULL
                THEN TIME_TO_SEC(tiempo_solucion) END) AS promedio_segundos,
       MAX(CASE WHEN tiempo_solucion IS NOT NULL
                THEN TIME_TO_SEC(tiempo_solucion) END) AS maximo_segundos,
       COALESCE(SUM(creado_en >= CURDATE()), 0) AS hoy,
       COUNT(DISTINCT centro)    AS centros,
       COUNT(DISTINCT sistema)   AS sistemas,
       COUNT(DISTINCT incidencia) AS tipos_incidencia,
       COUNT(DISTINCT creado_por) AS autores,
       (SELECT COUNT(*) FROM usuarios WHERE habilitado = TRUE) AS usuarios
     FROM incidencias WHERE 1=1${w.sql}`,
    w.params
  );

  const row = rows[0] || {};
  const total = Number(row.total) || 0;
  const abiertas = Number(row.abiertas) || 0;
  const cerradas = total - abiertas;

  const promedioSegundos = Math.max(Math.floor(Number(row.promedio_segundos) || 0), 0);
  const maximoSegundos = Math.max(Math.floor(Number(row.maximo_segundos) || 0), 0);

  return {
    total,
    abiertas,
    cerradas,
    usuarios: Number(row.usuarios) || 0,
    tiempo_promedio_resolucion: segundosAHHMMSS(promedioSegundos),
    tiempo_promedio_minutos: Number((promedioSegundos / 60).toFixed(2)),
    tiempo_maximo_resolucion: segundosAHHMMSS(maximoSegundos),
    incidencias_hoy: Number(row.hoy) || 0,
    tasa_resolucion: total === 0 ? 0 : Number(((cerradas / total) * 100).toFixed(2)),
    centros: Number(row.centros) || 0,
    sistemas: Number(row.sistemas) || 0,
    tipos_incidencia: Number(row.tipos_incidencia) || 0,
    autores: Number(row.autores) || 0,
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
 * Incidencias creadas/cerradas por día dentro del rango pedido.
 * Si no hay rango explícito se usa `creado_en >= CURDATE() - dias`.
 * El rango se apoya en el prefijo de idx_incidencias_creado_en.
 * @param {number|string} dias
 * @param {object} filtros
 */
export async function incidenciasPorDia(dias = 30, filtros = {}) {
  const { sql: where, params } = construirWhere(filtros);

  const usaRango =
    REGEX_FECHA.test(String(filtros.fecha_desde || '').trim()) ||
    REGEX_FECHA.test(String(filtros.fecha_hasta || '').trim());

  const [rows] = await pool.query(
    `SELECT
       DATE(creado_en) AS fecha,
       COUNT(*) AS creadas,
       SUM(hora_fin IS NOT NULL) AS cerradas,
       AVG(TIME_TO_SEC(tiempo_solucion)) AS promedio_segundos
     FROM incidencias
     WHERE 1=1${where}${usaRango ? '' : ' AND creado_en >= DATE_SUB(CURDATE(), INTERVAL ? DAY)'}
     GROUP BY DATE(creado_en)
     ORDER BY DATE(creado_en) ASC`,
    usaRango ? params : [...params, Math.max(parseInt(dias, 10) || 30, 1)]
  );

  return rows.map((row) => ({
    fecha: row.fecha,
    creadas: Number(row.creadas) || 0,
    cerradas: Number(row.cerradas) || 0,
    promedio_minutos: row.promedio_segundos === null
      ? null
      : Number((Number(row.promedio_segundos) / 60).toFixed(2)),
  }));
}

/** Top 10 sistemas con más incidencias (idx_incidencias_sistema_creado_en). */
export async function porSistema(filtros) {
  const { sql, params } = construirWhere(filtros);
  const [rows] = await pool.query(
    `SELECT sistema AS etiqueta, COUNT(*) AS total,
            SUM(hora_fin IS NULL) AS abiertas,
            SUM(hora_fin IS NOT NULL) AS cerradas
     FROM incidencias WHERE 1=1${sql}
     GROUP BY sistema
     ORDER BY total DESC, sistema ASC
     LIMIT 10`,
    params
  );
  return rows.map(normalizarNumeros);
}

/** Incidencias por centro, desglosadas en abiertas/cerradas. */
export async function porCentro(filtros) {
  const { sql, params } = construirWhere(filtros);
  const [rows] = await pool.query(
    `SELECT centro AS etiqueta, COUNT(*) AS total,
            SUM(hora_fin IS NULL) AS abiertas,
            SUM(hora_fin IS NOT NULL) AS cerradas
     FROM incidencias WHERE 1=1${sql}
     GROUP BY centro
     ORDER BY total DESC, centro ASC`,
    params
  );
  return rows.map(normalizarNumeros);
}

/** Incidencias por tipo de incidencia (segunda columna de idx_incidencias_incidencia_creado_en). */
export async function porTipoIncidencia(filtros) {
  const { sql, params } = construirWhere(filtros);
  const [rows] = await pool.query(
    `SELECT incidencia AS etiqueta, COUNT(*) AS total,
            SUM(hora_fin IS NULL) AS abiertas,
            SUM(hora_fin IS NOT NULL) AS cerradas
     FROM incidencias WHERE 1=1${sql}
     GROUP BY incidencia
     ORDER BY total DESC, incidencia ASC`,
    params
  );
  return rows.map(normalizarNumeros);
}

/**
 * Ranking de responsables de negocio (columna `responsable`, texto libre).
 * Usa el prefijo de idx_incidencias_responsable_creado_en.
 */
export async function porResponsable(filtros) {
  const { sql, params } = construirWhere(filtros);
  const [rows] = await pool.query(
    `SELECT responsable AS etiqueta, COUNT(*) AS total,
            SUM(hora_fin IS NULL) AS abiertas,
            SUM(hora_fin IS NOT NULL) AS cerradas,
            AVG(TIME_TO_SEC(tiempo_solucion)) AS promedio_segundos
     FROM incidencias WHERE 1=1${sql}
     GROUP BY responsable
     ORDER BY total DESC, responsable ASC
     LIMIT 10`,
    params
  );
  return rows.map((row) => ({
    ...normalizarNumeros(row),
    promedio_minutos: row.promedio_segundos === null
      ? null
      : Number((Number(row.promedio_segundos) / 60).toFixed(2)),
  }));
}

/**
 * Ranking de autores reales (`creado_por`), que es lo que el schema audita.
 * Agrupa por el índice idx_incidencias_creado_por y hace LEFT JOIN para no
 * perder la fila si el autor se borró.
 */
export async function porAutor(filtros) {
  const { sql, params } = construirWhere(filtros, 'i.');
  const [rows] = await pool.query(
    `SELECT i.creado_por AS id,
            COALESCE(u.usuario, CAST(i.creado_por AS CHAR)) AS usuario,
            CONCAT_WS(' ', u.nombre, u.apellido) AS nombre,
            COUNT(*) AS total,
            SUM(i.hora_fin IS NULL) AS abiertas,
            SUM(i.hora_fin IS NOT NULL) AS cerradas
     FROM incidencias i
     LEFT JOIN usuarios u ON u.id = i.creado_por
     WHERE 1=1${sql}
     GROUP BY i.creado_por, u.usuario, u.nombre, u.apellido
     ORDER BY total DESC, nombre ASC
     LIMIT 10`,
    params
  );
  return rows.map(normalizarNumeros);
}

/**
 * Estado global (abiertas vs cerradas). El predicado `hora_fin IS [NOT] NULL`
 * es el prefijo de idx_incidencias_hora_fin_creado_en: se resuelve por índice
 * en lugar de agregarse sobre todas las filas del rango.
 */
export async function porEstado(filtros) {
  const { sql, params } = construirWhere(filtros);
  const [rows] = await pool.query(
    `SELECT estado AS etiqueta, COUNT(*) AS total
     FROM (
       SELECT CASE WHEN hora_fin IS NULL THEN 'ABIERTA' ELSE 'CERRADA' END AS estado
       FROM incidencias WHERE 1=1${sql}
     ) AS t
     GROUP BY estado
     ORDER BY FIELD(estado, 'ABIERTA', 'CERRADA')`,
    params
  );
  return rows.map(normalizarNumeros);
}

/** Matriz día de la semana x hora con el conteo de incidencias. */
export async function heatmap(filtros = {}) {
  const { sql, params } = construirWhere(filtros);
  const [rows] = await pool.query(
    `SELECT DAYOFWEEK(creado_en) AS dia_semana,  -- 1=Domingo, 2=Lunes...
            HOUR(hora_inicio) AS hora,
            COUNT(*) AS total
     FROM incidencias WHERE 1=1${sql}
     GROUP BY DAYOFWEEK(creado_en), HOUR(hora_inicio)`,
    params
  );
  return rows.map(normalizarNumeros);
}

/**
 * Incidencias cerradas ordenadas por tiempo de solución.
 * Devuelve una fila por ticket con el tiempo en minutos para el gráfico de
 * líneas, más las estadísticas del conjunto.
 */
export async function porTiempoSolucion(limite = 30, filtros = {}) {
  const { sql, params } = construirWhere(filtros);
  const tope = Math.min(Math.max(parseInt(limite, 10) || 30, 1), 500);

  // Rendimiento: serie y estadísticas son independientes -> en paralelo.
  const [[rows], [stats]] = await Promise.all([
    pool.query(
      `SELECT
         i.id,
         i.ticket,
         i.incidencia,
         i.centro,
         i.sistema,
         i.responsable,
         DATE(i.creado_en) AS fecha,
         i.tiempo_solucion,
         TIME_TO_SEC(i.tiempo_solucion) / 60 AS minutos
       FROM incidencias i
       WHERE i.tiempo_solucion IS NOT NULL${sql}
       ORDER BY i.creado_en DESC, i.id DESC
       LIMIT ?`,
      [...params, tope]
    ),
    pool.query(
      `SELECT
         COUNT(*) AS total,
         AVG(TIME_TO_SEC(tiempo_solucion) / 60) AS promedio_min,
         MIN(TIME_TO_SEC(tiempo_solucion) / 60) AS minimo_min,
         MAX(TIME_TO_SEC(tiempo_solucion) / 60) AS maximo_min
       FROM incidencias
       WHERE tiempo_solucion IS NOT NULL${sql}`,
      params
    ),
  ]);

  return {
    series: rows.map((r) => ({ ...r, minutos: Number(r.minutos) })),
    estadisticas: {
      total: Number(stats[0].total) || 0,
      promedio_min: stats[0].promedio_min === null ? null : Number(stats[0].promedio_min),
      minimo_min: stats[0].minimo_min === null ? null : Number(stats[0].minimo_min),
      maximo_min: stats[0].maximo_min === null ? null : Number(stats[0].maximo_min),
    },
  };
}

/**
 * Metadatos del dashboard: los valores reales existentes en cada dimensión, la
 * lista de autores y el rango de fechas con datos. Sirve para que los
 * desplegables de filtro se llenen desde la base en vez de duplicar catálogos
 * a mano en el frontend.
 */
export async function obtenerMetadatos() {
  const [centros, sistemas, tipos, responsables, autores, rango] = await Promise.all([
    pool.query(
      `SELECT DISTINCT centro AS valor FROM incidencias
       WHERE centro IS NOT NULL AND TRIM(centro) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT sistema AS valor FROM incidencias
       WHERE sistema IS NOT NULL AND TRIM(sistema) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT incidencia AS valor FROM incidencias
       WHERE incidencia IS NOT NULL AND TRIM(incidencia) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT DISTINCT responsable AS valor FROM incidencias
       WHERE responsable IS NOT NULL AND TRIM(responsable) <> '' ORDER BY valor`
    ),
    pool.query(
      `SELECT id, usuario, nombre, apellido, email, telefono, habilitado
       FROM usuarios
       ORDER BY habilitado DESC, apellido, nombre`
    ),
    // MIN/MAX de DATE(creado_en) ya llegan como 'YYYY-MM-DD' porque el pool
    // usa dateStrings: ['DATE'], así que el frontend puede leerlos directo.
    pool.query('SELECT MIN(DATE(creado_en)) AS desde, MAX(DATE(creado_en)) AS hasta FROM incidencias'),
  ]);

  return {
    centros: centros[0].map((r) => r.valor),
    sistemas: sistemas[0].map((r) => r.valor),
    incidencias: tipos[0].map((r) => r.valor),
    responsables: responsables[0].map((r) => r.valor),
    usuarios: autores[0],
    rango_fechas: rango[0][0] || { desde: null, hasta: null },
  };
}

/** mysql2 devuelve los COUNT/SUM como number en decimal; se fuerzan a número. */
function normalizarNumeros(fila) {
  const salida = { ...fila };
  for (const clave of ['total', 'abiertas', 'cerradas', 'id']) {
    if (salida[clave] !== null && salida[clave] !== undefined) {
      salida[clave] = Number(salida[clave]);
    }
  }
  return salida;
}

export default {
  obtenerKPIs,
  incidenciasPorDia,
  porSistema,
  porCentro,
  porTipoIncidencia,
  porResponsable,
  porAutor,
  porEstado,
  heatmap,
  porTiempoSolucion,
  obtenerMetadatos,
};
