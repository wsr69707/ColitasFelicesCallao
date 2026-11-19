/* ==========================================================
   AVISOS DE BÚSQUEDA: formulario para publicar y tarjetas "Se busca"
   Lo usa: avisos-busqueda.html
   Necesita cargar antes: config.js, mascota-svg.js, reportes.js, firma-visual.js, seleccion-mascota.js y coincidencias.js (reutiliza procesarFoto, opcionesDistritos,
   DISTRITOS, fechaHace, PIN, esc, ETIQ y toast).
   Contiene, en este orden: datos (Google Sheets o modo prueba), formulario, tarjeta del aviso y lista.
   ========================================================== */

const $ = s => document.querySelector(s);

/* ----- 1) Datos: Google Sheets (Apps Script) o, sin conexión, solo este navegador ----- */
const CLAVE_PREVIO = 'colitas_aviso_previo';      // lo guarda «No encuentro a mi mascota» (mascotas-perdidas) para adelantar el formulario

/* leerAvisosPrueba, normalizarAviso y cargarAvisos están en coincidencias.js (los usa también el formulario de reportes) */
async function enviarAviso(datos) {
  if (!COLITAS_API_URL) {
    const lista = leerAvisosPrueba();
    const { fotoDataUrl, web, registro, correo, firma, ...resto } = datos;
    const id = 'local-' + Date.now();
    lista.unshift({ ...resto, firma, id, foto: fotoDataUrl });
    try { localStorage.setItem(CLAVE_AVISOS_PRUEBA, JSON.stringify(lista.slice(0, 10))); }
    catch (e) { throw new Error('No hay espacio para guardar la prueba en este navegador.'); }
    return { prueba: true, id };
  }
  // text/plain evita la verificación previa (CORS) que Apps Script no responde
  const r = await fetch(COLITAS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...datos, registro: 'aviso' }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'No pudimos publicar el aviso. Inténtalo otra vez.');
  return { prueba: false, id: j.id };
}

/* ----- 2) Formulario ----- */
const datos = { tipo: 'perro', tamano: '', fotoDataUrl: '', lienzo: null, orig: null, paleta: [], firma: '' };
$('#distrito').innerHTML = opcionesDistritos('Elige el distrito');
const fechaDeHoy = () => fechaHace(0);
function reiniciarFecha() { $('#fecha').value = fechaDeHoy(); $('#fecha').max = fechaDeHoy(); $('#fecha').min = fechaHace(180); }
reiniciarFecha();

