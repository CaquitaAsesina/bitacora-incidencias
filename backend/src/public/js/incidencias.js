/**
 * =====================================================================
 * js/incidencias.js — Bitácora de incidencias (incidencias.html)
 * =====================================================================
 * Listado con filtros y paginación, alta, detalle, edición/cierre y borrado,
 * más el autocompletado de campos con valores ya registrados.
 *
 * Los botones de fila llaman funciones globales (window.*) porque se generan
 * como HTML con onclick.
 * Para extender: añade el campo/filtro en incidencias.html y su lectura aquí.
 * =====================================================================
 */
let currentPage = 1;
const modalIncidencia = new bootstrap.Modal(document.getElementById('modalIncidencia'));
const modalDetalle = new bootstrap.Modal(document.getElementById('modalDetalleIncidencia'));
const modalEditar = new bootstrap.Modal(document.getElementById('modalEditarIncidencia'));
let incidenciaEnDetalle = null;

// Campos del modal Nueva y del modal Modificar que comparten sugerencias
const CAMPOS_SUGERIDOS = [
  { inputId: 'centro', campo: 'centro' },
  { inputId: 'sistema', campo: 'sistema' },
  { inputId: 'incidencia', campo: 'incidencia' },
  { inputId: 'responsable', campo: 'responsable' },
  { inputId: 'editarCentro', campo: 'centro' },
  { inputId: 'editarSistema', campo: 'sistema' },
  { inputId: 'editarIncidencia', campo: 'incidencia' },
  { inputId: 'editarResponsable', campo: 'responsable' },
];

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

  CAMPOS_SUGERIDOS.forEach(({ inputId, campo }) => adjuntarSugerencias(inputId, campo));

  await cargarSugerencias();
  await cargarIncidencias();
});

// Valores sugeridos por campo, cargados del backend
let sugerencias = { centro: [], sistema: [], incidencia: [], responsable: [] };

/** Recarga los valores sugeridos desde el backend. */
async function cargarSugerencias() {
  const res = await apiRequest('/incidencias/valores-sugeridos');
  if (res.ok) sugerencias = res.data;
}

/**
 * Envuelve un input en un desplegable de sugerencias con X para quitar valores.
 * Se hace a mano porque las opciones nativas de <datalist> no admiten botones.
 */
function adjuntarSugerencias(inputId, campo) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const wrap = document.createElement('div');
  wrap.className = 'sugerencias-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const lista = document.createElement('div');
  lista.className = 'sugerencias-lista';
  wrap.appendChild(lista);

  const cerrar = () => lista.classList.remove('mostrar');

  const pintar = () => {
    const texto = input.value.trim().toLowerCase();
    const coincidencias = (sugerencias[campo] || [])
      .filter((v) => !texto || v.toLowerCase().includes(texto));

    lista.innerHTML = '';

    if (coincidencias.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'sugerencias-vacio';
      vacio.textContent = texto ? 'Sin coincidencias' : 'Sin valores registrados';
      lista.appendChild(vacio);
    } else {
      coincidencias.forEach((valor) => {
        const item = document.createElement('div');
        item.className = 'sugerencias-item';

        const textoItem = document.createElement('span');
        textoItem.className = 'sugerencias-texto';
        textoItem.textContent = valor;
        textoItem.addEventListener('click', () => {
          input.value = valor;
          cerrar();
          input.focus();
        });

        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'sugerencias-borrar';
        borrar.title = `Quitar "${valor}" de las sugerencias`;
        borrar.textContent = '×';
        borrar.addEventListener('click', (e) => {
          e.stopPropagation();
          // Solo se oculta de las sugerencias actuales (sin persistir en BD).
          // Si el valor se vuelve a registrar en una incidencia, reaparece al
          // recargar las sugerencias.
          sugerencias[campo] = (sugerencias[campo] || []).filter((v) => v !== valor);
          pintar();
        });

        item.appendChild(textoItem);
        item.appendChild(borrar);
        lista.appendChild(item);
      });
    }

    lista.classList.add('mostrar');
  };

  input.addEventListener('focus', pintar);
  input.addEventListener('input', pintar);
  input.addEventListener('blur', () => setTimeout(cerrar, 150));
}

