/* ==========================================================
   SESIÓN: cuentas reales (Google Apps Script + Google Sheets)
   Lo usan: registro.html, iniciosesion.html, tienda-solidaria.html y reportar-mascota.html
   Necesita cargar antes: config.js
   Contiene: sesión guardada en el navegador, llamadas al servidor, y los formularios de registro e inicio de sesión.
   La contraseña viaja por HTTPS y el servidor solo guarda su huella (nunca la contraseña).
   ========================================================== */

const CLAVE_SESION = 'colitas_sesion';      // { token, nombre, saldo }

function leerSesion() {
  try { const s = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); return s && s.token ? s : null; } catch (e) { return null; }
}
function guardarSesion(s) { try { localStorage.setItem(CLAVE_SESION, JSON.stringify(s)); } catch (e) {} }

/* Llama al servidor. Devuelve el JSON; lanza un Error con un mensaje claro si no hay conexión o el servicio no está actualizado. */
async function llamarAPI(accion, datos) {
  if (!COLITAS_API_URL) throw new Error('El servicio de cuentas aún no está conectado (falta COLITAS_API_URL en js/config.js).');
  let j;
  try {
    // text/plain evita la verificación previa (CORS) que Apps Script no responde
    const r = await fetch(COLITAS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...datos, registro: accion }) });
    j = await r.json();
  } catch (e) { throw new Error('No pudimos conectar. Revisa tu internet e inténtalo otra vez.'); }
  if (!j.ok && j.sesion === false) { try { localStorage.removeItem(CLAVE_SESION); } catch (e) {} }
  if (!j.ok && !j.error) throw new Error('El servicio de cuentas aún no está actualizado.');
  return j;
}

function cerrarSesionColitas() {
  const s = leerSesion();
  try { localStorage.removeItem(CLAVE_SESION); } catch (e) {}
  if (s && COLITAS_API_URL) llamarAPI('salir', { token: s.token }).catch(() => {});
  location.href = 'iniciosesion.html';
}

/* ----- Formularios (se activan solo en la página que los tiene) ----- */
function mostrarErrorForm(f, msg) {
  let p = f.querySelector('.error-form');
  if (!p) { p = document.createElement('p'); p.className = 'error-form'; p.setAttribute('role', 'alert'); f.querySelector('button[type=submit]').before(p); }
  p.textContent = msg; p.hidden = !msg;
}
async function enviarForm(f, accion, datos, alExito) {
  const btn = f.querySelector('button[type=submit]'), texto = btn.textContent;
  btn.disabled = true; btn.textContent = 'Un momento…'; mostrarErrorForm(f, '');
  try { const j = await llamarAPI(accion, datos); if (!j.ok) throw new Error(j.error); alExito(j); }
  catch (e) { mostrarErrorForm(f, e.message); }
  finally { btn.disabled = false; btn.textContent = texto; }
}
/* a dónde ir después de entrar: solo páginas del propio sitio (?volver=tienda-solidaria.html) */
function destinoTrasEntrar() {
  const v = new URLSearchParams(location.search).get('volver');
  return v && /^[a-z0-9-]+\.html$/i.test(v) ? v : 'tienda-solidaria.html';
}

const formLogin = document.getElementById('formLogin');
if (formLogin) formLogin.addEventListener('submit', e => {
  e.preventDefault();
  enviarForm(formLogin, 'entrar', { correo: formLogin.correo.value.trim(), clave: formLogin.clave.value }, j => {
    guardarSesion({ token: j.token, nombre: j.nombre, saldo: j.saldo });
    location.href = destinoTrasEntrar();
  });
});

const formRegistro = document.getElementById('formRegistro');
if (formRegistro) formRegistro.addEventListener('submit', e => {
  e.preventDefault();
  if (formRegistro.clave.value !== formRegistro.confirmarclave.value) return;     // validarClaves() ya avisó
  enviarForm(formRegistro, 'registrar', {
    nombre: formRegistro.nombre.value.trim(), correo: formRegistro.correo.value.trim(), clave: formRegistro.clave.value,
    edad: formRegistro.edad.value, genero: formRegistro.genero.value
  }, () => { location.href = 'iniciosesion.html?registrado=1'; });
});
