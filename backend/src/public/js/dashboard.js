let charts = {};

async function cargarKPIs() {
  const container = document.getElementById('kpisContainer');
  container.innerHTML = `
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card skeleton" style="height: 100px;"></div>
    </div>
  `.repeat(6);

  const res = await apiRequest('/dashboard/kpis');
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
        <i class="bi bi-clock fs-3 text-primary"></i>
        <h3 class="mt-2 mb-0">${kpis.tiempo_promedio_resolucion}</h3>
        <small class="text-muted">Promedio Resolución</small>
      </div>
    </div>
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-calendar-day fs-3 text-danger"></i>
        <h3 class="mt-2 mb-0">${kpis.incidencias_hoy}</h3>
        <small class="text-muted">Hoy</small>
      </div>
    </div>
    <div class="col-md-4 col-lg-2">
      <div class="card kpi-card text-center p-3">
        <i class="bi bi-percent fs-3 text-info"></i>
        <h3 class="mt-2 mb-0">${kpis.tasa_resolucion}%</h3>
        <small class="text-muted">Tasa Resolución</small>
      </div>
    </div>
  `;
}

async function cargarGraficos() {
  const fechaDesde = document.getElementById('fechaDesde')?.value || '';
  const fechaHasta = document.getElementById('fechaHasta')?.value || '';
  const tipoCentro = document.getElementById('filtroTipoCentro')?.value || '';

  // Destruir gráficos existentes
  Object.values(charts).forEach(c => c.destroy());

  // Incidencias por día
  const resPorDia = await apiRequest('/dashboard/por-dia?dias=30');
  if (resPorDia.ok) {
    const ctx = document.getElementById('chartPorDia').getContext('2d');
    charts.porDia = new Chart(ctx, {
      type: 'line',
      data: {
        labels: resPorDia.data.map(d => d.fecha),
        datasets: [
          {
            label: 'Creadas',
            data: resPorDia.data.map(d => d.creadas),
            borderColor: '#DC2626',
            backgroundColor: 'rgba(220,38,38,0.1)',
            fill: true,
          },
          {
            label: 'Cerradas',
            data: resPorDia.data.map(d => d.cerradas),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,0.1)',
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
      },
    });
  }

  // Por sistema
  const resPorSistema = await apiRequest('/dashboard/por-sistema');
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
  const resPorTipoCentro = await apiRequest('/dashboard/por-tipo-centro');
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
      },
    });
  }

  // Por centro
  const resPorCentro = await apiRequest('/dashboard/por-centro');
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
  const resPorTipoIncidencia = await apiRequest('/dashboard/por-tipo-incidencia');
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

  // Por responsable
  const resPorResponsable = await apiRequest('/dashboard/por-responsable');
  if (resPorResponsable.ok) {
    const ctx = document.getElementById('chartPorResponsable').getContext('2d');
    charts.porResponsable = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: resPorResponsable.data.map(d => d.nombre_responsable),
        datasets: [
          {
            label: 'Incidencias Atendidas',
            data: resPorResponsable.data.map(d => d.total),
            backgroundColor: '#DC2626',
          },
        ],
      },
      options: {
        responsive: true,
      },
    });
  }
}

async function cargarTodo() {
  await cargarKPIs();
  await cargarGraficos();
}

document.addEventListener('DOMContentLoaded', () => {
  cargarTodo();
  document.getElementById('btnFiltrar')?.addEventListener('click', cargarTodo);
});
