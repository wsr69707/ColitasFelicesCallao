/* ==========================================================
   REPORTES DE MASCOTAS ENCONTRADAS
   Lo usan: reportar-mascota.html y mascotas-perdidas-callao.html
   Contiene, en este orden: distritos, colores y MOTOR DE COMPARACIÓN (paletas + firma visual v2/v3),
   fotos, conexión con Google Sheets, reportes de ejemplo y tarjeta de cada reporte.
   Necesita cargar antes: js/config.js y js/mascota-svg.js (y js/firma-visual.js en las páginas que analizan fotos o maquetas)
   ========================================================== */

/* ----- 1) Distritos del Callao (los únicos que acepta la página) ----- */
const DISTRITOS = [
  'Bellavista', 'Callao', 'Carmen de la Legua Reynoso', 'La Perla', 'La Punta', 'Mi Perú', 'Ventanilla'
];

function opcionesDistritos(primera) {
  return `<option value="">${primera}</option>` +
    DISTRITOS.map(d => `<option value="${esc(d)}">${d === 'Callao' ? 'Callao (Cercado)' : esc(d)}</option>`).join('');
}

/* ----- 2) Colores y parecido -----
   Cada mascota (foto o maqueta) se resume en una "paleta": sus 4 colores principales
   y cuánto pesa cada uno. Dos mascotas se parecen cuando sus paletas se parecen. */
function rgbALab(r, g, b) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const hexARgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
const rgbAHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const labDe = hex => rgbALab(...hexARgb(hex));
const distLab = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* normaliza una paleta [{hex, w}] y le agrega el color en Lab */
function prepararPaleta(p) {
  const total = p.reduce((s, c) => s + c.w, 0) || 1;
  return p.map(c => ({ hex: c.hex, w: c.w / total, lab: labDe(c.hex) }));
}

/* agrupa los puntos de color en k grupos (k-medias en espacio Lab) */
function agruparColores(pts, k, minimo = 0.05) {   // minimo: los grupos más pequeños que esa fracción se descartan
  if (!pts.length) return [];
  let centros = [pts.reduce((a, b) => b.w > a.w ? b : a).lab];
  while (centros.length < k) {
    let mejor = null, mejorD = -1;
    for (const p of pts) {
      const d = Math.min(...centros.map(c => distLab(p.lab, c))) * p.w;
      if (d > mejorD) { mejorD = d; mejor = p; }
    }
    if (mejorD < 1) break;
    centros.push(mejor.lab);
  }
  let grupos = [];
  for (let it = 0; it < 8; it++) {
    grupos = centros.map(() => ({ w: 0, lab: [0, 0, 0], rgb: [0, 0, 0] }));
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      centros.forEach((c, i) => { const d = distLab(p.lab, c); if (d < bd) { bd = d; bi = i; } });
      const g = grupos[bi]; g.w += p.w;
      for (let j = 0; j < 3; j++) { g.lab[j] += p.lab[j] * p.w; g.rgb[j] += p.rgb[j] * p.w; }
    }
    centros = centros.map((c, i) => grupos[i].w ? grupos[i].lab.map(v => v / grupos[i].w) : c);
  }
  const total = grupos.reduce((s, g) => s + g.w, 0);
  return grupos.filter(g => g.w / total > minimo)
    .map(g => ({ hex: rgbAHex(g.rgb[0] / g.w, g.rgb[1] / g.w, g.rgb[2] / g.w), w: g.w / total }))
    .sort((a, b) => b.w - a.w);
}

/* paleta de una foto: se mira el centro (donde suele estar el animal) y se ignora un poco el borde */
function paletaDeImagen(el) {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true });
  const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height, lado = Math.min(w, h);
  x.drawImage(el, (w - lado) / 2, (h - lado) / 2, lado, lado, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data, pts = [];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const i = (py * S + px) * 4; if (d[i + 3] < 128) continue;
    const dx = (px - S / 2) / (S / 2), dy = (py - S / 2) / (S / 2);
    pts.push({ lab: rgbALab(d[i], d[i + 1], d[i + 2]), rgb: [d[i], d[i + 1], d[i + 2]], w: Math.exp(-(dx * dx + dy * dy) / 0.9) });
  }
  return agruparColores(pts, 4);
}

