/* ==========================================================
   COINCIDENCIAS ENTRE REPORTES Y AVISOS DE BÚSQUEDA
   Lo usan: reportar-mascota.html (al publicar un reporte) y avisos-busqueda.html (lista y notificaciones).
   Necesita cargar antes: config.js, mascota-svg.js y reportes.js (reutiliza parecido, parsearFirma y normalizar).
   Contiene: avisos (lectura), comparación de fotos, y notificaciones para el dueño del aviso.
   ========================================================== */

const UMBRAL_COINCIDENCIA = 70;                 // se avisa solo si la similitud visual SUPERA este porcentaje
const CLAVE_AVISOS_PRUEBA = 'colitas_avisos_prueba';
const CLAVE_COINCIDENCIAS_PRUEBA = 'colitas_coincidencias_prueba';
const CLAVE_MIS_AVISOS = 'colitas_mis_avisos';  // avisos publicados desde este navegador: [{ id, nombre }]

const leerJSON = (clave, defecto) => { try { return JSON.parse(localStorage.getItem(clave) || 'null') || defecto; } catch (e) { return defecto; } };
const leerAvisosPrueba = () => leerJSON(CLAVE_AVISOS_PRUEBA, []);

/* ----- Avisos ----- */
function normalizarAviso(f) {
  let paleta = f.paleta;
  if (typeof paleta === 'string') { try { paleta = JSON.parse(paleta); } catch (e) { paleta = []; } }
  return {
    id: String(f.id), tipo: f.tipo === 'gato' ? 'gato' : 'perro', tamano: TAMANOS.includes(f.tamano) ? f.tamano : '',
    nombreMascota: f.nombreMascota || '', distrito: f.distrito || '', lugar: f.lugar || '',
    fecha: String(f.fecha || '').slice(0, 10), nota: f.nota || '',
    collar: f.collar === true || f.collar === 'Sí' || f.collar === 'Si', contacto: f.contacto || '',
    telefono: String(f.telefono || '').replace(/\D/g, ''), foto: f.foto || '',
    paleta: Array.isArray(paleta) ? paleta : [], firma: parsearFirma(f.firma)     // avisos sin firma se comparan solo por paleta
  };
}

async function cargarAvisos() {
  if (!COLITAS_API_URL) return { lista: leerAvisosPrueba().map(normalizarAviso), prueba: true };
  const r = await fetch(COLITAS_API_URL + '?action=avisos&t=' + Date.now());
  const j = await r.json();
  if (!j.ok || !Array.isArray(j.avisos)) throw new Error(j.error || 'El servicio de avisos aún no está actualizado.');
  return { lista: j.avisos.map(normalizarAviso), prueba: false };
}

function guardarMiAviso(id, nombre) {
  const mis = leerJSON(CLAVE_MIS_AVISOS, []).filter(x => x.id !== id);
  mis.unshift({ id, nombre: nombre || '' });
  try { localStorage.setItem(CLAVE_MIS_AVISOS, JSON.stringify(mis.slice(0, 10))); } catch (e) {}
}

/* ----- Comparación: se usa el mismo motor que la búsqueda (parecido), foto contra foto ----- */
/* rep: { tipo, tamano, paleta, firma (texto) } del reporte nuevo. Devuelve [{ avisoId, pct }] con pct > 70, de mayor a menor. */
async function buscarCoincidencias(rep) {
  if (!rep.paleta || !rep.paleta.length) return [];
  const { lista } = await cargarAvisos();
  const b = { tipo: rep.tipo, tamano: rep.tamano, paleta: rep.paleta, firma: parsearFirma(rep.firma), nota: '' };   // sin texto: solo parecido visual
  return lista.filter(a => a.paleta.length)
    .map(a => ({ avisoId: a.id, pct: parecido(b, { ...a, nota: '', _pp: undefined }) }))
    .filter(x => x.pct > UMBRAL_COINCIDENCIA)
    .sort((x, y) => y.pct - x.pct).slice(0, 5);
}

/* ----- Notificaciones para el dueño ----- */
function normalizarCoincidencia(c) {
  return { avisoId: String(c.avisoId), reporteId: String(c.reporteId), pct: Math.round(Number(c.pct) || 0), fecha: String(c.fecha || '').slice(0, 10),
    foto: c.foto || '', distrito: c.distrito || '', lugar: c.lugar || '' };
}

/* coincidencias de los avisos indicados (los publicados desde este navegador) */
async function cargarCoincidencias(ids) {
  if (!ids.length) return [];
  if (!COLITAS_API_URL) return leerJSON(CLAVE_COINCIDENCIAS_PRUEBA, []).filter(c => ids.includes(c.avisoId)).map(normalizarCoincidencia);
  const r = await fetch(COLITAS_API_URL + '?action=coincidencias&ids=' + encodeURIComponent(ids.join(',')) + '&t=' + Date.now());
  const j = await r.json();
  if (!j.ok || !Array.isArray(j.coincidencias)) return [];
  return j.coincidencias.map(normalizarCoincidencia);
}