/** Carga la página actual de incidencias aplicando los filtros del formulario. */
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

/** Pinta las filas de la tabla de incidencias. */
function renderTabla(incidencias) {
  const tbody = document.getElementById('tablaIncidenciasBody');
  tbody.innerHTML = '';

  if (incidencias.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4">No hay incidencias</td></tr>';
    return;
  }

  incidencias.forEach(inc => {
    const abierta = inc.hora_fin === null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inc.id}</td>
      <td class="fw-semibold">${inc.ticket}</td>
      <td>${formatDate(inc.fecha)}</td>
      <td>${inc.hora_inicio || '-'}</td>
      <td>${inc.hora_fin || '-'}</td>
      <td>${inc.centro}</td>
      <td>${inc.sistema}</td>
      <td>${inc.incidencia}</td>
      <td>${inc.responsable}</td>
      <td><span class="badge ${abierta ? 'bg-danger' : 'bg-success'}">${abierta ? 'Abierta' : 'Cerrada'}</span></td>
      <td>${inc.tiempo_solucion || '-'}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-primary" onclick="verIncidencia(${inc.id})" title="Ver detalle">
          <i class="bi bi-eye"></i> Ver
        </button>
        ${hasPermission('MODIFICAR_INCIDENCIA') ? `<button class="btn btn-sm btn-warning ms-1" onclick="abrirEditarIncidencia(${inc.id})" title="Modificar">
          <i class="bi bi-pencil"></i>
        </button>` : ''}
        ${hasPermission('ELIMINAR_INCIDENCIA') ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarIncidencia(${inc.id})" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/** Pinta el paginador a partir de { page, totalPages }. */
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

/** Crea una incidencia con los datos del modal de alta. */
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
    await cargarSugerencias();
    await cargarIncidencias();
  } else {
    showToast(res.mensaje || 'Error al crear incidencia', 'error');
  }
}

window.eliminarIncidencia = async (id) => {
  // uiConfirmar() (js/ui.js) es el equivalente visual del confirm() nativo.
  if (!(await uiConfirmar('¿Eliminar esta incidencia?'))) return;
  
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

/** Limpia los filtros y recarga la primera página. */
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

// ---------- Ver detalle ----------

window.verIncidencia = async function (id) {
  const res = await apiRequest(`/incidencias/${id}`);
  if (!res.ok) {
    showToast(res.mensaje || 'No se pudo cargar la incidencia', 'error');
    return;
  }

  incidenciaEnDetalle = res.data;
  const inc = res.data;
  const abierta = inc.hora_fin === null;

  document.getElementById('detalleTicket').textContent = inc.ticket;
  const badge = document.getElementById('detalleEstado');
  badge.textContent = abierta ? 'ABIERTA' : 'CERRADA';
  badge.className = `badge fs-6 ${abierta ? 'bg-danger' : 'bg-success'}`;

  document.getElementById('detalleDatos').innerHTML = [
    ['Tipo de centro', inc.tipo_centro],
    ['Centro', inc.centro],
    ['Sistema', inc.sistema],
    ['Incidencia', inc.incidencia],
    ['Responsable', inc.responsable],
    ['Registrado por', inc.responsable_actual_nombre || '-'],
  ].map(([k, v]) => `
      <div class="col-md-4">
        <div class="text-muted small text-uppercase">${k}</div>
        <div class="fw-semibold">${escaparHtml(v)}</div>
      </div>`).join('');

  document.getElementById('detalleTiempos').innerHTML = [
    ['Fecha', formatDate(inc.fecha)],
    ['Hora de inicio', inc.hora_inicio || '-'],
    ['Hora de fin', inc.hora_fin || '-'],
    ['Tiempo de solución', inc.tiempo_solucion || '-'],
    ['Creado', formatDateTime(inc.creado_en)],
    ['Última actualización', formatDateTime(inc.actualizado_en)],
  ].map(([k, v]) => `
      <div class="col-md-4">
        <div class="text-muted small text-uppercase">${k}</div>
        <div class="fw-semibold">${escaparHtml(v)}</div>
      </div>`).join('');

  document.getElementById('detalleDescripcion').textContent = inc.descripcion || '-';
  document.getElementById('btnDetalleEditar').style.display = hasPermission('MODIFICAR_INCIDENCIA') ? '' : 'none';

  modalDetalle.show();
};

document.getElementById('btnDetalleEditar').addEventListener('click', () => {
  if (!incidenciaEnDetalle) return;
  const id = incidenciaEnDetalle.id;
  modalDetalle.hide();
  abrirEditarIncidencia(id);
});

// ---------- Modificar ----------

window.abrirEditarIncidencia = async function (id) {
  const res = await apiRequest(`/incidencias/${id}`);
  if (!res.ok) {
    showToast(res.mensaje || 'No se pudo cargar la incidencia', 'error');
    return;
  }

  const inc = res.data;
  document.getElementById('editarId').value = inc.id;
  document.getElementById('editarTipoCentro').value = inc.tipo_centro;
  document.getElementById('editarTicket').value = inc.ticket;
  document.getElementById('editarCentro').value = inc.centro;
  document.getElementById('editarSistema').value = inc.sistema;
  document.getElementById('editarIncidencia').value = inc.incidencia;
  document.getElementById('editarResponsable').value = inc.responsable;
  document.getElementById('editarDescripcion').value = inc.descripcion;
  document.getElementById('editarHoraFin').value = '';

  const cerrada = inc.hora_fin !== null;
  document.getElementById('editarCerrarCampos').style.display = cerrada ? 'none' : '';
  document.getElementById('editarCerrarAviso').style.display = cerrada ? 'block' : 'none';
  if (cerrada) {
    document.getElementById('editarCerrarAviso').textContent =
      `Esta incidencia ya está cerrada (${formatDate(inc.fecha)} ${inc.hora_fin}). No se puede volver a cerrar.`;
  }

  modalEditar.show();
};

document.getElementById('btnGuardarEditarIncidencia').addEventListener('click', async () => {
  const id = document.getElementById('editarId').value;
  const horaFin = document.getElementById('editarHoraFin').value;
  const camposVisibles = document.getElementById('editarCerrarCampos').style.display !== 'none';

  const body = {
    tipo_centro: document.getElementById('editarTipoCentro').value,
    ticket: document.getElementById('editarTicket').value,
    centro: document.getElementById('editarCentro').value,
    sistema: document.getElementById('editarSistema').value,
    incidencia: document.getElementById('editarIncidencia').value,
    responsable: document.getElementById('editarResponsable').value,
    descripcion: document.getElementById('editarDescripcion').value,
  };

  if (camposVisibles) {
    body.cerrar = true;
    if (horaFin) body.hora_fin = `${horaFin}:00`;
  }

  const res = await apiRequest(`/incidencias/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const cerrada = res.data.hora_fin !== null;
    showToast(cerrada ? 'Incidencia actualizada y cerrada' : 'Incidencia actualizada', 'success');
    modalEditar.hide();
    await cargarIncidencias();
  } else {
    showToast(res.mensaje || 'Error al actualizar la incidencia', 'error');
  }
});

// ---------- helpers ----------

/** Escapa texto para insertarlo seguro en HTML. */
function escaparHtml(valor) {
  const div = document.createElement('div');
  div.textContent = valor === null || valor === undefined ? '' : valor;
  return div.innerHTML;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('es-ES');
}
