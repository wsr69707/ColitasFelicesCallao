/* ==========================================================
   FIRMA VISUAL v3: DÓNDE está cada color en la mascota (HTML5 Canvas API)
   Lo usan: reportar-mascota.html (al subir y encerrar la foto) y mascotas-perdidas-callao.html
   (foto o maqueta de quien busca). Necesita cargar antes: mascota-svg.js y reportes.js
   (reportes.js define FIRMA, los colores Lab y TODA la comparación).

   Aquí solo se EXTRAE información; comparar es trabajo de reportes.js.

   1) Segmentación guiada (segmentarGuiada): la elipse que dibuja la persona NO es una máscara. Sirve para
      saber dónde mirar: los colores de la foto se agrupan y un grupo es "animal" si casi todos sus píxeles caen
      dentro de la elipse y "fondo" si también abunda fuera (pasto, cielo, paredes), aunque la elipse sea holgada.
      Cada píxel recibe un PESO SUAVE de 0 a 1 (nada se borra de golpe). Las dudas conservan peso intermedio y las
      manchas sueltas lejos del animal pierden peso. Si la separación no es fiable,
      se usa solo la elipse (o el óvalo central si no hay elipse) con confianza baja.
   2) Descriptor: sobre el recuadro del animal se calcula una cuadrícula de 4 x 4 zonas. Cada zona guarda su
      color promedio, su confianza (1-9) y cuánto está "mezclada" (0-9: manchas, pelaje de dos tonos).
   3) Serialización compacta (columna `firma` de la hoja):
        3|origen|confianza|cx,cy,rx,ry,anchoOriginal,altoOriginal|zona,zona,... (16; "-" = sin información)
        zona = rrggbb + confianza + mezcla  (ej.: 5a3d2b82)
      origen: 0 foto, 1 maqueta. cx,cy,rx,ry: elipse en % de la foto (0 si no hubo). Las firmas v2
      (2|origen|16 colores) siguen leyéndose en reportes.js (parsearFirma).

   Canvas solo lee píxeles: NO reconoce razas, caras ni partes del cuerpo. La comparación es aproximada
   y se presenta como similitud visual, nunca como identificación.
   ========================================================== */

const ROI_DEFECTO = { cx: 0.5, cy: 0.5, rx: 0.42, ry: 0.42 };     // sin elipse: se mira el óvalo central
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

/* Reduce una imagen o canvas a unos 96 px y devuelve sus píxeles.
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

function elipseNormalizada(roi) {
  if (!roi || !(roi.rx > 0.02) || !(roi.ry > 0.02)) return null;
  return { cx: limitar(roi.cx, 0, 1), cy: limitar(roi.cy, 0, 1), rx: limitar(roi.rx, 0.03, 1), ry: limitar(roi.ry, 0.03, 1) };
}

/* Solo la elipse, con borde suave: lo que se usa cuando la separación por color no es fiable */
function pesosDeElipse(w, h, e) {
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot((x + 0.5 - e.cx * w) / (e.rx * w), (y + 0.5 - e.cy * h) / (e.ry * h));
    p[y * w + x] = r <= 1 ? 1 : r < 1.3 ? (1.3 - r) / 0.3 : 0;
  }
  return p;
}

/* ----- 1) Segmentación guiada: pesos de 0 a 1 + confianza (0 a 1) -----
   Idea: se agrupan TODOS los colores de la foto y, de cada grupo, se mira qué parte de sus píxeles cae dentro de la elipse.
   Un color de la mascota está casi todo dentro (aunque la elipse sea holgada); el pasto, el cielo o una pared también
   abundan FUERA, así que están "diluidos". Así no importa cuánto fondo quede dentro de una elipse imperfecta. */
