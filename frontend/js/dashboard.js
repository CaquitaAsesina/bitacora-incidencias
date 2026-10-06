/**
 * =====================================================================
 * js/dashboard.js — Dashboard analítico (dashboard.html)
 * =====================================================================
 * Tarjetas KPI + gráficos Chart.js. Todo el módulo requiere VER_DASHBOARD:
 * el guard de acceso está en DOMContentLoaded.
 *
 * ALINEADO CON EL BACKEND:
 *   - Ya no existe `por-tipo-centro`: ese gráfico se sustituyó por el de
 *     ESTADO (abiertas/cerradas), que se resuelve por el índice de hora_fin.
 *   - Los endpoints de dimensión devuelven la etiqueta en `etiqueta`, no en
 *     `sistema`/`centro`/`incidencia`. Ver dashboardService.js.
 *   - Hay dos rankings distintos y NO intercambiables: `/por-responsable` es
 *     el responsable de negocio (texto libre) y `/por-autor` es el usuario del
 *     sistema que registró la fila (auditoría `creado_por`).
 *   - Los desplegables de filtro se llenan desde `/dashboard/metadatos`, así
 *     que el frontend no duplica catálogos ni losHypotetiza.
 *
 * Flujo: cargarTodo() -> KPIs + todos los gráficos + serie temporal.
 * Para agregar un gráfico: crea su canvas en dashboard.html, añade aquí la
 * función de carga y llámala desde cargarTodo().
 * =====================================================================
 */
let charts = {};

/**
 * Arma el query string con TODOS los filtros activos del panel.
 * @returns {string} query string con los filtros activos, o ''.
 */