/* paleta de la maqueta: solo cuentan las partes que el usuario coloreó */
function paletaDeMaqueta(fills, strokes) {
  const mapa = {};
  Object.keys(fills).forEach(parte => { mapa[fills[parte]] = (mapa[fills[parte]] || 0) + (PESOS[parte] || 1); });
  (strokes || []).forEach(s => { mapa[s.color] = (mapa[s.color] || 0) + Math.min(2.5, s.pts.length * s.size / 400); });
  return Object.keys(mapa).map(hex => ({ hex, w: mapa[hex] }));
}

/* paleta de un reporte de ejemplo dibujado con colores por parte */
function paletaDeColores(colores, manchas) {
  const mapa = {};
  Object.keys(colores).forEach(p => { mapa[colores[p]] = (mapa[colores[p]] || 0) + (PESOS[p] || 1); });
  if (manchas) mapa[manchas] = (mapa[manchas] || 0) + 1.5;
  return Object.keys(mapa).map(hex => ({ hex, w: mapa[hex] }));
}

/* Distancia de color "de pelaje": la luz de una foto (sombra, flash, sol) cambia mucho el brillo,
   pero casi no cambia el matiz. Por eso el brillo pesa menos que el tono: un blanco dibujado
   se parece a un blanco grisáceo de foto, pero NO a un perro color arena o café. */
const distPelo = (a, b) => Math.hypot(0.6 * (a[0] - b[0]), a[1] - b[1], a[2] - b[2]);

/* ¿Es un color que un pelaje real casi nunca tiene? (verde, azul, violeta, rosado, muy saturado).
   Si aparece en una foto, casi seguro es fondo (pasto, cielo, pared, juguete) y no la mascota. */
function esColorAjeno(lab) {
  const C = Math.hypot(lab[1], lab[2]);
  if (C < 14) return false;                                   // negro, grises y blancos: siempre posibles
  const h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;       // 15°-105° = café, canela, dorado, naranja
  return h < 10 || h > 105 || C > 80;
}

/* Parecido de paletas (0 a 1). Se mira en los dos sentidos, para no dejar pasar perros distintos:
   - cubre:   ¿los colores que dibujaste están en el reporte?
   - explica: ¿los colores del reporte están en tu dibujo? (un perro café no "explica" un dálmata)
   Los colores poco frecuentes pesan más de lo que ocupan (las manchas negras SON el dálmata),
   y los colores ajenos al pelaje que tu dibujo no tiene casi no cuentan (probable fondo). */
const SIGMA_COLOR = 22, REALCE_MINORIAS = 0.6;

/* Cuánto de la paleta es oscuro (negro, café muy oscuro) y cuánto es claro (blanco, crema). */
function claroOscuro(P) {
  let osc = 0, cla = 0;
  P.forEach(c => { if (c.lab[0] < 35) osc += c.w; else if (c.lab[0] > 70) cla += c.w; });
  return { osc, cla };
}

/* Patrón: un dálmata (manchas oscuras sobre blanco) NO es un perro todo blanco ni todo negro, aunque
   compartan colores. Si un lado tiene una parte importante oscura o clara y el otro casi nada, se castiga. */
function factorPatron(A, B) {
  const a = claroOscuro(A), b = claroOscuro(B);
  const falta = (x, y) => x >= 0.05 && y < 0.03;          // x lo tiene un lado; y casi nada el otro
  let f = 1;
  if (falta(a.osc, b.osc) || falta(b.osc, a.osc)) f *= 0.45;
  if (falta(a.cla, b.cla) || falta(b.cla, a.cla)) f *= 0.45;
  return f;
}

/* A y B son paletas ya preparadas (prepararPaleta). Si una es maqueta y la otra foto (mixta), el dibujo es una
   versión simple de la mascota: lo que dibujaste debe estar en la foto (cubre) y se exige menos al revés
   (la foto trae sombras y restos de fondo que el dibujo no tiene), y los colores se toleran un poco más. */
