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
    <div class="col-md-4 col-lg-3">
      <div class="card kpi-card skeleton" style="height: 100px;"></div>
    </div>
  `.repeat(4);

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
    tarjeta('bi-percent', 'info', `${kpis.tasa_resolucion}%`, 'Tasa resolución', 'Cerradas sobre el total'),
    tarjeta('bi-trophy', 'dark', kpis.tiempo_total_resolucion, 'Tiempo total', 'Suma de tiempo_solucion'),
    tarjeta('bi-calendar-day', 'primary', kpis.incidencias_hoy, 'Registradas hoy', 'Incidencias con fecha de hoy'),
  ].join('');
}

/**
 * Carga el gráfico de series por día (creadas vs cerradas).
 *
 * Rendimiento: es el único gráfico de cargarGraficos(); se mantiene el patrón
 * de destruir el Chart.js previo para evitar repintar sobre el mismo canvas.
 */
async function cargarGraficos() {
  const f = queryFiltros();

  // Destruir gráficos existentes: Chart.js no admite repintar sobre el mismo
  // canvas mientras el anterior sigue vivo.
  Object.values(charts).forEach((c) => c.destroy());
  charts = {};

  const resPorDia = await apiRequest(`/dashboard/por-dia?dias=30${f ? '&' + f.slice(1) : ''}`);

  // Por día (creadas vs cerradas)
  if (resPorDia.ok) {
    const contenedor = document.getElementById('innerPorDia');
    // Crece con los días: ancho mínimo fijo por punto para que el contenedor
    // despliegue la barra de scroll horizontal en lugar de comprimir la serie.
    ajustarScrollHorizontal(contenedor, resPorDia.data.length, 85);

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
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}

/**
 * Ajusta el ancho del contenedor del gráfico para que crezca con los puntos y
 * el padre (chart-scroll) muestre una barra de scroll horizontal.
 * @param {HTMLElement} contenedor el div .chart-scroll-inner que envuelve el canvas.
 * @param {number} cantidadPuntos cuántos puntos va a dibujar Chart.js.
 * @param {number} pxPorPunto ancho mínimo por punto (px) para que no se apisten las etiquetas.
 */
function ajustarScrollHorizontal(contenedor, cantidadPuntos, pxPorPunto) {
  if (!contenedor) return;
  const scroll = contenedor.closest('.chart-scroll');
  const base = scroll && scroll.clientWidth > 0 ? scroll.clientWidth : 600;
  contenedor.style.width = `${Math.max(base, cantidadPuntos * pxPorPunto)}px`;
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

  // Crece con los tickets: fija el ancho por ticket para habilitar el scroll
  // horizontal del contenedor en vez de comprimir la serie.
  ajustarScrollHorizontal(document.getElementById('innerTiempo'), series.length, 110);

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
      maintainAspectRatio: false,
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

  // Enter en un campo de filtro aplica la búsqueda (como pulsar el botón).
  ['fechaDesde', 'fechaHasta', 'filtroCentro', 'filtroSistema', 'filtroIncidencia',
   'filtroResponsable', 'filtroEstado', 'filtroCreadoPor'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnFiltrar')?.click();
      }
    });
  });

  ['fechaDesde', 'fechaHasta', 'filtroCentro', 'filtroSistema', 'filtroIncidencia',
   'filtroResponsable', 'filtroEstado', 'filtroCreadoPor'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', cargarTodo);
  });
});