function segmentarGuiada(rgba, w, h, e, guiada) {
  const N = w * h, ex = e.cx * w, ey = e.cy * h, ax = e.rx * w, ay = e.ry * h;
  const rho = new Float32Array(N).fill(9), lab = new Float32Array(N * 3), ok = new Uint8Array(N), pts = [];
  let nOk = 0, nElipse = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4; if (rgba[i + 3] < 128) continue;
    ok[p] = 1; nOk++;
    const l = rgbALab(rgba[i], rgba[i + 1], rgba[i + 2]); lab[p * 3] = l[0]; lab[p * 3 + 1] = l[1]; lab[p * 3 + 2] = l[2];
    const r = rho[p] = Math.hypot((x + 0.5 - ex) / ax, (y + 0.5 - ey) / ay);
    if (r <= 1) nElipse++;
    pts.push({ lab: l, rgb: [rgba[i], rgba[i + 1], rgba[i + 2]], w: 1 });
  }
  const respaldo = conf => ({ peso: pesosDeElipse(w, h, e), conf, respaldo: true });
  const cuota = nElipse / Math.max(1, nOk);                             // qué parte de la foto cubre la elipse
  if (nElipse < 30 || cuota > 0.8) return respaldo(0.1);                // elipse casi igual a la foto: no hay contraste que aprender

  const grupos = agruparColores(pts, 8, 0.01).map(c => ({ lab: labDe(c.hex), w: c.w, n: 0, dentro: 0, a: 0 }));
  const gDe = new Int16Array(N).fill(-1);
  for (let p = 0; p < N; p++) {
    if (!ok[p]) continue;
    const l = [lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]]; let bi = 0, bd = Infinity;
    grupos.forEach((g, i) => { const d = distLab(l, g.lab); if (d < bd) { bd = d; bi = i; } });
    gDe[p] = bi; grupos[bi].n++; if (rho[p] <= 1) grupos[bi].dentro++;
  }
  grupos.forEach(g => {                                                 // a = 1: color del animal; a = 0: color de fondo
    if (g.n < 8) return;
    const enDentro = g.dentro / g.n, enriq = enDentro / cuota;
    g.a = limitar((enriq - 1.15) / 0.85, 0, 1) * limitar((enDentro - 0.45) / 0.35, 0, 1);
  });
  /* Objetos externos (pelota, hueso, juguete, collar, correa): un color mucho más saturado que el pelaje dominante y que
     ocupa solo una parte pequeña del animal casi nunca es pelaje. Se marca como dudoso y su influencia baja mucho.
     No se recorta la boca: el hocico y la lengua siguen siendo del animal, solo que no mandan en la paleta. */
  const masa = g => g.dentro * g.a, croma = g => Math.hypot(g.lab[1], g.lab[2]);
  const dominante = grupos.reduce((m, g) => masa(g) > masa(m) ? g : m, grupos[0]), total = grupos.reduce((t, g) => t + masa(g), 0) || 1;
  grupos.forEach(g => { if (g !== dominante && g.a > 0.12 && croma(g) >= 45 && croma(g) > croma(dominante) + 15 && masa(g) / total < 0.15) { g.a = 0.12; g.ext = true; } });
  const fg = grupos.filter(g => g.a >= 0.5), fondoFirme = grupos.filter(g => g.a < 0.25 && g.n >= 8);
  if (!fg.length) return respaldo(0.1);                                 // ningún color destaca dentro de la elipse
  const hayEvidencia = fondoFirme.length > 0;

  const peso = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    if (!ok[p]) continue;
    const r = rho[p], g = grupos[gDe[p]], a = g.a;
    const geo = r <= 1 ? 1 : r < 1.8 ? 2 - r : 0;                       // cerca de la elipse cuenta más, pero no es un corte
    let v = geo * (0.05 + 0.95 * a);
    if (esColorAjeno([lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]]) && a < 0.6) v *= 0.3;   // verde, azul, rosado: pasto, cojín, juguete
    peso[p] = v;
  }
  // suavizado (3x3)
  const sua = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!ok[p]) continue;
    let s = 0, t = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; t++; s += peso[Y * w + X]; }
    sua[p] = s / t;
  }
  // piezas sueltas: lo que no toca el núcleo y es pequeño (rama, cojín, otro objeto) pierde peso, no se borra
  const pieza = new Int32Array(N).fill(-1), area = [], tocaNucleo = [];
  for (let p0 = 0; p0 < N; p0++) {
    if (sua[p0] < 0.5 || pieza[p0] >= 0) continue;
    const id = area.length, pila = [p0]; pieza[p0] = id; let n = 0, nuc = false;
    while (pila.length) {
      const p = pila.pop(), x = p % w, y = (p / w) | 0; n++; if (rho[p] <= 0.8 && sua[p] >= 0.8) nuc = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const q = Y * w + X; if (sua[q] >= 0.5 && pieza[q] < 0) { pieza[q] = id; pila.push(q); }
      }
    }
    area.push(n); tocaNucleo.push(nuc);
  }
  const mayor = Math.max(1, ...area);
  for (let p = 0; p < N; p++) { const id = pieza[p]; if (id >= 0 && !tocaNucleo[id] && area[id] < mayor * 0.12) sua[p] *= 0.15; }

  // confianza: ¿se separan bien animal y fondo?, ¿llena la elipse de forma razonable?, ¿se escapa mucho fuera de ella?
  let sep = 0, tw = 0;
  if (hayEvidencia) fg.forEach(f => { sep += Math.min(...fondoFirme.map(b => distLab(f.lab, b.lab))) * f.n; tw += f.n; });
  const sepS = hayEvidencia ? limitar((sep / (tw || 1) - 12) / 30, 0, 1) : 0.2;
  let nDentro = 0, selDentro = 0, sel = 0, fuera = 0;
  for (let p = 0; p < N; p++) {
    if (!ok[p]) continue;
    if (rho[p] <= 1) { nDentro++; if (sua[p] >= 0.5) selDentro++; }
    if (sua[p] >= 0.5) { sel++; if (rho[p] > 1.3) fuera++; }
  }
  const aS = limitar((selDentro / Math.max(1, nDentro) - 0.2) / 0.4, 0, 1);
  const fugaS = 1 - limitar(fuera / Math.max(1, sel) / 0.25, 0, 1);
  let conf = 0.45 * sepS + 0.3 * aS + 0.25 * fugaS;
  if (!guiada) conf *= 0.7;                                             // sin elipse del usuario hay menos certeza
  if (sel < 100 || conf < 0.15) return respaldo(Math.min(conf, 0.15));   // no es fiable: solo la elipse, con poca influencia
  return { peso: sua, conf, respaldo: false };
}

