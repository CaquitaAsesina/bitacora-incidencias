let currentPage = 1;
const modalIncidencia = new bootstrap.Modal(document.getElementById('modalIncidencia'));

document.addEventListener('DOMContentLoaded', async () => {
  const me = await checkAuth();
  if (!me) return;

  // Mostrar/ocultar botón nueva incidencia según permiso
  if (hasPermission('CREAR_INCIDENCIA')) {
    document.getElementById('btnNuevaIncidencia').style.display = 'inline-block';
  }

  document.getElementById('btnNuevaIncidencia').addEventListener('click', () => {
    document.getElementById('formIncidencia').reset();
    modalIncidencia.show();
  });

  document.getElementById('btnGuardarIncidencia').addEventListener('click', guardarIncidencia);
  document.getElementById('btnFiltrar').addEventListener('click', () => {
    currentPage = 1;
    cargarIncidencias();
  });
  document.getElementById('btnLimpiar').addEventListener('click', limpiarFiltros);

  await cargarIncidencias();
});

async function cargarIncidencias() {
  const params = new URLSearchParams();
  params.append('page', currentPage);
  params.append('limit', 10);

  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const tipoCentro = document.getElementById('filtroTipoCentro').value;
  const estado = document.getElementById('filtroEstado').value;
  const usuarioId = document.getElementById('filtroUsuarioId').value;
  const respTexto = document.getElementById('filtroRespTexto').value;
  const centro = document.getElementById('filtroCentro').value;
  const sistema = document.getElementById('filtroSistema').value;
  const incidencia = document.getElementById('filtroIncidencia').value;
  const q = document.getElementById('filtroQ').value;

  if (desde) params.append('fecha_desde', desde);
  if (hasta) params.append('fecha_hasta', hasta);
  if (tipoCentro) params.append('tipo_centro', tipoCentro);
  if (estado) params.append('estado', estado);
  if (usuarioId) params.append('usuario_id', usuarioId);
  if (respTexto) params.append('responsable_texto', respTexto);
  if (centro) params.append('centro', centro);
  if (sistema) params.append('sistema', sistema);
  if (incidencia) params.append('incidencia', incidencia);
  if (q) params.append('q', q);

  const res = await apiRequest(`/incidencias?${params.toString()}`);
  if (res.ok) {
    renderTabla(res.data);
    renderPaginacion(res.pagination);
  }
}

function renderTabla(incidencias) {
  const tbody = document.getElementById('tablaIncidenciasBody');
  tbody.innerHTML = '';

  if (incidencias.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" class="text-center">No hay incidencias</td></tr>';
    return;
  }

  incidencias.forEach(inc => {
    const tr = document.createElement('tr');
    const estado = inc.hora_fin === null ? 'Abierta' : 'Cerrada';
    const badge = inc.hora_fin === null ? 'bg-danger' : 'bg-success';
    
    tr.innerHTML = `
      <td>${inc.id}</td>
      <td>${inc.ticket}</td>
      <td>${formatDate(inc.fecha)}</td>
      <td>${inc.tipo_centro}</td>
      <td>${inc.centro}</td>
      <td>${inc.sistema}</td>
      <td>${inc.incidencia}</td>
      <td>${inc.responsable_actual_nombre || inc.usuario_id}</td>
      <td>${inc.responsable}</td>
      <td><span class="badge ${badge}">${estado}</span></td>
      <td>${inc.hora_inicio}</td>
      <td>${inc.hora_fin || '-'}</td>
      <td>${inc.tiempo_solucion || '-'}</td>
      <td>
        ${inc.hora_fin === null && hasPermission('MODIFICAR_INCIDENCIA') ? `<button class="btn btn-sm btn-success" onclick="cerrarIncidencia(${inc.id})"><i class="bi bi-check2"></i> Cerrar</button>` : ''}
        ${hasPermission('ELIMINAR_INCIDENCIA') ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarIncidencia(${inc.id})"><i class="bi bi-trash"></i> Eliminar</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPaginacion(pagination) {
  const ul = document.getElementById('paginacion');
  ul.innerHTML = '';
  
  for (let i = 1; i <= pagination.totalPages; i++) {
    const li = document.createElement('li');
    li.className = `page-item ${i === pagination.page ? 'active' : ''}`;
    li.innerHTML = `<a class="page-link" href="#" onclick="cambiarPagina(${i})">${i}</a>`;
    ul.appendChild(li);
  }
}

window.cambiarPagina = (page) => {
  currentPage = page;
  cargarIncidencias();
};

async function guardarIncidencia() {
  const data = {
    tipo_centro: document.getElementById('tipoCentro').value,
    centro: document.getElementById('centro').value,
    sistema: document.getElementById('sistema').value,
    incidencia: document.getElementById('incidencia').value,
    ticket: document.getElementById('ticket').value,
    responsable: document.getElementById('responsable').value,
    descripcion: document.getElementById('descripcion').value,
  };

  const res = await apiRequest('/incidencias', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (res.ok) {
    showToast('Incidencia creada correctamente', 'success');
    modalIncidencia.hide();
    await cargarIncidencias();
  } else {
    showToast(res.mensaje || 'Error al crear incidencia', 'error');
  }
}

window.cerrarIncidencia = async (id) => {
  if (!confirm('¿Cerrar esta incidencia?')) return;
  
  const res = await apiRequest(`/incidencias/${id}/cerrar`, {
    method: 'PATCH',
  });

  if (res.ok) {
    showToast('Incidencia cerrada correctamente', 'success');
    await cargarIncidencias();
  } else {
    showToast(res.mensaje || 'Error al cerrar incidencia', 'error');
  }
};

window.eliminarIncidencia = async (id) => {
  if (!confirm('¿Eliminar esta incidencia?')) return;
  
  const res = await apiRequest(`/incidencias/${id}`, {
    method: 'DELETE',
  });

  if (res.ok) {
    showToast('Incidencia eliminada correctamente', 'success');
    await cargarIncidencias();
  } else {
    showToast(res.mensaje || 'Error al eliminar incidencia', 'error');
  }
};

function limpiarFiltros() {
  document.getElementById('filtroDesde').value = '';
  document.getElementById('filtroHasta').value = '';
  document.getElementById('filtroTipoCentro').value = '';
  document.getElementById('filtroEstado').value = '';
  document.getElementById('filtroUsuarioId').value = '';
  document.getElementById('filtroRespTexto').value = '';
  document.getElementById('filtroCentro').value = '';
  document.getElementById('filtroSistema').value = '';
  document.getElementById('filtroIncidencia').value = '';
  document.getElementById('filtroQ').value = '';
  currentPage = 1;
  cargarIncidencias();
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES');
}
