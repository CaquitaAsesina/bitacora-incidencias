/**
 * =====================================================================
 * js/auth.js — Pantalla de login (index.html)
 * =====================================================================
 * Si ya hay sesión, redirige a la primera página permitida (paginaInicio).
 * Si no, gestiona el submit del formulario de login.
 * Depende de api.js (apiRequest, paginaInicio).
 * =====================================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const alertContainer = document.getElementById('alertContainer');
  const loginSpinner = document.getElementById('loginSpinner');

  // Verificar si ya está logueado
  const me = await apiRequest('/auth/me');
  if (me.ok) {
    const destino = paginaInicio(me.permisos);
    if (destino) {
      window.location.href = destino;
      return;
    }
    // Sesión válida pero sin permisos: avisar y cerrarla para que el
    // formulario quede operativo. Sin esto el usuario queda atrapado en la
    // página sin poder iniciar sesión con otra cuenta.
    alertContainer.innerHTML = `
      <div class="alert alert-warning">La sesión anterior no tiene permisos asignados. Se cerrará para que puedas iniciar con otro usuario. Contacta al administrador.</div>
    `;
    await apiRequest('/auth/logout');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usuario = document.getElementById('usuario').value;
    const contrasena = document.getElementById('contrasena').value;

    if (!usuario || !contrasena) {
      alertContainer.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show">
          Complete todos los campos
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
      `;
      return;
    }

    loginSpinner.classList.remove('d-none');
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, contrasena }),
    });

    loginSpinner.classList.add('d-none');
    submitBtn.disabled = false;

    if (response.ok) {
      const destino = paginaInicio(response.permisos);
      if (destino) {
        window.location.href = destino;
      } else {
        alertContainer.innerHTML = `
          <div class="alert alert-warning">Tu usuario no tiene permisos asignados. Contacta al administrador.</div>
        `;
      }
    } else {
      alertContainer.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show">
          ${response.mensaje || 'Error al iniciar sesión'}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
      `;
    }
  });
});
