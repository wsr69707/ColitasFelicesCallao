/* ==========================================================
   FIRMA VISUAL: DÓNDE está cada color en la mascota (HTML5 Canvas API)
   Lo usan: reportar-mascota.html (al subir la foto) y mascotas-perdidas-callao.html
   (foto o maqueta de quien busca). Necesita cargar antes: mascota-svg.js y reportes.js.

   Idea: además de "qué colores tiene", se guarda "en qué zona está cada uno".
   Se toma el centro de la foto (donde suele estar la mascota) o el dibujo de la maqueta, se
   encierra en un recuadro y se divide en una cuadrícula de 4 x 4 zonas; de cada zona se guarda
   su color promedio. Son 16 colores en un texto corto, por ejemplo:
       2|0|5a3d2b,5a3d2b,-,-,e8dcc8,e8dcc8,...
   (versión | origen: 0 foto, 1 maqueta | 16 zonas de izquierda a derecha y de arriba abajo;
   "-" = zona vacía o sin colorear).

   Antes de leer los colores se separa la mascota del fondo comparando el borde con el centro de la foto (ver segmentarMascota).

   Canvas solo lee píxeles. NO reconoce razas, caras ni partes del cuerpo, y tampoco separa a la
   mascota del fondo (se probó una separación por contraste y empeoraba los resultados: confundía
   cajas, cojines y peluches con la mascota). Por eso la comparación es aproximada y se presenta
   como "posibles coincidencias". Funciona mejor con fotos donde la mascota está al centro.
   ========================================================== */

const FIRMA = { N: 4, VERSION: 2, MIN_RELLENO: 0.25, LADO_FOTO: 80 };

/* Reduce una imagen o canvas a unos 80 px y devuelve sus píxeles.
   Se baja de a mitades: reducir una foto grande de golpe deja bordes dentados y colores falsos. */
function pixelesReducidos(el, maxLado) {
  const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
  const k = Math.min(1, maxLado / Math.max(w, h));
  const tw = Math.max(8, Math.round(w * k)), th = Math.max(8, Math.round(h * k));
  let fuente = el, sw = w, sh = h;
  while (sw / 2 >= tw && sh / 2 >= th) {
    const c = document.createElement('canvas'); c.width = Math.round(sw / 2); c.height = Math.round(sh / 2);
    c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height);
    fuente = c; sw = c.width; sh = c.height;
  }
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(fuente, 0, 0, tw, th);
  return { data: x.getImageData(0, 0, tw, th).data, w: tw, h: th };
}

/* ----- 1) Foto: se analiza el óvalo central (la mascota suele estar en el centro del encuadre) ----- */
function ovaloCentral(w, h) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (w * 0.42), dy = (y - h / 2) / (h * 0.42);
    m[y * w + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
  }
  return m;
}

/* Separa la mascota del fondo comparando dos muestras de la foto: el BORDE (casi siempre es fondo) y el CENTRO
   (casi siempre es la mascota). Cada píxel se asigna al grupo de color más parecido; lo que se parece al borde
   es fondo. Reglas para no borrar al animal:
   - un color del centro solo se considera fondo si domina claramente el borde (pasto que también está bajo el perro);
   - blanco, gris y negro nunca se tratan como fondo (una pared blanca y un perro blanco se confunden);
   - un color presente en ambos lados sin dominar el borde se queda con el animal.
   Después se suaviza el resultado. Si quedara muy poco, se usa la máscara original. */
