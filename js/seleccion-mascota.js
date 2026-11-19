/* ==========================================================
   SELECCIÓN DE LA MASCOTA EN LA FOTO (círculo / elipse aproximada)
   Lo usan: reportar-mascota.html (obligatoria) y mascotas-perdidas-callao.html (opcional).
   No necesita ninguna otra librería (Pointer Events: ratón, lápiz y pantalla táctil).

   El usuario arrastra sobre la foto para dibujar una elipse, la mueve o cambia su tamaño con las
   8 asas y la confirma. La elipse es SOLO una referencia aproximada: firma-visual.js la usa para
   saber dónde mirar, no como máscara (ver segmentarGuiada). La foto nunca se recorta ni se modifica.

   Modo mejorado (op.puntero = true; lo usa reportar-mascota.html): agrega un puntero circular propio (aro + insignia de
   elipse, solo con ratón o lápiz; en pantallas táctiles se usa el dedo), un velo que oscurece lo que queda fuera de la
   elipse, una pista sobre la foto, las asas visibles también después de confirmar y control con teclado (flechas, + / -, Enter).
   Sin esa opción la herramienta se comporta exactamente como antes (la usa mascotas-perdidas-callao.html).

   Uso:  const sel = SeleccionMascota.montar(imgElement, { obligatoria, puntero, onCambio });
         sel.obtener()  -> { cx, cy, rx, ry } normalizado (0 a 1, relativo a la foto) o null
         sel.reiniciar() al cambiar de foto
   ========================================================== */
