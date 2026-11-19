/* ==========================================================
   TIENDA SOLIDARIA: productos, carrito, compra en soles y canje con ColiCoins
   Lo usa: tienda-solidaria.html
   Necesita cargar antes: config.js, mascota-svg.js (esc), reportes.js (toast) y sesion.js
   Contiene, en este orden: estado, catálogo, precios y moneda, productos, carrito y compra.
   Los precios y el saldo los decide SIEMPRE el servidor (Code.gs); aquí solo se muestran.
   ========================================================== */

const $ = s => document.querySelector(s);

/* ----- 1) Estado ----- */
const CLAVE_CARRITO = 'colitas_carrito', CLAVE_MONEDA = 'colitas_moneda';
let SES = leerSesion();                       // { token, nombre, saldo } o null (visitante)
let PRODUCTOS = [], catalogoDeEjemplo = false;
let moneda = SES ? (sessionStorage.getItem(CLAVE_MONEDA) === 'pen' ? 'pen' : 'cc') : 'pen';   // con sesión se empieza en ColiCoins
let carrito = {};                             // id -> cantidad
let entrega = 'recojo';
try { carrito = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '{}') || {}; } catch (e) { carrito = {}; }

/* ----- 2) Catálogo (de la pestaña Productos; si el servicio no responde, uno de ejemplo para poder verlo) ----- */
const CATALOGO_EJEMPLO = [
  ['placa', 'Placa de identificación', 'Placa de acero con el nombre de tu mascota y tu celular grabados.', 'perro-lengua', 15, 150],
  ['polo', 'Polo Colitas Felices', 'Polo de algodón con el logo de la página.', 'gato-feliz', 35, 350],
  ['taza', 'Taza «Una colita feliz»', 'Taza de cerámica para quienes aman a los animales.', 'perro-hueso', 18, 180],
  ['bolsa', 'Bolsa de tela reutilizable', 'Bolsa ecológica con estampado de mascotas.', 'labrador', 20, 200],
  ['bandana', 'Bandana para perros y gatos', 'Bandana de tela suave en colores de Colitas Felices.', 'yorkie', 12, 120],
  ['llavero', 'Llavero de patita', 'Llavero con forma de patita.', 'gato-atigrado', 8, 80],
  ['stickers', 'Pack de stickers', 'Seis stickers de perros y gatos.', 'bulldog-juego', 10, 100],
  ['collar', 'Collar reflectante', 'Collar con tira reflectante para paseos más seguros.', 'paseo', 22, 220]
].map(([id, nombre, descripcion, img, soles, colicoins]) => ({ id, nombre, descripcion, imagen: `imagenes/ilustraciones/${img}.webp`, soles, colicoins, stock: null }));

async function cargarProductos() {
  try {
    if (!COLITAS_API_URL) throw new Error('sin servicio');
    const r = await fetch(COLITAS_API_URL + '?action=productos&t=' + Date.now()), j = await r.json();
    if (!j.ok || !Array.isArray(j.productos) || !j.productos.length) throw new Error('catálogo vacío');
    PRODUCTOS = j.productos; catalogoDeEjemplo = false;
  } catch (e) { PRODUCTOS = CATALOGO_EJEMPLO; catalogoDeEjemplo = true; }
  const av = $('#avisoCatalogo');
  av.hidden = !catalogoDeEjemplo;
  av.innerHTML = '<strong>Vista previa:</strong> el catálogo real aún no está conectado. Actualiza <code>Code.gs</code> y ejecuta <code>configurar</code> para activar las compras.';
}