function abrirFormulario(abrir = true) {
  $('#tarjetaAviso').hidden = !abrir;
  $('#btnAbrirForm').setAttribute('aria-expanded', abrir);
  $('#btnAbrirForm').textContent = abrir ? 'Cerrar formulario' : 'Publicar un aviso de búsqueda';
  if (abrir) $('#tarjetaAviso').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#btnAbrirForm').onclick = () => abrirFormulario($('#tarjetaAviso').hidden);

function marcarPastilla(grupo, valor) {
  document.querySelectorAll(`.pastilla[data-grupo="${grupo}"]`).forEach(x => x.setAttribute('aria-pressed', x.dataset.valor === valor));
  datos[grupo] = valor;
}
document.querySelectorAll('.pastilla').forEach(b => {
  b.onclick = () => {
    const g = b.dataset.grupo;
    // el tamaño es opcional: al tocar otra vez se quita
    marcarPastilla(g, g === 'tamano' && datos.tamano === b.dataset.valor ? '' : b.dataset.valor);
    b.closest('.campo').classList.remove('invalido');
  };
});

/* Colores y zonas de la foto (para compararla con los reportes nuevos); la elipse opcional orienta la separación del fondo */
function analizarFoto() {
  if (!datos.lienzo) return;
  let d; try { d = describirFoto(datos.lienzo, selFoto.obtener(), datos.orig); } catch (e) { d = { paleta: [], firma: '' }; }
  datos.paleta = d.paleta.map(c => ({ hex: c.hex, w: Math.round(c.w * 1000) / 1000 })); datos.firma = d.firma;
}
const selFoto = SeleccionMascota.montar($('#fotoPrevia'), { obligatoria: false, onCambio: analizarFoto });

function mostrarFoto(dataUrl, lienzo, orig) {
  datos.fotoDataUrl = dataUrl; datos.lienzo = lienzo; datos.orig = orig;
  selFoto.reiniciar();
  $('#fotoPrevia').src = dataUrl;
  analizarFoto();
  $('#zonaSubir').hidden = true; $('#vistaFoto').hidden = false; $('#btnCambiarFoto').hidden = false;
  $('#campoFoto').classList.remove('invalido');
}
function quitarFoto() {
  datos.fotoDataUrl = ''; datos.lienzo = null; datos.orig = null; datos.paleta = []; datos.firma = ''; selFoto.reiniciar();
  $('#fotoPrevia').removeAttribute('src');
  $('#vistaFoto').hidden = true; $('#btnCambiarFoto').hidden = true; $('#zonaSubir').hidden = false;
}
async function recibirFoto(archivo) {
  if (!archivo) return;
  $('#zonaSubir').classList.add('cargando');
  try { const f = await procesarFoto(archivo, 900); mostrarFoto(f.dataUrl, f.lienzo, f.orig); }
  catch (e) { toast(e.message); }
  finally { $('#zonaSubir').classList.remove('cargando'); $('#archivoFoto').value = ''; }
}
/* foto que ya viene como dataUrl (la de la búsqueda): se pasa a canvas para poder analizarla */
function fotoDesdeDataUrl(dataUrl) {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    mostrarFoto(dataUrl, c, { w: im.naturalWidth, h: im.naturalHeight });
  };
  im.src = dataUrl;
}
$('#archivoFoto').addEventListener('change', e => recibirFoto(e.target.files[0]));
$('#btnCambiarFoto').onclick = quitarFoto;

/* el celular se muestra con espacios: 987 654 321 */
$('#telefono').addEventListener('input', e => {
  const n = e.target.value.replace(/\D/g, '').slice(0, 9);
  e.target.value = n.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
});

/* Si la persona viene de «No encuentro a mi mascota», se adelantan los datos de su búsqueda (animal, tamaño, descripción y foto) */
function aplicarBusquedaPrevia() {
  let p = null;
  try { p = JSON.parse(sessionStorage.getItem(CLAVE_PREVIO) || 'null'); sessionStorage.removeItem(CLAVE_PREVIO); } catch (e) {}
  if (!p) return false;
  if (p.tipo) marcarPastilla('tipo', p.tipo);
  if (p.tamano) marcarPastilla('tamano', p.tamano);
  if (p.nota) $('#nota').value = String(p.nota).slice(0, 200);
  if (p.nombre) $('#nombreMascota').value = String(p.nombre).slice(0, 30);
  if (p.foto && /^data:image\/(jpeg|png);base64,/.test(p.foto)) fotoDesdeDataUrl(p.foto);
  return true;
}

/* validación: se marca el campo y se avisa del primero que falta */
function marcar(el, texto) {
  if (el.matches('input, select')) (el.type === 'checkbox' ? el.closest('.casilla') : el).classList.add('mal');
  else (el.closest('.campo') || el).classList.add('invalido');
  return { el, texto };
}
function validar() {
  document.querySelectorAll('.invalido, .mal').forEach(x => x.classList.remove('invalido', 'mal'));
  const tel = $('#telefono').value.replace(/\D/g, ''), faltas = [];
  if (!datos.fotoDataUrl) faltas.push(marcar($('#campoFoto'), 'Agrega una foto de tu mascota.'));
  if ($('#correo').value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('#correo').value.trim())) faltas.push(marcar($('#correo'), 'Escribe un correo válido o déjalo vacío.'));
  if (!$('#nombreMascota').value.trim()) faltas.push(marcar($('#nombreMascota'), 'Escribe el nombre de tu mascota.'));
  if (!$('#distrito').value) faltas.push(marcar($('#distrito'), 'Elige el distrito donde se perdió.'));
  else if (!DISTRITOS.includes($('#distrito').value)) faltas.push(marcar($('#distrito'), 'Solo publicamos avisos del Callao.'));
  if ($('#fecha').value && $('#fecha').value > fechaDeHoy()) faltas.push(marcar($('#fecha'), 'La fecha no puede ser futura.'));
  if (!/^9\d{8}$/.test(tel)) faltas.push(marcar($('#telefono'), 'Escribe un celular de 9 dígitos que empiece con 9.'));
  else if (!$('#acepto').checked) faltas.push(marcar($('#acepto'), 'Marca el permiso para mostrar tu celular en el aviso.'));
  return faltas;
}