function parecidoPaletas(A, B, mixta) {
  if (!A.length || !B.length) return 0;
  const sigma = mixta ? SIGMA_COLOR + 4 : SIGMA_COLOR;
  B.forEach(b => {
    const lejos = Math.min(...A.map(a => distPelo(a.lab, b.lab))) > 25;
    b.p = b.w * (lejos && esColorAjeno(b.lab) ? 0.25 : 1);
  });
  const repartir = (L, k) => { const t = L.reduce((s, x) => s + Math.pow(x[k], REALCE_MINORIAS), 0) || 1; L.forEach(x => { x.u = Math.pow(x[k], REALCE_MINORIAS) / t; }); };
  repartir(A, 'w'); repartir(B, 'p');
  const igual = d => Math.exp(-Math.pow(d / sigma, 2));
  const mejor = (c, Q) => Math.max(...Q.map(q => igual(distPelo(c.lab, q.lab))));
  const cubre = A.reduce((s, a) => s + a.u * mejor(a, B), 0);
  const explica = B.reduce((s, b) => s + b.u * mejor(b, A), 0);
  const base = mixta ? Math.pow(cubre, 0.6) * Math.pow(explica, 0.4) : Math.sqrt(cubre * explica);
  return base * factorPatron(A, B);
}

const TAMANOS = ['pequeno', 'mediano', 'grande'];
const PARADAS = new Set(['tiene', 'tienen', 'esta', 'estaba', 'muy', 'pero', 'para', 'como', 'unos', 'unas', 'sobre', 'desde', 'cuando', 'donde', 'tambien', 'siempre']);
const palabras = txt => new Set((String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]{4,}/g) || []).filter(w => !PARADAS.has(w)));

/* ----- Firma visual (v2 antigua y v3 nueva): lectura y comparación por zonas -----
   firma-visual.js la crea; aquí se lee y se compara, para que exista un solo motor.
   v2: "2|origen|16 colores"; v3: "3|origen|confianza|elipse y tamaño|16 zonas con confianza y mezcla". */
const FIRMA = { N: 4, VERSION: 3, MIN_RELLENO: 0.2, LADO_FOTO: 96 };

/* Texto -> objeto listo para comparar (o null si no hay firma o no es válida: reportes antiguos) */
function parsearFirma(s) {
  if (!s) return null;
  if (typeof s === 'object') return s.celdas ? s : null;
  s = String(s);
  let origen, conf, roi = null, orig = null, partes;
  let m = /^3\|([01])\|(\d)\|(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,5}),(\d{1,5})\|(.+)$/.exec(s);
  if (m) {
    origen = +m[1]; conf = +m[2] / 9; partes = m[9].split(',');
    if (+m[5] > 0 && +m[6] > 0) roi = { cx: +m[3] / 100, cy: +m[4] / 100, rx: +m[5] / 100, ry: +m[6] / 100 };
    orig = { w: +m[7], h: +m[8] };
  } else {
    m = /^2\|([01])\|(.+)$/.exec(s);
    if (!m) return null;
    origen = +m[1]; conf = 0.5; partes = m[2].split(',');       // v2: sin confianza propia, se asume intermedia
  }
  if (partes.length !== FIRMA.N * FIRMA.N) return null;
  const celdas = partes.map(p => {
    const k = /^([0-9a-fA-F]{6})(?:([1-9])([0-9]))?$/.exec(p);
    if (!k) return null;
    return { hex: '#' + k[1].toLowerCase(), lab: labDe('#' + k[1]), c: k[2] ? +k[2] / 9 : 0.55, m: k[3] ? +k[3] : 0 };
  });
  if (celdas.filter(Boolean).length < 3) return null;
  const filas = [];                                              // color medio por fila: casi no depende de la postura
  for (let f = 0; f < FIRMA.N; f++) {
    const v = celdas.slice(f * FIRMA.N, f * FIRMA.N + FIRMA.N).filter(Boolean), t = v.reduce((a, c) => a + c.c, 0);
    filas.push(v.length ? { lab: [0, 1, 2].map(j => v.reduce((a, c) => a + c.lab[j] * c.c, 0) / t), c: t / v.length } : null);
  }
  return { origen, conf, roi, orig, celdas, filas };
}

/* Distancia entre dos zonas. Si las dos son "mezcladas" (manchas, dos tonos) el promedio engaña y se tolera más;
   si una es lisa y la otra muy mezclada, se penaliza un poco. */
function distCelda(a, b) {
  const d = distPelo(a.lab, b.lab);
  if (a.m >= 4 && b.m >= 4) return d * 0.6;
  return Math.abs(a.m - b.m) >= 5 ? d + 8 : d;
}

