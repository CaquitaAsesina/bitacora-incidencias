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
let incidenciaEdicionCerrada = false;

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
  if (hasPermission(PERMISOS.INCIDENCIAS.CREAR)) {
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

  // Rendimiento: sugerencias y listado son independientes -> en paralelo.
  await Promise.all([cargarSugerencias(), cargarIncidencias()]);
});

// Valores sugeridos por campo, cargados del backend
let sugerencias = { centro: [], sistema: [], incidencia: [], responsable: [] };

/** Reload de los valores sugeridos desde el backend. */
async function cargarSugerencias() {
  const res = await apiRequest('/incidencias/valores-sugeridos');
  if (res.ok) {
    sugerencias = res.data;
    pintarListasSugeridas();
  }
}

/**
 * Rellena los <datalist> de los filtros y el desplegable de autores.
 *
 * `criadores` viene del mismo endpoint: son los usuarios que han registrado al
 * menos una incidencia, resueltos con idx_incidencias_creado_por. Es lo que
 * sustituye al antiguo input numérico "usuario_id".
 */
function pintarListasSugeridas() {
  const listas = {
    listaCentros: sugerencias.centro || [],
    listaSistemas: sugerencias.sistema || [],
    listaIncidencias: sugerencias.incidencia || [],
    listaResponsables: sugerencias.responsable || [],
  };

  for (const [id, valores] of Object.entries(listas)) {
    const datalist = document.getElementById(id);
    if (!datalist) continue;
    datalist.innerHTML = valores
      .map((v) => `<option value="${escaparHtml(v)}"></option>`)
      .join('');
  }

  const selectAutores = document.getElementById('filtroCreadoPor');
  if (!selectAutores) return;

  const seleccionado = selectAutores.value;
  const autores = sugerencias.criadores || [];
  selectAutores.innerHTML =
    '<option value="">Todos</option>' +
    autores
      .map(
        (u) =>
          `<option value="${u.id}">${escaparHtml(
            [u.nombre, u.apellido].filter(Boolean).join(' ') || u.usuario
          )}${u.habilitado ? '' : ' (bloqueado)'}</option>`
      )
      .join('');

  // Conserva la selección si el usuario ya había filtrado por autor y sigue
  // existiendo en la lista.
  if (seleccionado && autores.some((u) => String(u.id) === String(seleccionado))) {
    selectAutores.value = seleccionado;
  }
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

  // Los filtros de dimensión viajan como igualdad exacta para que el backend
  // use los índices compuestos (columna, fecha); `q` es la única búsqueda
  // parcial y va aparte.
  const filtros = {
    fecha_desde: document.getElementById('filtroDesde').value,
    fecha_hasta: document.getElementById('filtroHasta').value,
    estado: document.getElementById('filtroEstado').value,
    orden: document.getElementById('filtroOrden').value,
    creado_por: document.getElementById('filtroCreadoPor').value,
    centro: document.getElementById('filtroCentro').value.trim(),
    sistema: document.getElementById('filtroSistema').value.trim(),
    incidencia: document.getElementById('filtroIncidencia').value.trim(),
    responsable: document.getElementById('filtroRespTexto').value.trim(),
    q: document.getElementById('filtroQ').value.trim(),
  };

  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor) params.append(clave, valor);
  }

  const res = await apiRequest(`/incidencias?${params.toString()}`);
  if (res.ok) {
    renderTabla(res.data);
    renderPaginacion(res.pagination);
    renderResumenEstados(res.estado);
  }
}

/**
 * Muestra el total de abiertas/cerradas del subconjunto filtrado.
 * El backend solo lo devuelve cuando el listado NO está filtrado por estado.
 */
function renderResumenEstados(estado) {
  const cont = document.getElementById('resumenEstados');
  if (!cont) return;

  if (!estado) {
    cont.innerHTML = '';
    return;
  }

  cont.innerHTML = `
    <span><i class="bi bi-list-ul"></i> Total filtrado: <strong>${estado.total}</strong></span>
    <span><i class="bi bi-hourglass-split"></i> Abiertas: <strong>${estado.abiertas}</strong></span>
    <span><i class="bi bi-check-circle"></i> Cerradas: <strong>${estado.cerradas}</strong></span>
  `;
}

