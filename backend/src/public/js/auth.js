document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const alertContainer = document.getElementById('alertContainer');
  const loginSpinner = document.getElementById('loginSpinner');

  // Verificar si ya está logueado
  const me = await apiRequest('/auth/me');
  if (me.ok) {
    window.location.href = 'dashboard.html';
    return;
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
      window.location.href = 'dashboard.html';
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