/* ----- 2) Pesos -> cuadrícula de 4 x 4 zonas ----- */
/* Recuadro que contiene el 97 % del peso (ignora algún píxel suelto) */
function cajaDePesos(peso, w, h) {
  const cx = new Float64Array(w), cy = new Float64Array(h); let t = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = peso[y * w + x]; if (v < 0.3) continue; cx[x] += v; cy[y] += v; t += v; }
  if (t < 40) return null;
  const q = (a, f) => { let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (s >= t * f) return i; } return a.length - 1; };
  return { x0: q(cx, 0.015), x1: q(cx, 0.985), y0: q(cy, 0.015), y1: q(cy, 0.985) };
}

/* rgba: píxeles. cuerpo: peso 0-1 de "esto es mascota" (define el recuadro y cuánto cubre cada zona).
   color: peso 0-1 de "esto tiene color propio" (en la maqueta, lo que se coloreó; en la foto es igual a cuerpo).
   Devuelve 16 zonas: { rgb, c: confianza 1-9, m: mezcla 0-9 } o null si la zona no tiene información fiable. */
function celdasDe(rgba, cuerpo, color, w, h, confSeg) {
  const caja = cajaDePesos(cuerpo, w, h), N = FIRMA.N, celdas = new Array(N * N).fill(null);
  if (!caja) return celdas;
  const bw = caja.x1 - caja.x0 + 1, bh = caja.y1 - caja.y0 + 1;
  const idx = (x, y) => Math.min(N - 1, Math.floor((y - caja.y0) / bh * N)) * N + Math.min(N - 1, Math.floor((x - caja.x0) / bw * N));
  const S = Array.from({ length: N * N }, () => [0, 0, 0, 0, 0]);       // cuerpo, color, r, g, b
  for (let y = caja.y0; y <= caja.y1; y++) for (let x = caja.x0; x <= caja.x1; x++) {
    const p = y * w + x, c = cuerpo[p]; if (c < 0.3) continue;
    const s = S[idx(x, y)], k = Math.min(c, color[p]); s[0] += c; s[1] += k;
    s[2] += rgba[p * 4] * k; s[3] += rgba[p * 4 + 1] * k; s[4] += rgba[p * 4 + 2] * k;
  }
  const areaCelda = (bw / N) * (bh / N), media = S.map(s => s[1] > 0 ? [s[2] / s[1], s[3] / s[1], s[4] / s[1]] : null);
  const mezcla = Array.from({ length: N * N }, () => [0, 0]);           // peso con color distinto del promedio, peso total
  for (let y = caja.y0; y <= caja.y1; y++) for (let x = caja.x0; x <= caja.x1; x++) {
    const p = y * w + x, k = Math.min(cuerpo[p], color[p]); if (k < 0.3) continue;
    const i = idx(x, y), mu = media[i]; if (!mu) continue;
    const d = distPelo(rgbALab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]), rgbALab(mu[0], mu[1], mu[2]));
    mezcla[i][1] += k; if (d > 30) mezcla[i][0] += k;
  }
  S.forEach((s, i) => {
    const cubierto = s[0] / areaCelda, coloreado = s[0] ? s[1] / s[0] : 0;
    if (!media[i] || cubierto < FIRMA.MIN_RELLENO || coloreado < 0.3) return;
    const c = limitar(cubierto / 0.7, 0, 1) * coloreado * (0.4 + 0.6 * confSeg);
    celdas[i] = { rgb: media[i], c: Math.max(1, Math.round(c * 9)), m: Math.round(9 * mezcla[i][0] / Math.max(1e-6, mezcla[i][1])) };
  });
  return celdas;
}