$('#formAviso').addEventListener('submit', async e => {
  e.preventDefault();
  const faltas = validar(), caja = $('#error');
  if (faltas.length) {
    caja.textContent = faltas[0].texto + (faltas.length > 1 ? ` (y ${faltas.length - 1} más por completar)` : '');
    caja.hidden = false;
    faltas[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  caja.hidden = true;
  if (selFoto.obtener()) selFoto.confirmar();      // dibujó la elipse pero no la confirmó: se da por buena
  const btn = $('#btnEnviar'); btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const r = await enviarAviso({
      tipo: datos.tipo, tamano: datos.tamano, nombreMascota: $('#nombreMascota').value.trim(), distrito: $('#distrito').value,
      lugar: $('#lugar').value.trim(), fecha: $('#fecha').value || fechaDeHoy(), nota: $('#nota').value.trim(), collar: $('#collar').checked,
      contacto: $('#nombre').value.trim(), telefono: $('#telefono').value.replace(/\D/g, ''), fotoDataUrl: datos.fotoDataUrl, web: $('#web').value,
      paleta: datos.paleta, firma: datos.firma, correo: $('#correo').value.trim()
    });
    guardarMiAviso(r.id, $('#nombreMascota').value.trim());     // para mostrarle aquí sus notificaciones
    $('#formAviso').reset(); quitarFoto(); reiniciarFecha(); marcarPastilla('tipo', 'perro'); marcarPastilla('tamano', '');
    abrirFormulario(false);
    toast(r.prueba ? 'Modo prueba: tu aviso se guardó solo en este navegador 🐾' : '¡Tu aviso ya está publicado! 🐾');
    await iniciarAvisos(); mostrarNotificaciones();
    $('#avisos').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    caja.textContent = err.message || 'No pudimos publicar el aviso. Inténtalo otra vez.';
    caja.hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Publicar aviso'; }
});

/* ----- 3) Tarjeta del aviso (misma estructura .ficha que los reportes) ----- */
function textoPerdido(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return '';
  const hoy = new Date(), dias = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - new Date(y, m - 1, d)) / 86400000);
  const larga = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '');
  if (dias <= 0) return 'Se perdió hoy';
  if (dias === 1) return 'Se perdió ayer';
  if (dias < 7) return `Se perdió hace ${dias} días`;
  return `Se perdió el ${larga}`;
}

function fichaAviso(a, i) {
  const zona = a.distrito === 'Callao' ? 'Callao (Cercado)' : a.distrito;
  const q = encodeURIComponent(`${a.lugar ? a.lugar + ', ' : ''}${a.distrito}, Callao, Perú`);
  const msg = encodeURIComponent(`Hola, vi tu aviso de búsqueda de ${a.nombreMascota || 'tu mascota'} en Colitas Felices Callao. Tengo información.`);
  const wa = a.telefono
    ? `<a class="contactar" href="https://wa.me/51${a.telefono}?text=${msg}" target="_blank" rel="noopener">Tengo información</a>` : '';
  return `<article class="ficha ficha-aviso" style="animation-delay:${Math.min(i, 8) * .08}s">
    <span class="cinta">Se busca</span>
    <div class="foto-ficha"><img src="${esc(a.foto)}" alt="${esc(a.nombreMascota || a.tipo)}, ${a.tipo} perdido en ${esc(zona)}" loading="lazy" referrerpolicy="no-referrer"></div>
    <div class="info">
      <span class="zona">${esc(a.nombreMascota || (a.tipo === 'gato' ? 'Gato perdido' : 'Perro perdido'))}</span>
      <span class="fecha">${textoPerdido(a.fecha)}</span>
      <span class="donde">${esc(zona)}${a.lugar ? ' · ' + esc(a.lugar) : ''}</span>
      <div class="chips">
        <span class="chip">${a.tipo === 'gato' ? '🐱 Gato' : '🐶 Perro'}</span>
        ${a.tamano ? `<span class="chip">${ETIQ[a.tamano]}</span>` : ''}
        ${a.collar ? '<span class="chip">Con collar</span>' : ''}
      </div>
      ${a.nota ? `<span class="nota-av">${esc(a.nota)}</span>` : ''}
      <div class="pie-ficha">
        <a class="pin" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" title="Ver en el mapa" aria-label="Ver la zona donde se perdió en el mapa">${PIN}</a>
        ${wa}
      </div>
      ${a.contacto ? `<span class="nota-av">Publicado por ${esc(a.contacto)}</span>` : ''}
    </div>
  </article>`;
}

