/**
 * =====================================================================
 * js/dashboard.js — Dashboard analítico (dashboard.html)
 * =====================================================================
 * Tarjetas KPI + gráficos Chart.js. Todo el módulo requiere VER_DASHBOARD:
 * el guard de acceso está en DOMContentLoaded.
 *
 * Flujo: cargarTodo() -> cargarKPIs() + cargarGraficos() + cargarGraficoTiempoSolucion().
 * Para agregar un gráfico: crea su canvas en dashboard.html, añade aquí la
 * función de carga y llámala desde cargarTodo().
 * =====================================================================
 */
let charts = {};

/** Carga y pinta las tarjetas KPI (esqueleto de carga incluido). */
async function cargarKPIs() {
  const container = document.getElementById('kpisContainer');
  container.innerHTML = `
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card skeleton" style="height: 100px;"></div>
    </div>
  `.repeat(5);

  const res = await apiRequest(`/dashboard/kpis${queryFiltros()}`);
  if (!res.ok) {
    container.innerHTML = '<div class="col-12">Error al cargar KPIs</div>';
    return;
  }

  const kpis = res.data;
  container.innerHTML = `
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-journal-text fs-3 text-danger"></i>
        <h3 class="mt-2 mb-0">${kpis.total}</h3>
        <small class="text-muted">Total</small>
      </div>
    </div>
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-exclamation-circle fs-3 text-warning"></i>
        <h3 class="mt-2 mb-0">${kpis.abiertas}</h3>
        <small class="text-muted">Abiertas</small>
      </div>
    </div>
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-check-circle fs-3 text-success"></i>
        <h3 class="mt-2 mb-0">${kpis.cerradas}</h3>
        <small class="text-muted">Cerradas</small>
      </div>
    </div>
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-percent fs-3 text-info"></i>
        <h3 class="mt-2 mb-0">${kpis.tasa_resolucion}%</h3>
        <small class="text-muted">Tasa Resolución</small>
      </div>
    </div>
        <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-people-fill fs-3 text-primary"></i>
        <h3 class="mt-2 mb-0">${kpis.usuarios ?? 0}</h3>
        <small class="text-muted">Usuarios</small>
      </div>
    </div>
  `;
}

/**
 * Arma el query string con los filtros de fecha activos (fecha_desde / fecha_hasta).
 * Devuelve string vacio si no hay ninguno, para no ensuciar las URLs.
 */
/**
 * @returns {string} query string con los filtros de fecha activos, o ''.
 */
function queryFiltros() {
  const desde = document.getElementById('fechaDesde')?.value || '';
  const hasta = document.getElementById('fechaHasta')?.value || '';
  const params = new URLSearchParams();
  if (desde) params.set('fecha_desde', desde);
  if (hasta) params.set('fecha_hasta', hasta);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Carga los gráficos de barras/dona (sistema, tipo de centro, centro, tipo). */
async function cargarGraficos() {
  const f = queryFiltros();

  // Destruir gráficos existentes
  Object.values(charts).forEach(c => c.destroy());

  // Por sistema
  const resPorSistema = await apiRequest(`/dashboard/por-sistema${f}`);
  if (resPorSistema.ok) {
    const ctx = document.getElementById('chartPorSistema').getContext('2d');
    charts.porSistema = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: resPorSistema.data.map(d => d.sistema),
        datasets: [
          {
            label: 'Incidencias',
            data: resPorSistema.data.map(d => d.total),
            backgroundColor: '#DC2626',
          },
        ],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
      },
    });
  }

  // Por tipo centro
  const resPorTipoCentro = await apiRequest(`/dashboard/por-tipo-centro${f}`);
  if (resPorTipoCentro.ok) {
    const ctx = document.getElementById('chartPorTipoCentro').getContext('2d');
    charts.porTipoCentro = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: resPorTipoCentro.data.map(d => d.tipo_centro),
        datasets: [
          {
            data: resPorTipoCentro.data.map(d => d.total),
            backgroundColor: ['#DC2626', '#3B82F6'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.3,
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });
  }

  // Por centro
  const resPorCentro = await apiRequest(`/dashboard/por-centro${f}`);
  if (resPorCentro.ok) {
    const ctx = document.getElementById('chartPorCentro').getContext('2d');
    charts.porCentro = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: resPorCentro.data.map(d => d.centro),
        datasets: [
          {
            label: 'Abiertas',
            data: resPorCentro.data.map(d => d.abiertas),
            backgroundColor: '#F59E0B',
          },
          {
            label: 'Cerradas',
            data: resPorCentro.data.map(d => d.cerradas),
            backgroundColor: '#10B981',
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
          },
        },
      },
    });
  }

  // Por tipo incidencia
  const resPorTipoIncidencia = await apiRequest(`/dashboard/por-tipo-incidencia${f}`);
  if (resPorTipoIncidencia.ok) {
    const ctx = document.getElementById('chartPorTipoIncidencia').getContext('2d');
    charts.porTipoIncidencia = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: resPorTipoIncidencia.data.slice(0, 10).map(d => d.incidencia),
        datasets: [
          {
            label: 'Incidencias',
            data: resPorTipoIncidencia.data.slice(0, 10).map(d => d.total),
            backgroundColor: '#3B82F6',
          },
        ],
      },
      options: {
        responsive: true,
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
  const fechas = new URLSearchParams(queryFiltros());
  for (const [k, v] of fechas) filtrosTiempo.set(k, v);
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

  const puntoMasLento = series.reduce((max, s) => (Number(s.minutos) > Number(max.minutos) ? s : max));

  charts.tiempoSolucion = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.map(s => s.ticket),
      datasets: [
        {
          label: 'Tiempo de solución (min)',
          data: series.map(s => Number(s.minutos)),
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220,38,38,0.08)',
          pointBackgroundColor: series.map(s =>
            s.id === puntoMasLento.id ? '#DC2626' : '#3B82F6'
          ),
          pointRadius: series.map(s => (s.id === puntoMasLento.id ? 9 : 5)),
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
            title: items => `Ticket ${items[0].label}`,
            label: item => {
              const s = series[item.dataIndex];
              return [
                `Tiempo: ${formatearMinutos(item.parsed.y)}`,
                `Incidencia: ${s.incidencia}`,
                `Centro: ${s.centro}`,
                `Sistema: ${s.sistema}`,
              ];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Minutos' },
        },
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
  // Evita cargas solapadas: dos renders simultaneos dejan el canvas en uso y Chart.js lanza error
  if (cargaEnCurso) return;
  cargaEnCurso = true;

  try {
    await cargarKPIs();
    await cargarGraficos();
    await cargarGraficoTiempoSolucion();
  } finally {
    cargaEnCurso = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const userData = await checkAuth();
  if (!userData) return; // sin sesión: checkAuth ya redirige al login

  // El Dashboard solo es visible/accesible con VER_DASHBOARD
  if (!hasPermission('VER_DASHBOARD')) {
    window.location.href = paginaInicio(userPermissions) || 'index.html';
    return;
  }

  cargarTodo();

  document.getElementById('btnFiltrar')?.addEventListener('click', () => {
    cargarTodo();
  });

  document.getElementById('btnLimpiar')?.addEventListener('click', () => {
    document.getElementById('fechaDesde').value = '';
    document.getElementById('fechaHasta').value = '';
    cargarTodo();
  });

  ['fechaDesde', 'fechaHasta'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', cargarTodo);
  });
});