/* ----- 3) Precios y moneda ----- */
const imagenSegura = u => /^(imagenes\/[\w\-\/.]+|https:\/\/[^\s"'<>]+)$/.test(String(u || '')) ? u : '';
const MONEDA_SVG = '<svg class="cc-ico" viewBox="0 0 24 24" aria-hidden="true" width="1em" height="1em" style="vertical-align:-.12em"><circle cx="12" cy="12" r="10" fill="#F28C28" stroke="#1E2328" stroke-width="2"/><circle cx="9" cy="10" r="1.6" fill="#1E2328"/><circle cx="15" cy="10" r="1.6" fill="#1E2328"/><path d="M8.5 14.5c1 1.6 6 1.6 7 0" fill="none" stroke="#1E2328" stroke-width="1.6" stroke-linecap="round"/></svg>';
const precioDe = p => moneda === 'cc' ? p.colicoins : p.soles;
const disponibleEn = p => precioDe(p) > 0;
const textoPrecio = n => moneda === 'cc' ? `${MONEDA_SVG} ${n} <small>ColiCoins</small>` : `S/ ${Number(n).toFixed(2)}`;
const textoPlano = n => moneda === 'cc' ? `${n} ColiCoins` : `S/ ${Number(n).toFixed(2)}`;

function pintarCuenta() {
  $('#barraVisitante').hidden = !!SES; $('#barraUsuario').hidden = !SES; $('#comoGanar').hidden = !SES;
  if (!SES) return;
  $('#nombreUsuario').textContent = SES.nombre; $('#saldoUsuario').textContent = SES.saldo;
  $('#verCC').setAttribute('aria-pressed', moneda === 'cc'); $('#verPEN').setAttribute('aria-pressed', moneda === 'pen');
  $('#notaMoneda').textContent = moneda === 'cc'
    ? 'Los precios están en ColiCoins. Cambia a soles cuando quieras ver los precios originales.'
    : 'Estás viendo los precios en soles. Tus compras en dinero apoyan a los albergues del Callao.';
  const m = document.querySelector('.menu-saldo'); if (m) m.textContent = '🪙 ' + SES.saldo;
}
function cambiarMoneda(m) {
  moneda = m; sessionStorage.setItem(CLAVE_MONEDA, m);
  pintarCuenta(); pintarProductos(); pintarCarrito();
}
$('#verCC').onclick = () => cambiarMoneda('cc');
$('#verPEN').onclick = () => cambiarMoneda('pen');

/* el saldo y el nombre se confirman con el servidor; si la sesión ya no vale, se vuelve a modo visitante */
async function confirmarSesion() {
  if (!SES) return;
  try {
    const j = await llamarAPI('yo', { token: SES.token });
    if (j.ok) { SES = { token: SES.token, nombre: j.nombre, saldo: j.saldo }; guardarSesion(SES); }
    else if (j.sesion === false) { SES = null; moneda = 'pen'; toast('Tu sesión terminó. Inicia sesión otra vez.'); }
  } catch (e) { /* sin conexión: se muestra el último saldo conocido */ }
}

/* ----- 4) Productos ----- */
function pintarProductos() {
  $('#subProductos').textContent = moneda === 'cc'
    ? 'Canjea tus ColiCoins por estos productos como recompensa por ayudar a las mascotas.'
    : 'Cada compra apoya a los albergues de animales del Callao.';
  $('#productos').innerHTML = PRODUCTOS.map((p, i) => {
    const img = imagenSegura(p.imagen), agotado = p.stock === 0, ok = disponibleEn(p) && !agotado;
    return `<article class="producto" style="animation-delay:${Math.min(i, 8) * .06}s">
      <div class="imagen">${img ? `<img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy">` : ''}</div>
      <div class="cuerpo">
        <h3>${esc(p.nombre)}</h3>
        <p>${esc(p.descripcion)}</p>
        <span class="precio">${disponibleEn(p) ? textoPrecio(precioDe(p)) : '<small>No disponible en esta moneda</small>'}</span>
        ${agotado ? '<span class="agotado">Agotado</span>' : ''}
        <button type="button" class="boton" data-agregar="${esc(p.id)}" ${ok ? '' : 'disabled'}>Agregar al carrito</button>
      </div>
    </article>`;
  }).join('');
}
$('#productos').addEventListener('click', e => {
  const b = e.target.closest('[data-agregar]'); if (!b) return;
  cambiarCantidad(b.dataset.agregar, 1);
  toast('Agregado al carrito 🐾');
});

/* ----- 5) Carrito ----- */
function guardarCarrito() { try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito)); } catch (e) {} }
function cambiarCantidad(id, delta) {
  const p = PRODUCTOS.find(x => x.id === id); if (!p) return;
  const n = Math.max(0, Math.min(10, (carrito[id] || 0) + delta));
  if (p.stock !== null && n > p.stock) return toast('No hay más stock de este producto.');
  if (n) carrito[id] = n; else delete carrito[id];
  guardarCarrito(); pintarCarrito();
}
const lineasCarrito = () => Object.keys(carrito).map(id => ({ p: PRODUCTOS.find(x => x.id === id), cant: carrito[id] })).filter(l => l.p);

function pintarCarrito() {
  const lineas = lineasCarrito();
  // lo que ya no existe en el catálogo se quita del carrito
  Object.keys(carrito).forEach(id => { if (!PRODUCTOS.some(x => x.id === id)) delete carrito[id]; });
  $('#carritoVacio').hidden = !!lineas.length; $('#carritoLleno').hidden = !lineas.length;
  if (!lineas.length) return;
  const sinPrecio = lineas.some(l => !disponibleEn(l.p));
  const total = lineas.reduce((t, l) => t + precioDe(l.p) * l.cant, 0);
  $('#lineas').innerHTML = lineas.map(l => `<li>
      <span class="nombre">${esc(l.p.nombre)}${disponibleEn(l.p) ? '' : ' <small>(no disponible en esta moneda)</small>'}</span>
      <span class="cantidad"><button type="button" data-menos="${esc(l.p.id)}" aria-label="Quitar uno">−</button><b>${l.cant}</b><button type="button" data-mas="${esc(l.p.id)}" aria-label="Agregar uno">+</button></span>
      <span class="subtotal">${disponibleEn(l.p) ? textoPlano(precioDe(l.p) * l.cant) : '—'}</span>
    </li>`).join('');
  $('#total').textContent = textoPlano(moneda === 'pen' ? Math.round(total * 100) / 100 : total);

  const falta = moneda === 'cc' && SES ? total - SES.saldo : 0, aviso = $('#avisoSaldo');
  aviso.hidden = !(falta > 0);
  aviso.textContent = falta > 0 ? `Te faltan ${falta} ColiCoins para este canje.` : '';
  const btn = $('#btnComprar');
  btn.textContent = moneda === 'cc' ? 'Canjear con mis ColiCoins' : 'Comprar';
  btn.disabled = sinPrecio || falta > 0 || catalogoDeEjemplo;
  guardarCarrito();
}
$('#lineas').addEventListener('click', e => {
  const m = e.target.closest('[data-mas]'), n = e.target.closest('[data-menos]');
  if (m) cambiarCantidad(m.dataset.mas, 1); else if (n) cambiarCantidad(n.dataset.menos, -1);
});
$('#btnVaciar').onclick = () => { carrito = {}; guardarCarrito(); pintarCarrito(); };

document.querySelectorAll('[data-entrega]').forEach(b => b.onclick = () => {
  entrega = b.dataset.entrega;
  document.querySelectorAll('[data-entrega]').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#campoDireccion').hidden = entrega !== 'envio';
});
$('#cTelefono').addEventListener('input', e => {
  const n = e.target.value.replace(/\D/g, '').slice(0, 9);
  e.target.value = n.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
});

/* ----- 6) Compra (soles) o canje (ColiCoins) ----- */
function textoGracias(j) {
  const caja = $('#instruccionesPago');
  if (moneda === 'cc') {
    caja.hidden = true;
    return `Canjeaste tu pedido ${j.id} por ${j.total} ColiCoins. Te quedan ${j.saldo}. Te escribiremos al celular indicado para coordinar la entrega.`;
  }
  const pagos = [];
  if (TIENDA_YAPE) pagos.push(`<p>Paga <b>S/ ${Number(j.total).toFixed(2)}</b> por <b>Yape o Plin</b> al número <b>${esc(TIENDA_YAPE)}</b> e indica tu código <b>${esc(j.id)}</b>.</p>`);
  if (TIENDA_WHATSAPP) pagos.push(`<p><a class="boton" target="_blank" rel="noopener" href="https://wa.me/${esc(TIENDA_WHATSAPP)}?text=${encodeURIComponent(`Hola, hice el pedido ${j.id} por S/ ${Number(j.total).toFixed(2)} en la Tienda Solidaria de Colitas Felices.`)}">Enviar el comprobante por WhatsApp</a></p>`);
  caja.innerHTML = pagos.join(''); caja.hidden = !pagos.length;
  return `Registramos tu pedido ${j.id} por S/ ${Number(j.total).toFixed(2)}. ` + (pagos.length ? 'Se confirma cuando recibamos tu pago.' : 'Te escribiremos al celular indicado para coordinar el pago y la entrega.');
}

$('#formCompra').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#errorCompra'), nombre = $('#cNombre').value.trim(), tel = $('#cTelefono').value.replace(/\D/g, ''), dir = $('#cDireccion').value.trim();
  const falla = m => { err.textContent = m; err.hidden = false; };
  if (nombre.length < 2) return falla('Escribe tu nombre.');
  if (!/^9\d{8}$/.test(tel)) return falla('Escribe un celular de 9 dígitos que empiece con 9.');
  if (entrega === 'envio' && dir.length < 6) return falla('Escribe la dirección de entrega.');
  if (moneda === 'cc' && !SES) return falla('Inicia sesión para canjear tus ColiCoins.');
  err.hidden = true;
  const btn = $('#btnComprar'), texto = btn.textContent; btn.disabled = true; btn.textContent = 'Procesando…';
  try {
    const j = await llamarAPI(moneda === 'cc' ? 'canjear' : 'pedido', {
      token: SES ? SES.token : '', items: lineasCarrito().map(l => ({ id: l.p.id, cant: l.cant })),
      nombre, telefono: tel, entrega, direccion: entrega === 'envio' ? dir : ''
    });
    if (!j.ok) throw new Error(j.error || 'No pudimos registrar tu pedido.');
    if (moneda === 'cc') { SES = { ...SES, saldo: j.saldo }; guardarSesion(SES); pintarCuenta(); }
    $('#graciasTexto').textContent = textoGracias(j);
    carrito = {}; guardarCarrito();
    $('#carritoVacio').hidden = true; $('#carritoLleno').hidden = true; $('#graciasCompra').hidden = false;
    $('#graciasCompra').scrollIntoView({ behavior: 'smooth', block: 'center' });
    cargarProductos().then(pintarProductos);        // el stock pudo cambiar
  } catch (x) { falla(x.message); btn.textContent = texto; btn.disabled = false; }
});
$('#btnSeguir').onclick = () => { $('#graciasCompra').hidden = true; pintarCarrito(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

/* ----- Inicio ----- */
(async function iniciar() {
  $('#productos').innerHTML = '<div class="vacio">Cargando productos…</div>';
  await Promise.all([cargarProductos(), confirmarSesion()]);
  if (!SES) moneda = 'pen';
  if (!SES) $('#enlaceEntrar').href = 'iniciosesion.html?volver=tienda-solidaria.html';
  pintarCuenta(); pintarProductos(); pintarCarrito();
})();