/* ----- 4) Lista y filtros ----- */
let TODOS = [], limite = 12;
$('#fDistrito').innerHTML = opcionesDistritos('Todos los distritos');

function pintarAvisos() {
  const tipo = $('#fTipo').value, dis = $('#fDistrito').value;
  const lista = TODOS.filter(a => (!tipo || a.tipo === tipo) && (!dis || a.distrito === dis))
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
  $('#cuenta').textContent = `${lista.length} ${lista.length === 1 ? 'aviso' : 'avisos'}`;
  $('#rejilla').innerHTML = lista.length
    ? lista.slice(0, limite).map(fichaAviso).join('')
    : `<div class="vacio">🐾 ${TODOS.length ? 'No hay avisos con estos filtros.' : 'Todavía no hay avisos publicados.'}<br>
        <a href="mascotas-perdidas-callao.html">Busca primero entre las mascotas encontradas</a></div>`;
  $('#btnMas').hidden = lista.length <= limite;
}
['#fTipo', '#fDistrito'].forEach(s => $(s).addEventListener('change', () => { limite = 12; pintarAvisos(); }));
$('#btnMas').onclick = () => { limite += 12; pintarAvisos(); };

async function iniciarAvisos() {
  $('#rejilla').innerHTML = '<div class="vacio">Cargando avisos…</div>';
  try {
    const { lista, prueba } = await cargarAvisos();
    TODOS = lista; $('#avisoPrueba').hidden = !prueba;
    pintarAvisos();
  } catch (e) {
    $('#rejilla').innerHTML = `<div class="vacio">No pudimos cargar los avisos. Revisa tu conexión e inténtalo otra vez.<br>
      <button type="button" class="herr" id="btnReintentar">Volver a intentar</button></div>`;
    $('#btnReintentar').onclick = iniciarAvisos;
  }
}

/* ----- 5) Notificaciones: posibles coincidencias de los avisos publicados desde este navegador ----- */
async function mostrarNotificaciones() {
  const mis = leerJSON(CLAVE_MIS_AVISOS, []), caja = $('#notificaciones');
  let lista = [];
  try { lista = await cargarCoincidencias(mis.map(m => m.id)); } catch (e) {}
  caja.hidden = !lista.length;
  $('#listaCoincidencias').innerHTML = lista.map(c => {
    const aviso = mis.find(m => m.id === c.avisoId), zona = c.distrito === 'Callao' ? 'Callao (Cercado)' : c.distrito;
    return `<article class="coincidencia">
      ${c.foto ? `<img src="${esc(c.foto)}" alt="Mascota reportada en ${esc(zona)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <div>
        <strong>${aviso && aviso.nombre ? `Se parece a ${esc(aviso.nombre)}` : 'Se parece a tu mascota'} · ${c.pct}% de similitud visual</strong>
        <span>Reportada en ${esc(zona)}${c.lugar ? ' · ' + esc(c.lugar) : ''}${c.fecha ? ' · ' + esc(textoPerdido(c.fecha).replace('Se perdió', 'Reporte de')) : ''}</span>
        <a class="boton" href="mascotas-perdidas-callao.html#reporte-${encodeURIComponent(c.reporteId)}">Ver el reporte</a>
      </div>
    </article>`;
  }).join('');
}

iniciarAvisos();
mostrarNotificaciones();
if (aplicarBusquedaPrevia() || location.hash === '#publicar') abrirFormulario(true);
