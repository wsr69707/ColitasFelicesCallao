/* ==========================================================
   REPORTAR UNA MASCOTA: formulario que envía el reporte a Google Sheets
   Lo usa: reportar-mascota.html
   Necesita cargar antes: config.js, mascota-svg.js, reportes.js, firma-visual.js y seleccion-mascota.js
   Contiene, en este orden: foto, selección de la mascota, botones de opciones, validación y envío.
   ========================================================== */

const $ = s => document.querySelector(s);
const datos = { tipo: 'perro', tamano: '', fotoDataUrl: '', lienzo: null, orig: null, paleta: [], firma: '' };

/* distrito (solo del Callao) y fecha (hoy como valor inicial, sin fechas futuras) */
$('#distrito').innerHTML = opcionesDistritos('Elige el distrito');
function fechaDeHoy() { return fechaHace(0); }
function reiniciarFecha() { $('#fecha').value = fechaDeHoy(); $('#fecha').max = fechaDeHoy(); $('#fecha').min = fechaHace(60); }
reiniciarFecha();

/* ----- Foto y selección de la mascota ----- */
/* La elipse que dibuja la persona orienta la segmentación (firma-visual.js). La foto que se publica es siempre la original.
   Colores: se guardan por separado los DETECTADOS (col.auto), los QUITADOS por la persona (col.quitados) y los AGREGADOS
   a mano (col.manual). La paleta que se envía sale de combinarlos (aplicarCorrecciones) y marca cada color con su origen. */
const MAX_COLORES = 6, PESO_MANUAL = 0.12;     // PESO_MANUAL: peso técnico para comparar, no es un porcentaje real
const col = { auto: [], quitados: [], manual: [], pila: [] };
let det = null;                                // último resultado de describirFoto (incluye _cache para corregir la firma)

const hexOk = h => /^#[0-9a-f]{6}$/i.test(h);
const cercano = (a, b, umbral) => distLab(labDe(a), labDe(b)) < umbral;
const fiable = () => !!(det && det._cache && !det._cache.respaldo && det._cache.conf >= 0.35);

/* Tonos casi iguales (menos de 10 de distancia en Lab) se funden en uno: un perro de un solo color no se parte en 4 grises */
function fusionarTonos(paleta, umbral = 10) {
  const g = [];
  paleta.forEach(c => {
    const rgb = hexARgb(c.hex), lab = labDe(c.hex), x = g.find(y => distLab(y.lab, lab) < umbral);
    if (x) { const t = x.w + c.w; x.rgb = x.rgb.map((v, i) => (v * x.w + rgb[i] * c.w) / t); x.w = t; x.lab = rgbALab(...x.rgb); }
    else g.push({ w: c.w, rgb, lab });
  });
  const total = g.reduce((t, x) => t + x.w, 0) || 1;
  return g.map(x => ({ hex: rgbAHex(...x.rgb), w: x.w / total })).sort((a, b) => b.w - a.w);
}
/* Último recurso: color promedio de lo que se cree que es el animal (o del óvalo central) */
function colorMedio() {
  let r = 0, g = 0, b = 0, t = 0;
  const c = det && det._cache;
  if (c) for (let p = 0; p < c.w * c.h; p++) {
    const v = c.peso[p]; if (v < 0.3 || c.data[p * 4 + 3] < 128) continue;
    r += c.data[p * 4] * v; g += c.data[p * 4 + 1] * v; b += c.data[p * 4 + 2] * v; t += v;
  }
  if (!t) {
    const px = pixelesReducidos(datos.lienzo, 32);
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      if (Math.hypot((x + 0.5) / px.w - 0.5, (y + 0.5) / px.h - 0.5) > 0.4) continue;
      const i = (y * px.w + x) * 4; r += px.data[i]; g += px.data[i + 1]; b += px.data[i + 2]; t++;
    }
  }
  return { hex: rgbAHex(r / (t || 1), g / (t || 1), b / (t || 1)), w: 1 };
}
/* Si la detección se repite (cambió la elipse), cada color quitado pasa al color nuevo más cercano; después se quita por color exacto */
function trasladarQuitados(quitados, auto) {
  const usados = new Set(), salida = [];
  quitados.forEach(q => {
    let mejor = null, md = 10;
    auto.forEach(c => { const d = distLab(labDe(q), labDe(c.hex)); if (d < md && !usados.has(c.hex)) { md = d; mejor = c.hex; } });
    if (mejor) { usados.add(mejor); salida.push(mejor); }
  });
  return salida;
}

