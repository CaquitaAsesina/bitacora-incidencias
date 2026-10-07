/**
 * =====================================================================
 * js/usuarios.js — Gestión de usuarios (usuarios.html)
 * =====================================================================
 * Listado con filtros, alta/modificación en modal y borrado.
 * Los botones de fila llaman funciones globales (window.*).
 * Los permisos que gobiernan los botones se consultan con hasPermission().
 *
 * ALINEADO CON EL BACKEND (usuariosService.js):
 *   - Permisos plurales: CREAR_USUARIOS / MODIFICAR_USUARIOS /
 *     ELIMINAR_USUARIOS. Antes todo pasaba por CREAR_USUARIO (singular), que
 *     ya no existe en el catálogo, así que los botones nunca se mostraban.
 *   - Cada fila trae roles, auditoría (creado_por / actualizado_por con su
 *     nombre legible) e incidencias_creadas / incidencias_actualizadas.
 *   - El listado ya filtra y ordena en el servidor; los filtros de texto se
 *     envían como parámetro `q`, no se filtran en el navegador.
 * =====================================================================
 */
let usuariosData = [];
let rolesData = []; // catálogo de roles para el filtro por rol
let ordenActual = 'alfabetico';

const modalUsuario = new bootstrap.Modal(document.getElementById('modalUsuario'));
let editingUsuarioId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const userData = await checkAuth();
  if (!userData) return;

  if (hasPermission(PERMISOS.USUARIOS.CREAR)) {
    document.getElementById('btnNuevoUsuario').style.display = 'inline-block';
    document.getElementById('btnNuevoUsuario').addEventListener('click', abrirModalNuevo);
  }

  document.getElementById('btnGuardarUsuario').addEventListener('click', guardarUsuario);

  // Los filtros se aplican al pulsar "Aplicar" o al cambiar un desplegable;
  // en los campos de texto se espera a dejar de escribir.
  const idsFiltro = ['filtroDesde', 'filtroHasta', 'filtroUsuario', 'filtroNombre', 'filtroEmail', 'filtroTelefono'];
  idsFiltro.forEach((id) => {
    document.getElementById(id).addEventListener('input', cargarUsuarios);
  });
  document.getElementById('filtroRol').addEventListener('change', cargarUsuarios);
  document.getElementById('filtroHabilitado').addEventListener('change', cargarUsuarios);
  document.getElementById('filtroOrden').addEventListener('change', (e) => {
    ordenActual = e.target.value;
    cargarUsuarios();
  });
  document.getElementById('btnFiltrarUsuarios').addEventListener('click', cargarUsuarios);
  document.getElementById('btnLimpiarFiltrosUsuarios').addEventListener('click', () => {
    idsFiltro.forEach((id) => (document.getElementById(id).value = ''));
    document.getElementById('filtroRol').value = '';
    document.getElementById('filtroHabilitado').value = '';
    document.getElementById('filtroOrden').value = ordenActual;
    cargarUsuarios();
  });

  await cargarDatos();
});

/** Carga roles (para el filtro) y usuarios. Rendimiento: ambas en paralelo. */
async function cargarDatos() {
  // El catálogo de roles solo se necesita para el desplegable de filtro; si el
  // usuario no puede ver roles, se salta sin romper la pantalla.
  const [rolesRes, usuariosRes] = await Promise.all([
    hasPermission(PERMISOS.ROLES.VER) ? apiRequest('/roles') : Promise.resolve({ ok: false }),
    apiRequest('/usuarios'),
  ]);

  if (rolesRes.ok) {
    rolesData = rolesRes.data;
    const selectRol = document.getElementById('filtroRol');
    const seleccionActual = selectRol.value;
    selectRol.innerHTML = '<option value="">Todos los roles</option>';
    rolesData.forEach((r) => {
      selectRol.innerHTML += `<option value="${r.id}">${escaparHtml(r.nombre)} (${r.tipo})</option>`;
    });
    selectRol.value = seleccionActual;
  }

  aplicarUsuarios(usuariosRes);
}

/**
 * Query de filtros para /api/usuarios.
 * Los campos de texto se unen en `q` (búsqueda parcial con LIKE en el
 * servidor); el resto viaja como parámetro exacto.
 * @returns {string} query string o ''
 */