function segmentarMascota(rgba, w, h, mascara) {
  const anillo = Math.max(2, Math.round(Math.min(w, h) * 0.07)), borde = [], centro = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (rgba[i + 3] < 128) continue;
    const enAnillo = x < anillo || x >= w - anillo || y < anillo || y >= h - anillo;
    const dx = (x - w / 2) / (w * 0.2), dy = (y - h / 2) / (h * 0.2);
    const p = { lab: rgbALab(rgba[i], rgba[i + 1], rgba[i + 2]), rgb: [rgba[i], rgba[i + 1], rgba[i + 2]], w: 1 };
    if (enAnillo) borde.push(p); else if (dx * dx + dy * dy <= 1) centro.push(p);
  }
  if (borde.length < 30 || centro.length < 30) return mascara;
  const fg = agruparColores(centro, 4).map(c => ({ lab: labDe(c.hex), w: c.w, fondo: false }));
  const bg = agruparColores(borde, 6).map(c => ({ lab: labDe(c.hex), w: c.w, fondo: true }));
  fg.forEach(f => {                         // un color del centro que domina el borde es fondo (pasto bajo el perro)
    const gemelo = bg.find(b => distLab(f.lab, b.lab) < 14);
    const neutro = Math.hypot(f.lab[1], f.lab[2]) < 14;   // blanco, gris o negro: puede ser pared o pelaje, se exige más evidencia
    if (gemelo && !neutro && gemelo.w > 1.5 * f.w) f.fondo = true;
  });
  // un color del borde que también está en el animal y no domina el borde es ambiguo (pared blanca / perro blanco): se queda con el animal
  const bgFirme = bg.filter(b => !fg.some(f => !f.fondo && distLab(f.lab, b.lab) < 14));
  const grupos = [...fg, ...bgFirme];
  let esF = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!mascara[p]) continue;
    const l = rgbALab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
    let bi = 0, bd = Infinity; grupos.forEach((g, i) => { const d = distLab(l, g.lab); if (d < bd) { bd = d; bi = i; } });
    esF[p] = grupos[bi].fondo ? 0 : 1;
  }
  for (let it = 0; it < 2; it++) {          // suavizado: cada punto toma lo que tenga la mayoría de sus vecinos
    const n = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (!mascara[p]) continue;
      let s = 0, t = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; t++; s += esF[Y * w + X]; }
      n[p] = s * 2 >= t ? 1 : 0;
    }
    esF = n;
  }
  // se descartan las manchas sueltas lejos del animal (ramas, cojines, juguetes): solo quedan las piezas grandes
  const pieza = new Int32Array(w * h).fill(-1), tamanos = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!esF[p0] || pieza[p0] >= 0) continue;
    const id = tamanos.length, pila = [p0]; pieza[p0] = id; let n = 0;
    while (pila.length) {
      const p = pila.pop(), x = p % w, y = (p / w) | 0; n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const q = Y * w + X; if (esF[q] && pieza[q] < 0) { pieza[q] = id; pila.push(q); }
      }
    }
    tamanos.push(n);
  }
  const mayor = Math.max(0, ...tamanos);
  for (let p = 0; p < w * h; p++) if (esF[p] && tamanos[pieza[p]] < mayor * 0.12) esF[p] = 0;
  let antes = 0, quedan = 0; for (let p = 0; p < w * h; p++) if (mascara[p]) { antes++; quedan += esF[p]; }
  return quedan >= antes * 0.15 && quedan >= 150 ? esF : mascara;
}

/* Quita de la máscara el fondo que se nota que NO es pelaje: pasto, cielo, paredes de color, cojines azules...
   Se aprende el color del borde de la foto y se borra lo que, partiendo del borde, tiene ese color y además
   es un color que un pelaje casi nunca tiene (verde, azul, violeta, rosado). Los fondos blancos, grises o
   cafés NO se tocan a propósito: no se pueden distinguir de un perro blanco, gris o café (así se evita borrar
   al animal). Si quedara muy poco, se descarta el recorte y se usa la máscara original. */