/** Pinta las filas de la tabla de incidencias con todos sus campos. */
function renderTabla(incidencias) {
  const tbody = document.getElementById('tablaIncidenciasBody');
  tbody.innerHTML = '';

  if (incidencias.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="17" class="text-center text-muted py-4">No hay incidencias</td></tr>';
    return;
  }

  incidencias.forEach((inc) => {
    const abierta = inc.hora_fin === null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inc.id}</td>
      <td class="fw-semibold">${escaparHtml(inc.ticket)}</td>
      <td>${formatDate(inc.fecha)}</td>
      <td>${inc.hora_inicio || '-'}</td>
      <td>${inc.hora_fin || '-'}</td>
      <td>${escaparHtml(inc.centro)}</td>
      <td>${escaparHtml(inc.sistema)}</td>
      <td>${escaparHtml(inc.incidencia)}</td>
      <td>${escaparHtml(inc.responsable)}</td>
      <td>${escaparHtml(inc.descripcion || '—')}</td>
      <td><span class="badge ${abierta ? 'bg-danger' : 'bg-success'}">${abierta ? 'Abierta' : 'Cerrada'}</span></td>
      <td>${inc.tiempo_solucion || '-'}</td>
      <td>${autorLegible(inc.creado_por_usuario)}</td>
      <td>${autorLegible(inc.actualizado_por_usuario)}</td>
      <td>${celdaFecha(inc.creado_en)}</td>
      <td>${celdaFecha(inc.actualizado_en)}</td>
      <td class="text-nowrap">
      <div class="d-inline-flex flex-nowrap gap-1">
        <button class="btn btn-sm btn-outline-primary" onclick="verIncidencia(${inc.id})" title="Ver detalle" aria-label="Ver detalle">
          <i class="bi bi-eye"></i>
        </button>
        ${hasPermission(PERMISOS.INCIDENCIAS.MODIFICAR) ? `<button class="btn btn-sm btn-warning ms-1" onclick="abrirEditarIncidencia(${inc.id})" title="Modificar">
          <i class="bi bi-pencil"></i>
        </button>` : ''}
        ${hasPermission(PERMISOS.INCIDENCIAS.ELIMINAR) ? `<button class="btn btn-sm btn-danger ms-1" onclick="eliminarIncidencia(${inc.id})" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function celdaFecha(valor) {
  const texto = formatearFechaHora(valor).replace(',', '');
  return `<span style="color: #4caf50; font-weight: 350; font-size: 0.85xem;">${escaparHtml(texto)}</span>`;
}
/**
 * Nombre legible del autor de auditoría, con degradación en cascada:
 * nombre completo -> usuario -> id crudo.
 */
function autorLegible(usuario) {
  if (!usuario) return '<span class="text-muted">—</span>';
  return escaparHtml(usuario);
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
    await Promise.all([cargarSugerencias(), cargarIncidencias()]);
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
  const campos = [
    'filtroDesde',
    'filtroHasta',
    'filtroEstado',
    'filtroOrden',
    'filtroCreadoPor',
    'filtroCentro',
    'filtroSistema',
    'filtroIncidencia',
    'filtroRespTexto',
    'filtroQ',
  ];
  campos.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName === 'SELECT' && id === 'filtroOrden' ? 'fecha_desc' : '';
  });
  currentPage = 1;
  cargarIncidencias();
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  // Si ya viene como "YYYY-MM-DD", parsear como fecha local (no UTC).
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES');
  }
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('es-ES');
}

/** Convierte una fecha del API al formato YYYY-MM-DD que usa <input type="date">. */
function fechaParaInput(valor) {
  if (!valor) return '';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor; // ya está en el formato correcto
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
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
    ['Centro', inc.centro],
    ['Sistema', inc.sistema],
    ['Incidencia', inc.incidencia],
    ['Ticket', inc.ticket],
    ['Responsable', inc.responsable],
  ].map(([k, v]) => `
      <div class="col-md-4">
        <div class="text-muted small text-uppercase">${k}</div>
        <div class="fw-semibold">${escaparHtml(v)}</div>
      </div>`).join('');

  // Auditoría: las dos columnas reales del schema. `responsable` es el dato de
  // negocio (quién atiende), no el usuario del sistema que registró la fila.
  document.getElementById('detalleAuditoria').innerHTML = [
    ['Registrado por', autorLegible(inc.creado_por_usuario)],
    ['Modificado por', autorLegible(inc.actualizado_por_usuario)],
    ['Registrado en', celdaFecha(inc.creado_en)],
    ['Modificado en', celdaFecha(inc.actualizado_en)],
  ].map(([k, v]) => `
      <div class="col-md-3">
        <div class="text-muted small text-uppercase">${k}</div>
        <div class="fw-semibold">${v}</div>
      </div>`).join('');

  document.getElementById('detalleTiempos').innerHTML = [
    ['Fecha', formatDate(inc.fecha)],
    ['Hora de inicio', inc.hora_inicio || '-'],
    ['Hora de fin', inc.hora_fin || '-'],
    ['Tiempo de solución', inc.tiempo_solucion || '-'],
  ].map(([k, v]) => `
      <div class="col-md-3">
        <div class="text-muted small text-uppercase">${k}</div>
        <div class="fw-semibold">${escaparHtml(v)}</div>
      </div>`).join('');

  document.getElementById('detalleDescripcion').textContent = inc.descripcion || '-';
  document.getElementById('btnDetalleEditar').style.display = hasPermission(PERMISOS.INCIDENCIAS.MODIFICAR) ? '' : 'none';

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
  document.getElementById('editarTicket').value = inc.ticket;
  document.getElementById('editarCentro').value = inc.centro;
  document.getElementById('editarSistema').value = inc.sistema;
  document.getElementById('editarIncidencia').value = inc.incidencia;
  document.getElementById('editarResponsable').value = inc.responsable;
  document.getElementById('editarDescripcion').value = inc.descripcion;
  document.getElementById('editarFecha').value = fechaParaInput(inc.fecha);
  document.getElementById('editarHoraInicio').value = (inc.hora_inicio || '').slice(0, 5); // "HH:MM"
  document.getElementById('editarHoraFin').value = (inc.hora_fin || '').slice(0, 5);

  const cerrada = inc.hora_fin !== null;
  incidenciaEdicionCerrada = cerrada;
  document.getElementById('editarCerrarAviso').style.display = cerrada ? 'block' : 'none';
  document.getElementById('editarHoraFinAyuda').textContent = cerrada
    ? 'Puedes corregir la hora de fin; el tiempo de solución se recalcula.'
    : 'Si la dejas vacía se usa la hora actual del servidor al guardar (la incidencia se cierra).';

  modalEditar.show();
};

document.getElementById('btnGuardarEditarIncidencia').addEventListener('click', async () => {
  const id = document.getElementById('editarId').value;
  const fecha = document.getElementById('editarFecha').value;
  const horaInicio = document.getElementById('editarHoraInicio').value;
  const horaFin = document.getElementById('editarHoraFin').value;

  const body = {
    ticket: document.getElementById('editarTicket').value,
    centro: document.getElementById('editarCentro').value,
    sistema: document.getElementById('editarSistema').value,
    incidencia: document.getElementById('editarIncidencia').value,
    responsable: document.getElementById('editarResponsable').value,
    descripcion: document.getElementById('editarDescripcion').value,
  };

  if (fecha) body.fecha = fecha;
  if (horaInicio) body.hora_inicio = normalizarHora(horaInicio);

  if (!incidenciaEdicionCerrada) {
    // Incidencia abierta: al guardar se cierra.
    // Si hay horaFin, se usa; si no, el backend usa la hora del servidor.
    body.cerrar = true;
    if (horaFin) body.hora_fin = normalizarHora(horaFin);
  } else if (horaFin) {
    // Incidencia ya cerrada: solo se corrige la hora_fin si la cambiaron.
    body.hora_fin = normalizarHora(horaFin);
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

function normalizarHora(valor) {
  if (!valor) return '';
  const partes = String(valor).split(':');
  if (partes.length < 2) return '';
  const hh = partes[0].padStart(2, '0');
  const mm = partes[1].padStart(2, '0');
  const ss = (partes[2] || '00').slice(0, 2).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}