function serializarFirma(origen, d) {          // origen: 0 = foto, 1 = maqueta
  const r = d.roi, o = d.orig || {}, pc = v => Math.round(limitar(v, 0, 1) * 100);
  const cab = [r ? pc(r.cx) : 0, r ? pc(r.cy) : 0, r ? pc(r.rx) : 0, r ? pc(r.ry) : 0, Math.min(99999, o.w | 0), Math.min(99999, o.h | 0)].join(',');
  return `${FIRMA.VERSION}|${origen}|${Math.round(limitar(d.conf, 0, 1) * 9)}|${cab}|` +
    d.celdas.map(c => c ? rgbAHex(c.rgb[0], c.rgb[1], c.rgb[2]).slice(1) + c.c + c.m : '-').join(',');
}

/* Paleta del pelaje: solo cuentan los píxeles con peso suficiente (no todo lo que hay dentro de la elipse).
   Hasta 6 colores para no perder patrones (blanco + negro + gris, por ejemplo); cada uno pesa lo que ocupa. */
function paletaDePesos(data, w, h, peso, elipse, el) {
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = peso[i]; if (v < 0.4 || data[i * 4 + 3] < 128) continue;
    pts.push({ lab: rgbALab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), rgb: [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], w: v });
  }
  let paleta = pts.length >= 30 ? agruparColores(pts, 6, 0.03) : [];
  if (!paleta.length && el) { try { paleta = paletaDeImagen(el); } catch (err) { paleta = []; } }
  return paleta;
}

/* ----- 3) Foto -> { paleta, firma } -----
/* el: imagen o canvas ya reducido. roi: elipse del usuario { cx, cy, rx, ry } (0 a 1) o null. orig: { w, h } de la foto original. */
function describirFoto(el, roi, orig) {
  const { data, w, h } = pixelesReducidos(el, FIRMA.LADO_FOTO);
  const e = elipseNormalizada(roi), elipse = e || ROI_DEFECTO;
  let seg = null;
  try { seg = segmentarGuiada(data, w, h, elipse, !!e); } catch (err) { /* se usa la elipse sola */ }
  if (!seg) seg = { peso: pesosDeElipse(w, h, elipse), conf: 0.1 };
  const paleta = paletaDePesos(data, w, h, seg.peso, elipse, el);
  const celdas = celdasDe(data, seg.peso, seg.peso, w, h, seg.conf);
  const firma = celdas.filter(Boolean).length >= 3 ? serializarFirma(0, { celdas, conf: seg.conf, roi: e, orig }) : '';
  /* _cache: lo mínimo para corregir la firma sin volver a analizar la foto (ver reajustarFirma) */
  return { paleta, firma, _cache: { data, w, h, peso: seg.peso, conf: seg.conf, respaldo: !!seg.respaldo, roi: e, orig } };
}

/* Firma corregida: el usuario quitó colores de la paleta (no son del pelaje). Se baja el peso de los píxeles parecidos a
   esos colores y se vuelven a calcular SOLO las 16 zonas, con los datos que describirFoto ya dejó en _cache (no se analiza
   la foto otra vez). Los colores agregados a mano no tienen posición, así que no intervienen aquí.
   Devuelve el texto de la firma o null si no hay nada que corregir o no queda información fiable (se conserva la original). */
function reajustarFirma(cache, quitados, conservados) {
  if (!cache || !quitados || !quitados.length) return null;
  const { data, w, h, peso, conf, roi, orig } = cache, N = w * h, p2 = new Float32Array(peso), Q = quitados.map(labDe);
  const K = (conservados || []).map(labDe);
  for (let p = 0; p < N; p++) {
    if (p2[p] < 0.3) continue;
    const l = rgbALab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    const dq = Math.min(...Q.map(q => distLab(l, q))), dk = K.length ? Math.min(...K.map(k => distLab(l, k))) : Infinity;
    if (dq < 14 || dq < dk) p2[p] *= 0.1;       // se parece más a un color quitado que a uno conservado: influencia reducida, no borrado
  }
  const celdas = celdasDe(data, p2, p2, w, h, conf);
  return celdas.filter(Boolean).length >= 3 ? serializarFirma(0, { celdas, conf, roi, orig }) : null;
}

/* ----- 4) Maqueta: se dibuja en un canvas y se leen los píxeles que el usuario coloreó ----- */
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
  const cuerpo = new Float32Array(N), propio = new Float32Array(N), conteo = new Map();
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
  return { paleta, firma: serializarFirma(1, { celdas: celdasDe(d, cuerpo, propio, PLANO_W, PLANO_H, 1), conf: 1, roi: null, orig: null }) };
}