function quitarFondoColor(rgba, w, h, mascara) {
  const anillo = Math.max(2, Math.round(Math.min(w, h) * 0.06)), pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= anillo && x < w - anillo && y >= anillo && y < h - anillo) continue;
    const i = (y * w + x) * 4; if (rgba[i + 3] < 128) continue;
    pts.push({ lab: rgbALab(rgba[i], rgba[i + 1], rgba[i + 2]), rgb: [rgba[i], rgba[i + 1], rgba[i + 2]], w: 1 });
  }
  if (pts.length < 20) return mascara;
  const fondo = agruparColores(pts, 3).map(c => labDe(c.hex));
  const esFondo = new Uint8Array(w * h), pila = [];
  const parecidoAlFondo = p => {
    const i = p * 4, lab = rgbALab(rgba[i], rgba[i + 1], rgba[i + 2]);
    return esColorAjeno(lab) && Math.min(...fondo.map(f => distLab(lab, f))) < 18;
  };
  const meter = p => { if (!esFondo[p] && parecidoAlFondo(p)) { esFondo[p] = 1; pila.push(p); } };
  for (let x = 0; x < w; x++) { meter(x); meter((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { meter(y * w); meter(y * w + w - 1); }
  while (pila.length) {
    const p = pila.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) meter(p - 1); if (x < w - 1) meter(p + 1); if (y > 0) meter(p - w); if (y < h - 1) meter(p + w);
  }
  const nueva = new Uint8Array(w * h); let antes = 0, quedan = 0;
  for (let p = 0; p < w * h; p++) if (mascara[p]) { antes++; if (!esFondo[p]) { nueva[p] = 1; quedan++; } }
  return quedan >= antes * 0.4 && quedan >= 150 ? nueva : mascara;
}

/* Último filtro: dentro de lo que quedó, se descartan los píxeles de colores que un pelaje casi nunca tiene
   (verde, azul, rosado, naranja muy vivo: ramas, cojines, juguetes, collares). Si se llevara más de la mitad, no se aplica. */
function quitarColoresAjenos(rgba, mascara) {
  const nueva = new Uint8Array(mascara.length); let antes = 0, quedan = 0;
  for (let p = 0; p < mascara.length; p++) {
    if (!mascara[p]) continue; antes++;
    if (!esColorAjeno(rgbALab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]))) { nueva[p] = 1; quedan++; }
  }
  return quedan >= antes * 0.5 && quedan >= 150 ? nueva : mascara;
}

/* ----- 2) De una máscara a la cuadrícula de 4 x 4 zonas ----- */
/* rgba: píxeles; mascara: 1 = cuenta; propio (opcional): 1 = además tiene color propio (maqueta) */
function celdasDe(rgba, mascara, w, h, propio) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mascara[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const N = FIRMA.N, celdas = new Array(N * N).fill(null);
  if (x1 < 0) return celdas;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const suma = Array.from({ length: N * N }, () => [0, 0, 0, 0, 0]);   // r, g, b, con color, total
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = y * w + x; if (!mascara[p]) continue;
    const c = Math.min(N - 1, Math.floor((x - x0) / bw * N)), f = Math.min(N - 1, Math.floor((y - y0) / bh * N));
    const s = suma[f * N + c]; s[4]++;
    if (propio && !propio[p]) continue;
    s[0] += rgba[p * 4]; s[1] += rgba[p * 4 + 1]; s[2] += rgba[p * 4 + 2]; s[3]++;
  }
  const areaCelda = (bw / N) * (bh / N);
  suma.forEach((s, i) => {
    const cubierto = s[4] / areaCelda;                       // cuánto de la zona es mascota
    const coloreado = s[4] ? s[3] / s[4] : 0;                // cuánto de esa mascota tiene color
    if (s[3] && cubierto >= FIRMA.MIN_RELLENO && coloreado >= 0.3) celdas[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
  });
  return celdas;
}

function serializarFirma(origen, celdas) {      // origen: 0 = foto, 1 = maqueta
  return `${FIRMA.VERSION}|${origen}|` + celdas.map(c => c ? rgbAHex(c[0], c[1], c[2]).slice(1) : '-').join(',');
}

/* Foto (imagen o canvas) -> { paleta, firma }. paleta: colores del centro de la foto; firma: texto de 16 zonas. */
function analizarFoto(el) {
  const { data, w, h } = pixelesReducidos(el, FIRMA.LADO_FOTO);
  const mascara = quitarColoresAjenos(data, quitarFondoColor(data, w, h, segmentarMascota(data, w, h, ovaloCentral(w, h)))), pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mascara[i] || data[i * 4 + 3] < 128) continue;
    const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), r = data.subarray(i * 4, i * 4 + 3);
    pts.push({ lab: rgbALab(r[0], r[1], r[2]), rgb: [r[0], r[1], r[2]], w: 0.4 + Math.exp(-(dx * dx + dy * dy) / 0.9) });
  }
  const paleta = pts.length >= 30 ? agruparColores(pts, 4) : paletaDeImagen(el);
  return { paleta, firma: serializarFirma(0, celdasDe(data, mascara, w, h)) };
}