function queryFiltros() {
  const params = new URLSearchParams();

  const campos = {
    fecha_desde: 'fechaDesde',
    fecha_hasta: 'fechaHasta',
    centro: 'filtroCentro',
    sistema: 'filtroSistema',
    incidencia: 'filtroIncidencia',
    responsable: 'filtroResponsable',
    estado: 'filtroEstado',
    creado_por: 'filtroCreadoPor',
  };

  for (const [param, id] of Object.entries(campos)) {
    const valor = document.getElementById(id)?.value || '';
    if (valor) params.set(param, valor);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Rellena los desplegables con los valores que existen de verdad en la base.
 * Se llama una vez por carga: son valores pequeño y no cambian entre filtros.
 */
async function cargarMetadatos() {
  const res = await apiRequest('/dashboard/metadatos');
  if (!res.ok) return;

  const meta = res.data;

  const opciones = {
    filtroCentro: meta.centros,
    filtroSistema: meta.sistemas,
    filtroIncidencia: meta.incidencias,
    filtroResponsable: meta.responsables,
  };

  for (const [id, valores] of Object.entries(opciones)) {
    const select = document.getElementById(id);
    if (!select) continue;
    const previo = select.value;
    select.innerHTML =
      '<option value="">Todos</option>' +
      (valores || [])
        .map((v) => `<option value="${escaparHtml(v)}">${escaparHtml(v)}</option>`)
        .join('');
    // Conserva el filtro activo si el valor sigue existiendo.
    if (previo && (valores || []).includes(previo)) select.value = previo;
  }

  const selectAutor = document.getElementById('filtroCreadoPor');
  if (selectAutor) {
    const previo = selectAutor.value;
    selectAutor.innerHTML =
      '<option value="">Todos</option>' +
      (meta.usuarios || [])
        .map((u) => {
          const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ') || u.usuario;
          return `<option value="${u.id}">${escaparHtml(nombre)}${u.habilitado ? '' : ' (bloqueado)'}</option>`;
        })
        .join('');
    if (previo && (meta.usuarios || []).some((u) => String(u.id) === String(previo))) {
      selectAutor.value = previo;
    }
  }

}

/** Carga y pinta las tarjetas KPI (esqueleto de carga incluido). */
async function cargarKPIs() {
  const container = document.getElementById('kpisContainer');
  container.innerHTML = `
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card skeleton" style="height: 100px;"></div>
    </div>
  `.repeat(8);

  const res = await apiRequest(`/dashboard/kpis${queryFiltros()}`);
  if (!res.ok) {
    container.innerHTML = '<div class="col-12">Error al cargar KPIs</div>';
    return;
  }

  const kpis = res.data;

  const tarjeta = (icono, color, valor, etiqueta, titulo) => `
    <div class="col-md-4 col-lg-3">
      <div class="card kpi-card text-center p-3" title="${titulo}">
        <i class="bi ${icono} fs-3 text-${color}"></i>
        <h3 class="mt-2 mb-0">${valor}</h3>
        <small class="text-muted">${etiqueta}</small>
      </div>
    </div>
  `;

  container.innerHTML = [
    tarjeta('bi-journal-text', 'danger', kpis.total, 'Total', 'Incidencias que cumplen los filtros'),
    tarjeta('bi-exclamation-circle', 'warning', kpis.abiertas, 'Abiertas', 'Sin hora de fin'),
    tarjeta('bi-check-circle', 'success', kpis.cerradas, 'Cerradas', 'Con hora de fin registrada'),
    tarjeta('bi-percent', 'info', `${kpis.tasa_resolucion}%`, 'Tasa resolución', 'Cerradas sobre el total'),
    tarjeta(
      'bi-stopwatch',
      'secondary',
      kpis.tiempo_promedio_resolucion,
      'Tiempo medio',
      `Media de tiempo_solucion (HH:MM:SS) = ${kpis.tiempo_promedio_minutos} min`
    ),
    tarjeta('bi-trophy', 'dark', kpis.tiempo_maximo_resolucion, 'Tiempo máximo', 'Mayor tiempo_solucion registrado'),
    tarjeta('bi-calendar-day', 'primary', kpis.incidencias_hoy, 'Registradas hoy', 'Incidencias con fecha de hoy'),
    tarjeta(
      'bi-diagram-3-fill',
      'primary',
      kpis.centros,
      'Centros',
      `Sistemas distintos: ${kpis.sistemas} · Tipos: ${kpis.tipos_incidencia} · Autores: ${kpis.autores}`
    ),
  ].join('');
}

/**
 * Carga todos los gráficos de barras/dona/línea.
 *
 * Rendimiento: las 4 consultas son independientes, así que van en un solo
 * Promise.all (una espera de red en lugar de 4 viajes en serie).
 */
async function cargarGraficos() {
  const f = queryFiltros();

  // Destruir gráficos existentes: Chart.js no admite repintar sobre el mismo
  // canvas mientras el anterior sigue vivo.
  Object.values(charts).forEach((c) => c.destroy());
  charts = {};

  const [
    resPorDia,
    resPorSistema,
    resPorEstado,
    resPorCentro,
  ] = await Promise.all([
    apiRequest(`/dashboard/por-dia?dias=30${f ? '&' + f.slice(1) : ''}`),
    apiRequest(`/dashboard/por-sistema${f}`),
    apiRequest(`/dashboard/por-estado${f}`),
    apiRequest(`/dashboard/por-centro${f}`),
  ]);

  // Por día (creadas vs cerradas)
  if (resPorDia.ok) {
    charts.porDia = new Chart(document.getElementById('chartPorDia').getContext('2d'), {
      type: 'line',
      data: {
        labels: resPorDia.data.map((d) => d.fecha),
        datasets: [
          {
            label: 'Creadas',
            data: resPorDia.data.map((d) => d.creadas),
            borderColor: '#E63946',
            backgroundColor: 'rgba(230,57,70,0.10)',
            tension: 0.3,
            fill: true,
          },
          {
            label: 'Cerradas',
            data: resPorDia.data.map((d) => d.cerradas),
            borderColor: '#06A77D',
            backgroundColor: 'rgba(6,167,125,0.10)',
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // Por sistema (top 10)
  if (resPorSistema.ok) {
    charts.porSistema = new Chart(document.getElementById('chartPorSistema').getContext('2d'), {
      type: 'bar',
      data: {
        labels: resPorSistema.data.map((d) => d.etiqueta),
        datasets: [
          {
            label: 'Incidencias',
            data: resPorSistema.data.map((d) => d.total),
            backgroundColor: '#E63946',
          },
        ],
      },
      options: { responsive: true, indexAxis: 'y' },
    });
  }

  // Por estado (sustituye al antiguo "tipo de centro")
  if (resPorEstado.ok) {
    charts.porEstado = new Chart(document.getElementById('chartPorEstado').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: resPorEstado.data.map((d) => d.etiqueta),
        datasets: [
          {
            data: resPorEstado.data.map((d) => d.total),
            backgroundColor: ['#FFB703', '#06A77D'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.3,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  // Por centro (apiladas abiertas/cerradas)
  if (resPorCentro.ok) {
    charts.porCentro = new Chart(document.getElementById('chartPorCentro').getContext('2d'), {
      type: 'bar',
      data: {
        labels: resPorCentro.data.map((d) => d.etiqueta),
        datasets: [
          {
            label: 'Abiertas',
            data: resPorCentro.data.map((d) => d.abiertas),
            backgroundColor: '#FFB703',
          },
          {
            label: 'Cerradas',
            data: resPorCentro.data.map((d) => d.cerradas),
            backgroundColor: '#06A77D',
          },
        ],
      },
      options: {
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true } },
      },
    });
  }
}

/**
 * Formatea minutos como 'X.X min' o 'Xh Ym'.
 * @param {number|string|null} valor
 * @returns {string}
 */
function formatearMinutos(valor) {
  if (valor === null || valor === undefined) return '-';
  const m = Number(valor);
  if (Number.isNaN(m)) return '-';
  if (m < 60) return `${m.toFixed(1)} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return `${h}h ${rest}m`;
}

/** Carga el gráfico de línea de tiempo de solución por ticket. */
async function cargarGraficoTiempoSolucion() {
  const filtrosTiempo = new URLSearchParams({ limite: 30 });
  for (const [k, v] of new URLSearchParams(queryFiltros())) filtrosTiempo.set(k, v);

  const res = await apiRequest(`/dashboard/por-tiempo-solucion?${filtrosTiempo.toString()}`);

  const badgeProm = document.getElementById('tiempoPromedio');
  const badgeMin = document.getElementById('tiempoMinimo');
  const badgeMax = document.getElementById('tiempoMaximo');
  const canvas = document.getElementById('chartTiempoSolucion');
  const aviso = document.getElementById('sinTiempoSolucion');

  if (!res.ok) {
    canvas.style.display = 'none';
    aviso.style.display = 'block';
    return;
  }

  const { series, estadisticas } = res.data;

  badgeProm.textContent = `Prom: ${formatearMinutos(Number(estadisticas.promedio_min))}`;
  badgeMin.textContent = `Mín: ${formatearMinutos(Number(estadisticas.minimo_min))}`;
  badgeMax.textContent = `Máx: ${formatearMinutos(Number(estadisticas.maximo_min))}`;

  if (series.length === 0) {
    canvas.style.display = 'none';
    aviso.style.display = 'block';
    return;
  }

  canvas.style.display = '';
  aviso.style.display = 'none';

  const puntoMasLento = series.reduce((max, s) =>
    Number(s.minutos) > Number(max.minutos) ? s : max
  );

  charts.tiempoSolucion = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.map((s) => s.ticket),
      datasets: [
        {
          label: 'Tiempo de solución (min)',
          data: series.map((s) => Number(s.minutos)),
          borderColor: '#E63946',
          backgroundColor: 'rgba(230,57,70,0.08)',
          pointBackgroundColor: series.map((s) =>
            s.id === puntoMasLento.id ? '#E63946' : '#2A9D8F'
          ),
          pointRadius: series.map((s) => (s.id === puntoMasLento.id ? 9 : 5)),
          pointHoverRadius: 9,
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            title: (items) => `Ticket ${items[0].label}`,
            label: (item) => {
              const s = series[item.dataIndex];
              return [
                `Tiempo: ${formatearMinutos(item.parsed.y)}`,
                `Incidencia: ${s.incidencia}`,
                `Centro: ${s.centro}`,
                `Sistema: ${s.sistema}`,
                `Responsable: ${s.responsable}`,
              ];
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Minutos' } },
        x: {
          title: { display: true, text: 'Ticket' },
          ticks: { maxRotation: 60, minRotation: 45, autoSkip: false },
        },
      },
    },
  });

  canvas.setAttribute('title', 'Ticket más lento: ' + puntoMasLento.ticket);
}

let cargaEnCurso = false;

/** Orquesta la carga completa del dashboard evitando solapamientos. */
async function cargarTodo() {
  // Evita cargas solapadas: dos renders simultáneos dejan el canvas en uso y
  // Chart.js lanza error.
  if (cargaEnCurso) return;
  cargaEnCurso = true;

  try {
    // Rendimiento: las cuatro secciones son independientes -> en paralelo.
    // cargarGraficos() se invoca primero para que destruya los gráficos previos
    // antes de que las demás creen los suyos.
    await Promise.all([
      cargarMetadatos(),
      cargarGraficos(),
      cargarKPIs(),
      cargarGraficoTiempoSolucion(),
    ]);
  } finally {
    cargaEnCurso = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const userData = await checkAuth();
  if (!userData) return; // sin sesión: checkAuth ya redirige al login

  // El Dashboard solo es visible/accesible con VER_DASHBOARD
  if (!hasPermission(PERMISOS.DASHBOARD.VER)) {
    window.location.href = paginaInicio(userPermissions) || 'index.html';
    return;
  }

  cargarTodo();

  document.getElementById('btnFiltrar')?.addEventListener('click', cargarTodo);

  document.getElementById('btnLimpiar')?.addEventListener('click', () => {
    ['fechaDesde', 'fechaHasta', 'filtroCentro', 'filtroSistema', 'filtroIncidencia',
     'filtroResponsable', 'filtroEstado', 'filtroCreadoPor'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    cargarTodo();
  });

  ['fechaDesde', 'fechaHasta', 'filtroCentro', 'filtroSistema', 'filtroIncidencia',
   'filtroResponsable', 'filtroEstado', 'filtroCreadoPor'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', cargarTodo);
  });
});