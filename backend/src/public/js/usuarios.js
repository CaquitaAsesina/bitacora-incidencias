document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  if (hasPermission('CREAR_USUARIO')) {
    document.getElementById('btnNuevoUsuario').style.display = 'inline-block';
  }
  await cargarUsuarios();
});