/* ----- 3) Maqueta: se dibuja en un canvas y se leen los píxeles que el usuario coloreó ----- */
function cargarSVG(svg) {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => mal(new Error('No pudimos leer la maqueta.'));
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/* Devuelve { paleta, firma }. La paleta sale de la superficie real que ocupa cada color
   (incluidas las manchas del pincel); las partes sin colorear no cuentan. */
async function analizarMaqueta(pet, fills, strokes) {
  const im = await cargarSVG(mascotaSVG(pet, fills, strokes || [], 'fm', 'grande', 'plano'));
  const c = document.createElement('canvas'); c.width = PLANO_W; c.height = PLANO_H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, PLANO_W, PLANO_H);
  const d = x.getImageData(0, 0, PLANO_W, PLANO_H).data, N = PLANO_W * PLANO_H;
  const cuerpo = new Uint8Array(N), propio = new Uint8Array(N), conteo = new Map();
  let total = 0;
  for (let i = 0; i < N; i++) {
    if (d[i * 4 + 3] < 200) continue;
    cuerpo[i] = 1;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (r > 245 && g < 10 && b > 245) continue;           // SIN_COLOR: parte que no se coloreó
    propio[i] = 1; total++;
    const k = (r << 16) | (g << 8) | b; conteo.set(k, (conteo.get(k) || 0) + 1);
  }
  const paleta = [...conteo.entries()].filter(([, n]) => n / total >= 0.012)
    .map(([k, n]) => ({ hex: rgbAHex(k >> 16, (k >> 8) & 255, k & 255), w: n / total })).sort((a, b) => b.w - a.w);
  return { paleta, firma: serializarFirma(1, celdasDe(d, cuerpo, PLANO_W, PLANO_H, propio)) };
}

/* ----- 4) Comparar dos firmas ----- */
/* Texto -> objeto listo para comparar (o null si no hay firma o no es válida: registros antiguos) */
function parsearFirma(s) {
  if (!s) return null;
  if (typeof s === 'object') return s.celdas ? s : null;
  const m = /^2\|([01])\|(.+)$/.exec(String(s));
  if (!m) return null;
  const partes = m[2].split(',');
  if (partes.length !== FIRMA.N * FIRMA.N) return null;
  const celdas = partes.map(p => /^[0-9a-fA-F]{6}$/.test(p) ? labDe('#' + p) : null);
  if (celdas.filter(Boolean).length < 3) return null;
  const filas = [];
  for (let f = 0; f < FIRMA.N; f++) {
    const v = celdas.slice(f * FIRMA.N, f * FIRMA.N + FIRMA.N).filter(Boolean);
    filas.push(v.length ? [0, 1, 2].map(j => v.reduce((a, c) => a + c[j], 0) / v.length) : null);
  }
  return { origen: +m[1], celdas, filas };
}

/* Distancia de color entre las zonas de dos firmas, mirando solo las zonas que ambas tienen.
   - Por filas (arriba / medio / abajo): casi no depende de la postura, separa "cabeza oscura y
     cuerpo claro" de "cabeza clara y cuerpo oscuro".
   - Por cuadrícula, también con la imagen volteada (la mascota puede mirar a un lado u otro).
   Devuelve la distancia, o null si no hay zonas suficientes para comparar. */
function distanciaRegional(A, B) {
  const N = FIRMA.N;
  let sf = 0, nf = 0;
  for (let f = 0; f < N; f++) if (A.filas[f] && B.filas[f]) { sf += distPelo(A.filas[f], B.filas[f]); nf++; }
  const dFilas = nf >= 2 ? sf / nf : null;
  let dCuadro = null;
  for (const voltear of [false, true]) {
    let s = 0, n = 0;
    for (let f = 0; f < N; f++) for (let c = 0; c < N; c++) {
      const a = A.celdas[f * N + c], b = B.celdas[f * N + (voltear ? N - 1 - c : c)];
      if (a && b) { s += distPelo(a, b); n++; }
    }
    if (n >= 4 && (dCuadro === null || s / n < dCuadro)) dCuadro = s / n;
  }
  if (dFilas === null && dCuadro === null) return null;
  const d = dFilas === null ? dCuadro : dCuadro === null ? dFilas : 0.55 * dFilas + 0.45 * dCuadro;
  return d;
}