const SeleccionMascota = (() => {
  const MIN = 0.08;                                   // tamaño mínimo de la elipse (fracción de la foto)
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const ASAS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  function montar(img, op = {}) {
    const obligatoria = op.obligatoria !== false, pro = op.puntero === true;
    const envoltorio = document.createElement('div'); envoltorio.className = 'sel-wrap';
    img.parentNode.insertBefore(envoltorio, img); envoltorio.appendChild(img);
    const capa = document.createElement('div'); capa.className = 'sel-capa';
    const elipse = document.createElement('div'); elipse.className = 'sel-elipse'; elipse.hidden = true;
    elipse.setAttribute('aria-label', 'Selección de la mascota');
    elipse.innerHTML = ASAS.map(h => `<i class="sel-asa sel-${h}" data-h="${h}"></i>`).join('');
    capa.appendChild(elipse); envoltorio.appendChild(capa);
    let vela, cursor, pista;
    if (pro) {
      envoltorio.classList.add('sel-pro'); capa.classList.add('con-puntero');
      vela = document.createElement('div'); vela.className = 'sel-vela'; vela.setAttribute('aria-hidden', 'true');
      envoltorio.insertBefore(vela, capa);                                   // oscurece lo que queda fuera de la elipse
      cursor = document.createElement('div'); cursor.className = 'sel-puntero'; cursor.hidden = true; cursor.setAttribute('aria-hidden', 'true');
      cursor.innerHTML = `<svg viewBox="0 0 44 44" width="44" height="44">
        <circle class="aro" cx="11" cy="11" r="8" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-width="5"/>
        <circle class="aro" cx="11" cy="11" r="8" fill="none" stroke="#5DB7E0" stroke-width="2.5"/>
        <circle cx="11" cy="11" r="1.8" fill="#F28C28"/>
        <g class="insignia"><circle cx="32" cy="32" r="10" fill="#F28C28" stroke="#fff" stroke-width="2"/>
        <ellipse cx="32" cy="32" rx="6.2" ry="4" fill="none" stroke="#fff" stroke-width="1.8" transform="rotate(-25 32 32)"/></g></svg>`;
      envoltorio.appendChild(cursor);
      pista = document.createElement('div'); pista.className = 'sel-pista';
      pista.textContent = 'Arrastra sobre la foto para rodear a tu mascota'; envoltorio.appendChild(pista);
      elipse.tabIndex = 0; elipse.setAttribute('role', 'group');
      elipse.setAttribute('aria-label', 'Selección de la mascota. Flechas para mover, más y menos para cambiar el tamaño, ');
    }

    const barra = document.createElement('div'); barra.className = 'sel-barra';
    barra.innerHTML = `<p class="sel-msg" role="status"></p>
      <div class="sel-botones">
        <button type="button" class="herr suave" data-a="borrar">↺ Volver a dibujar</button>
        ${pro ? '' : '<button type="button" class="herr" data-a="confirmar" disabled>✓ Confirmar selección</button>'}
        ${obligatoria ? '<button type="button" class="sel-omitir" data-a="omitir">Omitir este paso</button>' : ''}
      </div>`;
    envoltorio.after(barra);
    const msg = barra.querySelector('.sel-msg'), bConf = barra.querySelector('[data-a=confirmar]') || { disabled: false, textContent: '' };   // en modo mejorado no hay botón: se confirma sola

    let caja = null, confirmada = false, omitida = false, gesto = null;

    const textos = {
      vacio: 'Arrastra el dedo o el ratón sobre la foto para rodear a la mascota.',
      ajustar: 'Muévela o cambia su tamaño con los puntos. Cuando incluya todo su cuerpo, confirma.',
      listo: pro ? 'Listo. Si quieres corregirla, muévela o cambia su tamaño con los puntos.' : 'Selección confirmada. Si quieres corregirla, toca la elipse y ajústala.',
      omitida: 'Paso omitido: la búsqueda será menos precisa.'
    };

    function pintar() {
      elipse.hidden = !caja;
      if (caja) {
        elipse.style.left = caja.x0 * 100 + '%'; elipse.style.top = caja.y0 * 100 + '%';
        elipse.style.width = (caja.x1 - caja.x0) * 100 + '%'; elipse.style.height = (caja.y1 - caja.y0) * 100 + '%';
      }
      elipse.classList.toggle('lista', confirmada);
      bConf.disabled = !caja || confirmada;
      bConf.textContent = confirmada ? '✓ Confirmada' : '✓ Confirmar selección';
      if (pro) {
        vela.style.background = caja
          ? `radial-gradient(ellipse ${(caja.x1 - caja.x0) * 50}% ${(caja.y1 - caja.y0) * 50}% at ${(caja.x0 + caja.x1) * 50}% ${(caja.y0 + caja.y1) * 50}%, transparent 99.3%, rgba(30,35,40,.42) 100%)`
          : 'none';
        pista.hidden = !!caja || !!gesto;
      }
      msg.textContent = omitida ? textos.omitida : !caja ? textos.vacio : confirmada ? textos.listo : textos.ajustar;
    }
    const avisar = () => { if (op.onCambio) op.onCambio(obtener(), confirmada); };
    const punto = e => {
      const r = envoltorio.getBoundingClientRect();
      return [lim((e.clientX - r.left) / r.width, 0, 1), lim((e.clientY - r.top) / r.height, 0, 1)];
    };

    /* Puntero propio: solo con ratón o lápiz. Sobre la elipse y sus asas se deja el cursor normal (mover / cambiar tamaño). */
    function moverPuntero(e) {
      if (!pro) return;
      const r = envoltorio.getBoundingClientRect(), dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const libre = gesto ? gesto.tipo === 'nueva' : !(e.target.closest && e.target.closest('.sel-elipse'));
      const ver = e.pointerType !== 'touch' && dentro && libre;
      cursor.hidden = !ver;
      if (ver) cursor.style.transform = `translate(${e.clientX - r.left - 11}px, ${e.clientY - r.top - 11}px)`;
      envoltorio.classList.toggle('activa', e.pointerType !== 'touch' && dentro);
    }
    if (pro) {
      capa.addEventListener('pointerenter', moverPuntero);
      capa.addEventListener('pointerleave', e => { if (!gesto) { cursor.hidden = true; envoltorio.classList.remove('activa'); } });
    }

    capa.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const [x, y] = punto(e), asa = e.target.closest('[data-h]'), dentro = e.target.closest('.sel-elipse');
      omitida = false;
      if (asa && caja) gesto = { tipo: 'asa', h: asa.dataset.h };
      else if (dentro && caja) gesto = { tipo: 'mover', dx: x - caja.x0, dy: y - caja.y0, w: caja.x1 - caja.x0, h: caja.y1 - caja.y0 };
      else { gesto = { tipo: 'nueva', x, y }; caja = null; }
      confirmada = false;
      if (pro) { envoltorio.classList.toggle('dibujando', gesto.tipo === 'nueva'); moverPuntero(e); }
      capa.setPointerCapture(e.pointerId); e.preventDefault();
    });
    capa.addEventListener('pointermove', e => {
      moverPuntero(e);
      if (!gesto) return;
      const [x, y] = punto(e);
      if (gesto.tipo === 'nueva') {
        caja = { x0: Math.min(gesto.x, x), y0: Math.min(gesto.y, y), x1: Math.max(gesto.x, x), y1: Math.max(gesto.y, y) };
      } else if (gesto.tipo === 'mover') {
        const x0 = lim(x - gesto.dx, 0, 1 - gesto.w), y0 = lim(y - gesto.dy, 0, 1 - gesto.h);
        caja = { x0, y0, x1: x0 + gesto.w, y1: y0 + gesto.h };
      } else {
        const h = gesto.h, c = { ...caja };
        if (h.includes('w')) c.x0 = Math.min(x, c.x1 - MIN);
        if (h.includes('e')) c.x1 = Math.max(x, c.x0 + MIN);
        if (h.includes('n')) c.y0 = Math.min(y, c.y1 - MIN);
        if (h.includes('s')) c.y1 = Math.max(y, c.y0 + MIN);
        caja = c;
      }
      pintar();
    });
    const soltar = e => {
      if (!gesto) return;
      gesto = null;
      if (pro) { envoltorio.classList.remove('dibujando'); if (e) moverPuntero(e); }
      if (caja && (caja.x1 - caja.x0 < MIN || caja.y1 - caja.y0 < MIN)) caja = null;   // un toque suelto no es una selección
      if (pro && caja) confirmada = true;                                 // modo mejorado: al terminar de dibujar o ajustar, queda confirmada
      pintar(); avisar();
    };
    capa.addEventListener('pointerup', soltar);
    capa.addEventListener('pointercancel', soltar);

    if (pro) elipse.addEventListener('keydown', e => {
      if (!caja) return;
      const w = caja.x1 - caja.x0, h = caja.y1 - caja.y0; let dx = 0, dy = 0, k = 1;
      if (e.key === 'ArrowLeft') dx = -0.02; else if (e.key === 'ArrowRight') dx = 0.02;
      else if (e.key === 'ArrowUp') dy = -0.02; else if (e.key === 'ArrowDown') dy = 0.02;
      else if (e.key === '+' || e.key === '=') k = 1.06; else if (e.key === '-') k = 1 / 1.06;
      else if (e.key === 'Enter') { e.preventDefault(); api.confirmar(); return; } else return;
      e.preventDefault();
      const nw = Math.min(1, w * k), nh = Math.min(1, h * k);
      const x0 = lim((caja.x0 + caja.x1) / 2 + dx - nw / 2, 0, 1 - nw), y0 = lim((caja.y0 + caja.y1) / 2 + dy - nh / 2, 0, 1 - nh);
      caja = { x0, y0, x1: x0 + nw, y1: y0 + nh }; confirmada = true; omitida = false; pintar(); avisar();
    });

    function obtener() {
      return caja ? { cx: (caja.x0 + caja.x1) / 2, cy: (caja.y0 + caja.y1) / 2, rx: (caja.x1 - caja.x0) / 2, ry: (caja.y1 - caja.y0) / 2 } : null;
    }
    const api = {
      obtener,
      get confirmada() { return confirmada; },
      get omitida() { return omitida; },
      confirmar() { if (caja) { confirmada = true; pintar(); avisar(); } },
      reiniciar() { caja = null; confirmada = false; omitida = false; gesto = null; pintar(); },
      mostrar(v) { envoltorio.hidden = barra.hidden = !v; }
    };
    barra.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'borrar') { api.reiniciar(); avisar(); }
      else if (a.dataset.a === 'confirmar') api.confirmar();
      else if (a.dataset.a === 'omitir') { caja = null; confirmada = false; omitida = true; pintar(); avisar(); }
    });
    pintar();
    return api;
  }
  return { montar };
})();