function queryFiltrosUsuarios() {
  const params = new URLSearchParams();

  const textos = ['filtroUsuario', 'filtroNombre', 'filtroEmail', 'filtroTelefono']
    .map((id) => document.getElementById(id)?.value.trim() || '')
    .filter(Boolean);

  if (textos.length > 0) params.set('q', textos.join(' '));
  if (document.getElementById('filtroDesde')?.value) {
    params.set('creado_desde', document.getElementById('filtroDesde').value);
  }
  if (document.getElementById('filtroHasta')?.value) {
    params.set('creado_hasta', document.getElementById('filtroHasta').value);
  }
  if (document.getElementById('filtroRol')?.value) {
    params.set('rol_id', document.getElementById('filtroRol').value);
  }
  if (document.getElementById('filtroHabilitado')?.value !== '') {
    params.set('habilitado', document.getElementById('filtroHabilitado').value);
  }
  params.set('orden', ordenActual);

  return `?${params.toString()}`;
}

/** Carga el listado aplicando los filtros del panel. */
async function cargarUsuarios() {
  aplicarUsuarios(await apiRequest(`/usuarios${queryFiltrosUsuarios()}`));
}

/** Aplica la respuesta de /usuarios a la tabla (normaliza el array de roles). */
function aplicarUsuarios(res) {
  if (!res.ok) {
    document.getElementById('tablaUsuariosBody').innerHTML =
      '<tr><td colspan="13" class="text-center text-danger py-4">No se pudo cargar el listado de usuarios.</td></tr>';
    return;
  }

  // El endpoint ya incluye el array `roles` de cada usuario.
  usuariosData = res.data.map((u) => ({
    ...u,
    roles: Array.isArray(u.roles) ? u.roles : [],
  }));

  renderTablaUsuarios();
}

/** Nombre legible del autor de auditoría, con su usuario como respaldo. */
/** Nombre legible del autor de auditoría, con el usuario como respaldo. */
function autorLegible(usuario) {
  if (!usuario) return '<span class="text-muted">—</span>';
  return escaparHtml(usuario);
}

/** Celda de fecha de auditoría: formatearFechaHora ya devuelve '—' si no hay. */
function celdaFecha(valor) {
  const texto = formatearFechaHora(valor).replace(',', '');
  return `<span style="color: #4caf50; font-weight: 350; font-size: 0.85em;">${escaparHtml(texto)}</span>`;
}