/* Distancia de color entre las zonas de dos firmas, mirando solo las zonas que ambas tienen y dando más peso
   a las más fiables (peso = raíz del producto de sus confianzas). Una zona dudosa influye poco.
   - Por filas (arriba / medio / abajo): casi no depende de la postura; separa "cabeza oscura y cuerpo claro"
     de "cabeza clara y cuerpo oscuro".
   - Por cuadrícula, también con la imagen volteada (la mascota puede mirar a un lado u otro).
   Devuelve la distancia, o null si no hay zonas suficientes para comparar. */
function distanciaRegional(A, B) {
  const N = FIRMA.N;
  let sf = 0, wf = 0, nf = 0;
  for (let f = 0; f < N; f++) if (A.filas[f] && B.filas[f]) {
    const w = Math.sqrt(A.filas[f].c * B.filas[f].c); sf += w * distPelo(A.filas[f].lab, B.filas[f].lab); wf += w; nf++;
  }
  const dFilas = nf >= 2 && wf > 0 ? sf / wf : null;
  let dCuadro = null;
  for (const voltear of [false, true]) {
    let s = 0, w = 0, n = 0;
    for (let f = 0; f < N; f++) for (let c = 0; c < N; c++) {
      const a = A.celdas[f * N + c], b = B.celdas[f * N + (voltear ? N - 1 - c : c)];
      if (a && b) { const q = Math.sqrt(a.c * b.c); s += q * distCelda(a, b); w += q; n++; }
    }
    if (n >= 4 && w > 0 && (dCuadro === null || s / w < dCuadro)) dCuadro = s / w;
  }
  if (dFilas === null && dCuadro === null) return null;
  return dFilas === null ? dCuadro : dCuadro === null ? dFilas : 0.55 * dFilas + 0.45 * dCuadro;
}

/* Cuánto pesa cada parte del parecido. Solo se usan las partes que ambos lados tienen: un reporte antiguo
   (sin zonas) se compara solo por su paleta, sin perder puntos por eso. */
const PESO_ZONAS = 0.45, ESCALA_ZONAS = 22, ESCALA_ZONAS_MIXTA = 27;

/* porcentaje de similitud visual (0 a 100) entre lo que busca el usuario y un reporte.
   Sirve para maqueta -> foto, foto -> foto y reportes antiguos. No es una identificación. */
function parecido(busqueda, r) {
  if (!r.paleta || !r.paleta.length || !busqueda.paleta || !busqueda.paleta.length) return 0;
  // las paletas se preparan una sola vez por consulta y por reporte
  const A = busqueda._pp || (busqueda._pp = prepararPaleta(busqueda.paleta));
  const B = r._pp || (r._pp = prepararPaleta(r.paleta));
  const FA = busqueda.firma, FB = r.firma;
  const mixta = !!(FA && FB && FA.origen !== FB.origen) || (!!FA && !FB && FA.origen === 1) || (!FA && !!FB && FB.origen === 1);
  const sPaleta = parecidoPaletas(A, B, mixta);
  const zonas = FA && FB ? distanciaRegional(FA, FB) : null;
  let s = sPaleta;
  if (zonas !== null) {
    /* Si la mascota tiene manchas (oscuro y claro a la vez, como un dálmata) el color promedio de cada zona
       sale gris y engaña: ahí las zonas pesan menos y manda la paleta, que sí ve el blanco y el negro por separado. */
    const co = claroOscuro(A), manchada = Math.min(co.osc, co.cla) >= 0.05;
    const fiable = 0.3 + 0.7 * Math.sqrt(FA.conf * FB.conf);        // zonas poco fiables (segmentación dudosa) pesan menos
    const pz = (manchada ? 0.3 : PESO_ZONAS) * fiable;
    s = (1 - pz) * sPaleta + pz * Math.exp(-Math.pow(zonas / (mixta ? ESCALA_ZONAS_MIXTA : ESCALA_ZONAS), 2));
  }
  let pct = 100 * s;
  if (busqueda.tipo && r.tipo && busqueda.tipo !== r.tipo) pct *= 0.25;   // perro y gato casi nunca coinciden
  if (busqueda.tamano && r.tamano) pct *= 1 - 0.08 * Math.abs(TAMANOS.indexOf(busqueda.tamano) - TAMANOS.indexOf(r.tamano));
  const mio = palabras(busqueda.nota);
  if (mio.size && r.nota) { const suyo = palabras(r.nota); let c = 0; mio.forEach(w => { if (suyo.has(w)) c++; }); pct += Math.min(8, c * 4); }
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/* ----- 3) Fotos: se achican en el navegador antes de guardarlas ----- */
function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); ok(im); };
    im.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No pudimos abrir esa imagen. Prueba con una foto JPG o PNG.')); };
    im.src = url;
  });
}