/* Análisis completo de la foto: solo cuando cambia la foto o la elipse */
function calcularDescriptores() {
  if (!datos.lienzo) return;
  try { det = describirFoto(datos.lienzo, sel.obtener(), datos.orig); } catch (e) { det = { paleta: [], firma: '', _cache: null }; }
  let auto = fusionarTonos(det.paleta);
  if (!auto.length) auto = [colorMedio()];                  // siempre al menos un color: el promedio del animal, al 100 %
  col.auto = auto;
  col.quitados = trasladarQuitados(col.quitados, auto);
  col.pila = col.pila.filter(x => x.tipo === 'm');        // los quitados anteriores ya no se pueden deshacer sobre una detección nueva
  aplicarCorrecciones();
}

/* Paleta efectiva = detectados (menos los quitados) + agregados a mano. Solo usa datos ya calculados: no vuelve a leer la foto. */
function coloresVisibles() {
  const auto = col.auto.filter(c => !col.quitados.includes(c.hex)), total = auto.reduce((t, c) => t + c.w, 0) || 1;
  return [
    ...auto.map(c => ({ hex: c.hex, w: c.w / total, o: 'a' })),
    ...col.manual.map(h => ({ hex: h, w: PESO_MANUAL, o: 'm' }))
  ];
}
function aplicarCorrecciones() {
  const v = coloresVisibles();
  datos.paleta = v.map(c => ({ hex: c.hex, w: Math.round(c.w * 1000) / 1000, ...(c.o === 'm' ? { o: 'm' } : {}) }));
  // zonas: si se quitó algún color, solo se recalculan las 16 zonas (sin releer la foto); si no, la firma original
  const quitadosVigentes = col.auto.filter(c => col.quitados.includes(c.hex)).map(c => c.hex);
  datos.firma = (det && reajustarFirma(det._cache, quitadosVigentes, v.map(c => c.hex))) || (det ? det.firma : '');
  pintarColores(v);
}

const NOTA_COLORES = $('#notaColores').textContent;
function pintarColores(v) {
  const caja = $('#paletaColores'), mas = caja.querySelector('.rf-mas'), hayFoto = !!datos.fotoDataUrl;
  const pct = fiable() || (v.filter(c => c.o === 'a').length === 1 && !v.some(c => c.o === 'm'));     // un único color detectado es el 100 % del animal
  caja.querySelectorAll('.rf-color, .rf-sin-colores').forEach(x => x.remove());
  mas.insertAdjacentHTML('beforebegin', v.map(c => `<div class="rf-color${c.o === 'm' ? ' manual' : ''}" data-hex="${c.hex}" data-o="${c.o}">
      <span class="rf-muestra" style="background:${c.hex}" title="${c.o === 'm' ? 'Color agregado por ti' : 'Color detectado'}"></span>
      <button type="button" class="rf-quitar" aria-label="Quitar el color ${c.hex}">×</button>
      <small>${c.o === 'm' ? 'Tuyo' : pct ? Math.round(c.w * 100) + '%' : ''}</small></div>`).join(''));
  if (!v.length && hayFoto) mas.insertAdjacentHTML('beforebegin', '<p class="rf-sin-colores">Sin colores. Agrega uno con +.</p>');
  $('#panelColores').classList.toggle('vacio', !hayFoto);
  $('#panelColores').classList.remove('invalido');
  $('#btnDeshacer').disabled = !col.pila.length;
  $('#notaColores').textContent = pct || !hayFoto ? NOTA_COLORES : 'Detección aproximada: no mostramos porcentajes. Corrige los colores con × y +.';
}
function avisoColores(html) { const a = $('#rfAviso'); a.innerHTML = html || ''; a.hidden = !html; }