/** Pinta la tabla de usuarios. */
function renderTablaUsuarios() {
  const tbody = document.getElementById('tablaUsuariosBody');
  tbody.innerHTML = '';

  if (usuariosData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="13" class="text-center text-muted py-4">No hay usuarios que coincidan con los filtros.</td></tr>';
    return;
  }

  const puedeEditar = hasPermission(PERMISOS.USUARIOS.MODIFICAR);
  const puedeEliminar = hasPermission(PERMISOS.USUARIOS.ELIMINAR);

  usuariosData.forEach((usuario) => {
    const roles = usuario.roles || [];
    const rolesHtml =
      roles.length === 0
        ? '<span class="text-muted">Sin roles</span>'
        : roles
          .map(
            (r) =>
              `<span class="badge ${r.tipo === 'SISTEMA' ? 'bg-danger' : 'bg-info'}" title="${escaparHtml(r.tipo)}">${escaparHtml(r.nombre)}</span>`
          )
          .join(' ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${usuario.id}</td>
      <td>${escaparHtml(usuario.usuario)}</td>
      <td>${escaparHtml(usuario.nombre)}</td>
      <td>${escaparHtml(usuario.apellido)}</td>
      <td>${escaparHtml(usuario.email || '—')}</td>
      <td>${escaparHtml(usuario.telefono || '—')}</td>
      <td>${usuario.habilitado ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
      <td>${rolesHtml}</td>
      <td>${autorLegible(usuario.creado_por_usuario)}</td>
      <td>${autorLegible(usuario.actualizado_por_usuario)}</td>
      <td>${celdaFecha(usuario.creado_en)}</td>
      <td>${celdaFecha(usuario.actualizado_en)}</td>
      <td class="text-nowrap">
  <div class="d-inline-flex flex-nowrap gap-1">
    ${puedeEditar ? `<button class="btn btn-sm btn-warning" onclick="editarUsuario(${usuario.id})" title="Modificar" aria-label="Modificar usuario ${escaparHtml(usuario.usuario)}"><i class="bi bi-pencil"></i></button>` : ''}
    ${puedeEliminar ? `<button class="btn btn-sm btn-danger" onclick="eliminarUsuario(${usuario.id})" title="Eliminar" aria-label="Eliminar usuario ${escaparHtml(usuario.usuario)}"><i class="bi bi-trash"></i></button>` : ''}
  </div>
</td>
    `;
    tbody.appendChild(tr);
  });
}

/** Abre el modal en modo "nuevo usuario". */
function abrirModalNuevo() {
  editingUsuarioId = null;
  document.getElementById('modalUsuarioTitle').textContent = 'Nuevo Usuario';
  document.getElementById('formUsuario').reset();
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('contrasena').required = true;
  document.getElementById('contrasena').value = '';
  modalUsuario.show();
}

window.editarUsuario = function (id) {
  const usuario = usuariosData.find((u) => u.id === id);
  if (!usuario) return;
  editingUsuarioId = id;
  document.getElementById('modalUsuarioTitle').textContent = 'Modificar Usuario';
  document.getElementById('usuario').value = usuario.usuario;
  document.getElementById('nombre').value = usuario.nombre;
  document.getElementById('apellido').value = usuario.apellido;
  document.getElementById('email').value = usuario.email;
  document.getElementById('telefono').value = usuario.telefono || '';
  document.getElementById('habilitado').value = usuario.habilitado ? 'true' : 'false';
  // En edición la contraseña es opcional: si el campo queda vacío no se envía.
  document.getElementById('passwordGroup').style.display = 'none';
  document.getElementById('contrasena').required = false;
  document.getElementById('contrasena').value = '';
  modalUsuario.show();
};

/** Guarda (crea o modifica) el usuario del modal. */
async function guardarUsuario() {
  const btn = document.getElementById('btnGuardarUsuario');
  const datos = {
    usuario: document.getElementById('usuario').value.trim(),
    nombre: document.getElementById('nombre').value.trim(),
    apellido: document.getElementById('apellido').value.trim(),
    email: document.getElementById('email').value.trim(),
    telefono: document.getElementById('telefono').value.trim() || null,
    habilitado: document.getElementById('habilitado').value === 'true',
  };

  // La contraseña solo viaja si se escribió; el backend la exige al crear y la
  // ignora en un PATCH vacío.
  const contrasena = document.getElementById('contrasena').value;
  if (contrasena) datos.contrasena = contrasena;

  if (!editingUsuarioId && !contrasena) {
    showToast('La contraseña es obligatoria al crear un usuario', 'error');
    return;
  }

  btn.disabled = true;
  try {
    const res = editingUsuarioId
      ? await apiRequest(`/usuarios/${editingUsuarioId}`, { method: 'PATCH', body: JSON.stringify(datos) })
      : await apiRequest('/usuarios', { method: 'POST', body: JSON.stringify(datos) });

    if (res.ok) {
      showToast(editingUsuarioId ? 'Usuario modificado' : 'Usuario creado', 'success');
      modalUsuario.hide();
      await cargarUsuarios();
    } else {
      // Los errores de validación del backend vienen en `errors[]`.
      const detalle = Array.isArray(res.errors) ? `: ${res.errors.map((e) => e.msg).join(' ')}` : '';
      showToast((res.mensaje || 'Error al guardar usuario') + detalle, 'error');
    }
  } finally {
    btn.disabled = false;
  }
}

window.eliminarUsuario = async function (id) {
  const usuario = usuariosData.find((u) => u.id === id);

  // El backend impide el borrado si el usuario tiene incidencias asociadas
  // (FK ON DELETE RESTRICT); avisar antes de intentarlo evita el error.
  const tieneIncidencias = (usuario?.incidencias_creadas ?? 0) > 0 || (usuario?.incidencias_actualizadas ?? 0) > 0;
  const mensaje = tieneIncidencias
    ? `“${usuario.usuario}” tiene incidencias registradas en la bitácora. No se puede eliminar; deshabilítalo en su lugar.`
    : `¿Eliminar al usuario “${usuario?.usuario || id}”?`;

  // uiConfirmar() (js/ui.js) es el equivalente visual del confirm() nativo:
  // mismo flujo, misma decisión, pero con modal Bootstrap.
  if (!(await uiConfirmar(mensaje))) return;

  const res = await apiRequest(`/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Usuario eliminado', 'success');
    await cargarUsuarios();
  } else {
    showToast(res.mensaje || 'Error al eliminar', 'error');
  }
};