/* Abre la foto y la reduce. Devuelve la foto reducida (dataUrl y canvas) y sus dimensiones originales.
   El análisis de colores lo hace describirFoto() (firma-visual.js), porque necesita la elipse que dibuja el usuario. */
async function procesarFoto(archivo, maximo = 900) {
  if (!archivo || !archivo.type.startsWith('image/')) throw new Error('Sube una fotografía (JPG o PNG).');
  if (archivo.size > 15 * 1024 * 1024) throw new Error('La foto pesa más de 15 MB. Elige una más liviana.');
  const im = await cargarImagen(archivo);
  const k = Math.min(1, maximo / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.8), lienzo: c, orig: { w: im.naturalWidth, h: im.naturalHeight } };
}

/* ----- 4) Google Sheets (mediante Google Apps Script) ----- */
const CLAVE_PRUEBA = 'colitas_reportes_prueba';

function leerPrueba() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PRUEBA) || '[]'); } catch (e) { return []; }
}

function normalizar(f) {
  let paleta = f.paleta;
  if (typeof paleta === 'string') { try { paleta = JSON.parse(paleta); } catch (e) { paleta = []; } }
  return {
    id: String(f.id), tipo: f.tipo === 'gato' ? 'gato' : 'perro', tamano: TAMANOS.includes(f.tamano) ? f.tamano : '',
    distrito: f.distrito, lugar: f.lugar || '', fecha: String(f.fecha || '').slice(0, 10), nota: f.nota || '',
    collar: f.collar === true || f.collar === 'Sí' || f.collar === 'Si', nombre: f.nombre || '',
    telefono: String(f.telefono || '').replace(/\D/g, ''), foto: f.foto || '', paleta: Array.isArray(paleta) ? paleta : [],
    firma: parsearFirma(f.firma)      // null en los reportes antiguos: se comparan solo por paleta
  };
}

async function cargarReportes() {
  if (!COLITAS_API_URL) {
    const propios = leerPrueba().map(r => ({ ...r, firma: parsearFirma(r.firma) }));
    const ejemplos = reportesEjemplo();
    // los ejemplos están dibujados con colores por parte: se analizan igual que una maqueta
    await Promise.all(ejemplos.map(async r => {
      try { const a = await analizarMaqueta(r.tipo, r.colores, manchasComoTrazos(r.manchas)); r.paleta = a.paleta.length ? a.paleta : r.paleta; r.firma = parsearFirma(a.firma); }
      catch (e) { r.firma = null; }
    }));
    return { lista: [...propios, ...ejemplos], prueba: true };
  }
  const r = await fetch(COLITAS_API_URL + '?action=list&t=' + Date.now());
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'No pudimos cargar los reportes.');
  return { lista: j.reportes.map(normalizar), prueba: false };
}

async function enviarReporte(datos) {
  if (!COLITAS_API_URL) {
    const lista = leerPrueba();
    const { fotoDataUrl, web, coincidencias, ...resto } = datos;
    const id = 'local-' + Date.now();
    lista.unshift({ ...resto, id, foto: fotoDataUrl });
    if (coincidencias && coincidencias.length) {        // modo prueba: la notificación queda en este navegador (ver coincidencias.js)
      try {
        const previas = JSON.parse(localStorage.getItem('colitas_coincidencias_prueba') || '[]');
        const nuevas = coincidencias.map(c => ({ avisoId: c.avisoId, reporteId: id, pct: c.pct, fecha: fechaHace(0), foto: fotoDataUrl, distrito: datos.distrito, lugar: datos.lugar }));
        localStorage.setItem('colitas_coincidencias_prueba', JSON.stringify([...nuevas, ...previas].slice(0, 20)));
      } catch (e) { /* si no hay espacio, el reporte se guarda igual */ }
    }
    try { localStorage.setItem(CLAVE_PRUEBA, JSON.stringify(lista.slice(0, 10))); }
    catch (e) { throw new Error('No hay espacio para guardar la prueba en este navegador.'); }
    return { prueba: true };
  }
  // text/plain evita la verificación previa (CORS) que Apps Script no responde
  const r = await fetch(COLITAS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(datos) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'No pudimos guardar el reporte. Inténtalo otra vez.');
  return { prueba: false };
}