function quitarColor(hex, origen, confirmado) {
  if (coloresVisibles().length <= 1 && !confirmado) {      // nunca se queda sin colores sin avisar
    avisoColores(`Es tu último color: sin colores será más difícil encontrar coincidencias. <button type="button" data-a="quitar-ultimo" data-hex="${hex}" data-o="${origen}">Quitarlo igual</button> <button type="button" data-a="cancelar">Conservarlo</button>`);
    return;
  }
  avisoColores('');
  if (origen === 'm') col.manual = col.manual.filter(h => h !== hex);
  else col.quitados = [...col.quitados, hex].slice(-MAX_COLORES);
  col.pila.push({ tipo: origen, hex });
  aplicarCorrecciones();
}
function deshacerColor() {
  const u = col.pila.pop(); if (!u) return;
  avisoColores('');
  if (u.tipo === 'm') col.manual.push(u.hex);
  else col.quitados = col.quitados.filter(q => q !== u.hex);
  aplicarCorrecciones();
}
function agregarColor(hex) {
  hex = String(hex).toLowerCase(); if (!hexOk(hex)) return;
  const v = coloresVisibles();
  if (v.length >= MAX_COLORES) return toast('Máximo 6 colores. Quita alguno con × para agregar otro.');
  if (v.some(c => cercano(c.hex, hex, 8))) return toast('Ese color ya está en la lista.');
  avisoColores('');
  col.manual.push(hex);
  col.pila = col.pila.filter(x => !(x.tipo === 'm' && x.hex === hex));
  aplicarCorrecciones();
}
$('#paletaColores').addEventListener('click', e => {
  const q = e.target.closest('.rf-quitar'); if (!q) return;
  const c = q.closest('.rf-color'); quitarColor(c.dataset.hex, c.dataset.o);
});
$('#rfAviso').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  if (b.dataset.a === 'quitar-ultimo') quitarColor(b.dataset.hex, b.dataset.o, true); else avisoColores('');
});
$('#btnDeshacer').onclick = deshacerColor;
$('#colorManual').addEventListener('change', e => agregarColor(e.target.value));    // "change": cuando se confirma el color elegido

/* Resumen de lo que la persona corrigió (se guarda aparte; la paleta ya marca cada color como detectado o agregado) */
function resumenCorrecciones() {
  const e = sel.obtener(), pc = v => Math.round(v * 100);
  return {
    v: 1, e: e ? [pc(e.cx), pc(e.cy), pc(e.rx), pc(e.ry)] : [], c: sel.confirmada ? 1 : 0,
    q: col.quitados.slice(-MAX_COLORES), m: col.manual.slice(0, MAX_COLORES)
  };
}

const sel = SeleccionMascota.montar($('#fotoPrevia'), {
  obligatoria: true, puntero: true,
  onCambio: (roi, confirmada) => { calcularDescriptores(); if (roi || sel.omitida) $('#campoFoto').classList.remove('invalido'); }
});

async function recibirFoto(archivo) {
  if (!archivo) return;
  $('#zonaSubir').classList.add('cargando');
  try {
    const f = await procesarFoto(archivo, 900);
    datos.fotoDataUrl = f.dataUrl; datos.lienzo = f.lienzo; datos.orig = f.orig;
    col.quitados = []; col.manual = []; col.pila = []; avisoColores('');      // foto nueva: correcciones nuevas
    sel.reiniciar();
    $('#fotoPrevia').src = f.dataUrl;
    calcularDescriptores();
    $('#zonaSubir').hidden = true; $('#vistaFoto').hidden = false;
    $('#campoFoto').classList.remove('invalido');
  } catch (e) { toast(e.message); }
  finally { $('#zonaSubir').classList.remove('cargando'); $('#archivoFoto').value = ''; }
}
function quitarFoto() {
  datos.fotoDataUrl = ''; datos.lienzo = null; datos.orig = null; datos.paleta = []; datos.firma = '';
  det = null; col.auto = []; col.quitados = []; col.manual = []; col.pila = []; avisoColores('');
  sel.reiniciar(); pintarColores([]);
  $('#vistaFoto').hidden = true; $('#zonaSubir').hidden = false; $('#fotoPrevia').removeAttribute('src');
}
$('#archivoFoto').addEventListener('change', e => recibirFoto(e.target.files[0]));
$('#btnCambiarFoto').onclick = quitarFoto;
pintarColores([]);