/* ----- 5) Reportes de ejemplo (solo mientras no esté conectado Google Sheets) ----- */
function fechaHace(dias) {
  const d = new Date(); d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function reportesEjemplo() {
  const base = [
    { id:'ej1', dias:0, tipo:'perro', tamano:'mediano', distrito:'Ventanilla', lugar:'Frente al mercado de Pachacútec', nota:'Collar rojo, muy tranquilo, se acercó a la gente.', collar:true,
      colores:{cuerpo:'#d9a441',cabeza:'#d9a441',oreja:'#b9812b',hocico:'#c48f36',cola:'#d9a441',pata:'#d9a441',anca:'#d9a441',ojo:'#3b2a1a'} },
    { id:'ej2', dias:1, tipo:'perro', tamano:'mediano', distrito:'Bellavista', lugar:'Cerca del parque de la Av. Sáenz Peña', nota:'Pelo corto, cola larga, parecía perdido y con sed.',
      colores:{cuerpo:'#d8b27a',cabeza:'#d8b27a',oreja:'#c49a5f',hocico:'#c9a165',cola:'#d8b27a',pata:'#d8b27a',anca:'#d8b27a',ojo:'#3b2a1a'} },
    { id:'ej3', dias:2, tipo:'perro', tamano:'grande', distrito:'Ventanilla', lugar:'Paradero de la Av. Pedro Beltrán', nota:'Muy amistoso, sin collar, orejas caídas.',
      colores:{cuerpo:'#e0a030',cabeza:'#e0a030',oreja:'#cf8f20',hocico:'#e0a030',cola:'#e0a030',pata:'#e8b650',anca:'#e0a030',ojo:'#2b1c10'} },
    { id:'ej4', dias:3, tipo:'perro', tamano:'mediano', distrito:'Callao', lugar:'Plaza Grau', nota:'Hocico oscuro y mirada atenta, anda solo.',
      colores:{cuerpo:'#b9833f',cabeza:'#b9833f',oreja:'#8a5a24',hocico:'#5b3b1e',cola:'#b9833f',pata:'#b9833f',anca:'#b9833f',ojo:'#2b1c10'} },
    { id:'ej5', dias:4, tipo:'perro', tamano:'grande', distrito:'La Perla', lugar:'Malecón Pardo, cerca de la bajada', nota:'Todo negro, collar azul, ladra poco.', collar:true,
      colores:{cuerpo:'#1f1f24',cabeza:'#1f1f24',oreja:'#1f1f24',hocico:'#3a3a42',cola:'#1f1f24',pata:'#1f1f24',anca:'#1f1f24',ojo:'#7a4b1a'} },
    { id:'ej6', dias:5, tipo:'perro', tamano:'pequeno', distrito:'Carmen de la Legua Reynoso', lugar:'Av. Néstor Gambetta, altura del grifo', nota:'Blanco con una oreja café, pequeño y juguetón.', manchas:'#8a5a24',
      colores:{cuerpo:'#ffffff',cabeza:'#ffffff',oreja:'#8a5a24',hocico:'#ffffff',cola:'#ffffff',pata:'#ffffff',anca:'#ffffff',ojo:'#2b1c10'} },
    { id:'ej7', dias:1, tipo:'gato', tamano:'mediano', distrito:'La Punta', lugar:'Cerca del muelle', nota:'Naranja con el pecho cremita, muy cariñoso.',
      colores:{cuerpo:'#e8742a',cabeza:'#e8742a',oreja:'#d9631a',hocico:'#f3e2bf',cola:'#e8742a',pata:'#e8742a',anca:'#e8742a',ojo:'#3f8f4f'} },
    { id:'ej8', dias:6, tipo:'gato', tamano:'pequeno', distrito:'Mi Perú', lugar:'Sector A, cerca del colegio', nota:'Gris, ojos amarillos, collar con cascabel.', collar:true,
      colores:{cuerpo:'#8d939c',cabeza:'#8d939c',oreja:'#6d737c',hocico:'#b9bec6',cola:'#8d939c',pata:'#8d939c',anca:'#8d939c',ojo:'#d6a21c'} }
  ];
  return base.map(b => ({ id:b.id, tipo:b.tipo, tamano:b.tamano, distrito:b.distrito, lugar:b.lugar, fecha:fechaHace(b.dias), nota:b.nota,
    collar:!!b.collar, nombre:'', telefono:'', foto:'', ejemplo:true, colores:b.colores, manchas:b.manchas || '',
    paleta:paletaDeColores(b.colores, b.manchas) }));
}

/* ----- 6) Tarjeta de cada reporte ----- */
const PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#e8212e" d="M12 1.5C7.6 1.5 4.2 4.9 4.2 9.2c0 5.6 6.4 12 7.2 12.8.3.3.7.3 1 0 .8-.8 7.2-7.2 7.2-12.8 0-4.3-3.4-7.7-7.6-7.7z"/><circle cx="12" cy="9.2" r="3.1" fill="#fff"/></svg>`;

function textoFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return '';
  const dias = Math.round((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - new Date(y, m - 1, d)) / 86400000);
  const larga = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '');
  if (dias <= 0) return 'Encontrado hoy';
  if (dias === 1) return 'Encontrado ayer';
  if (dias < 7) return `Encontrado hace ${dias} días`;
  return `Encontrado el ${larga}`;
}