/* ----- Botones de opciones (animal y tamaño) ----- */
document.querySelectorAll('.pastilla').forEach(b => {
  b.onclick = () => {
    const g = b.dataset.grupo;
    document.querySelectorAll(`.pastilla[data-grupo="${g}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
    datos[g] = b.dataset.valor;
    b.closest('.campo').classList.remove('invalido');
  };
});

/* ----- Validación ----- */
function marcar(el, texto) {
  // los campos sueltos (texto, lista, casilla) se marcan ellos mismos; el resto, todo su bloque
  if (el.matches('input, select')) (el.type === 'checkbox' ? el.closest('.casilla') : el).classList.add('mal');
  else (el.closest('.campo') || el).classList.add('invalido');
  return { el, texto };
}

function validar() {
  document.querySelectorAll('.invalido, .mal').forEach(x => x.classList.remove('invalido', 'mal'));
  const tel = $('#telefono').value.replace(/\D/g, '');
  const faltas = [];
  // Obligatorios: foto y distrito. Lo demás es opcional; el celular solo se revisa si la persona lo escribió.
  if (!datos.fotoDataUrl) faltas.push(marcar($('#campoFoto'), 'Agrega una foto de la mascota.'));
  else if (!datos.paleta.length) faltas.push(marcar($('#paletaColores'), 'Agrega al menos un color del pelaje con el botón +.'));
  if (!$('#distrito').value) faltas.push(marcar($('#distrito'), 'Elige el distrito del Callao.'));
  else if (!DISTRITOS.includes($('#distrito').value)) faltas.push(marcar($('#distrito'), 'Solo recibimos reportes del Callao.'));
  if ($('#fecha').value && $('#fecha').value > fechaDeHoy()) faltas.push(marcar($('#fecha'), 'La fecha no puede ser futura.'));
  if (tel) {
    if (!/^9\d{8}$/.test(tel)) faltas.push(marcar($('#telefono'), 'Escribe un celular de 9 dígitos que empiece con 9, o déjalo vacío.'));
    else if (!$('#acepto').checked) faltas.push(marcar($('#acepto'), 'Marca el permiso para mostrar tu celular, o borra el número.'));
  }
  return faltas;
}

/* ----- Envío ----- */
$('#formReporte').addEventListener('submit', async e => {
  e.preventDefault();
  const faltas = validar();
  const caja = $('#error');
  if (faltas.length) {
    caja.textContent = faltas[0].texto + (faltas.length > 1 ? ` (y ${faltas.length - 1} más por completar)` : '');
    caja.hidden = false;
    faltas[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  caja.hidden = true;
  if (sel.obtener() && !sel.confirmada) sel.confirmar();    // dibujó la elipse pero no tocó "Confirmar": se da por buena
  const btn = $('#btnEnviar'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    // comparación automática con los avisos de búsqueda (si falla, el reporte se publica igual)
    let coincidencias = [];
    try { coincidencias = await buscarCoincidencias({ tipo: datos.tipo, tamano: datos.tamano, paleta: datos.paleta, firma: datos.firma }); } catch (x) { coincidencias = []; }
    const r = await enviarReporte({
      tipo: datos.tipo, tamano: datos.tamano, distrito: $('#distrito').value, lugar: $('#lugar').value.trim(),
      fecha: $('#fecha').value || fechaDeHoy(), nota: $('#nota').value.trim(), collar: $('#collar').checked,
      nombre: $('#nombre').value.trim(), telefono: $('#telefono').value.replace(/\D/g, ''),
      paleta: datos.paleta, firma: datos.firma, correcciones: resumenCorrecciones(), fotoDataUrl: datos.fotoDataUrl, web: $('#web').value, coincidencias,
      token: (typeof leerSesion === 'function' && leerSesion() || {}).token || ''      // con sesión iniciada, el reporte puede ganar ColiCoins
    });
    $('#graciasTexto').textContent = coincidencias.length
      ? `Tu reporte se parece a ${coincidencias.length === 1 ? 'un aviso de búsqueda' : coincidencias.length + ' avisos de búsqueda'} y ya notificamos a ${coincidencias.length === 1 ? 'su dueño' : 'sus dueños'}. ¡Gracias por ayudar!`
      : r.prueba
      ? 'Modo prueba: el reporte se guardó solo en este navegador. Aparecerá en “Mascotas perdidas”.'
      : 'Tu reporte ya está publicado. Si su familia la está buscando, podrá encontrarla.';
    $('#formReporte').hidden = true; $('#gracias').hidden = false;
    $('#gracias').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    const servidorViejo = !$('#telefono').value.trim() && /celular debe tener 9/i.test(err.message || '');   // Apps Script sin actualizar
    caja.textContent = servidorViejo ? 'El servicio de reportes aún exige celular. Escribe uno por ahora; la administración debe actualizar Code.gs en Google Apps Script.' : (err.message || 'No pudimos enviar el reporte. Inténtalo otra vez.');
    caja.hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
});

$('#btnOtro').onclick = () => {
  $('#formReporte').reset(); quitarFoto(); reiniciarFecha();
  datos.tipo = 'perro'; datos.tamano = '';
  document.querySelectorAll('.pastilla').forEach(x => x.setAttribute('aria-pressed', x.dataset.grupo === 'tipo' && x.dataset.valor === 'perro'));
  $('#gracias').hidden = true; $('#formReporte').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* el celular se muestra con espacios: 987 654 321 */
$('#telefono').addEventListener('input', e => {
  const n = e.target.value.replace(/\D/g, '').slice(0, 9);
  e.target.value = n.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
});