/* las manchas de un reporte de ejemplo: unos toques de pincel del color indicado */
function manchasComoTrazos(color) {
  return color ? [[160,300],[205,330],[235,105],[130,365],[250,240]].map(p => ({ color, size: 26, pts: [p] })) : [];
}

function fichaReporte(r, pct, i) {
  const manchas = manchasComoTrazos(r.manchas);
  const foto = r.foto
    ? `<img src="${esc(r.foto)}" alt="${r.tipo} encontrado en ${esc(r.distrito)}" loading="lazy" referrerpolicy="no-referrer">`
    : mascotaSVG(r.tipo, r.colores, manchas, 'av' + esc(r.id), r.tamano || 'grande');
  const nivel = pct >= 70 ? 'alto' : pct >= 45 ? 'medio' : 'bajo';
  const etiqueta = pct === null ? '' : pct >= 65 ? 'Similitud visual' : pct >= 45 ? 'Posible coincidencia' : '';
  const q = encodeURIComponent(`${r.lugar}, ${r.distrito}, Callao, Perú`);
  const wa = r.telefono
    ? `<a class="contactar" href="https://wa.me/51${r.telefono}?text=${encodeURIComponent('Hola, vi tu reporte en Colitas Felices Callao. Creo que es mi mascota.')}" target="_blank" rel="noopener">Es mi mascota</a>`
    : '';
  return `<article class="ficha" id="reporte-${esc(r.id)}" style="animation-delay:${Math.min(i, 8) * .08}s">
    ${pct !== null && i === 0 && pct >= 45 ? '<span class="cinta">Más parecida</span>' : ''}
    <div class="foto-ficha">${foto}</div>
    <div class="info">
      <span class="zona">${r.distrito === 'Callao' ? 'Callao (Cercado)' : esc(r.distrito)}</span>
      <span class="fecha">${textoFecha(r.fecha)}</span>
      <span>${esc(r.lugar)}</span>
      <div class="chips">
        <span class="chip">${r.tipo === 'gato' ? '🐱 Gato' : '🐶 Perro'}</span>
        ${r.tamano ? `<span class="chip">${ETIQ[r.tamano]}</span>` : ''}
        ${r.collar ? '<span class="chip">Con collar</span>' : ''}
        ${r.ejemplo ? '<span class="chip chip-ejemplo">Ejemplo</span>' : ''}
      </div>
      ${r.nota ? `<span class="nota-av">${esc(r.nota)}</span>` : ''}
      <div class="pie-ficha">
        <a class="pin" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" title="Ver en el mapa" aria-label="Ver ${esc(r.lugar)} en el mapa">${PIN}</a>
        ${wa}
        ${pct !== null ? `<span class="porcentaje ${nivel}" title="${etiqueta || 'Similitud visual baja'}">${etiqueta ? etiqueta + ' · ' : ''}${pct}%</span>` : ''}
      </div>
    </div>
  </article>`;
}

/* aviso flotante (usa <div class="toast" id="toast"> de cada página) */
let temporizadorAviso;
function toast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('ver');
  clearTimeout(temporizadorAviso); temporizadorAviso = setTimeout(() => t.classList.remove('ver'), 2600);
}
