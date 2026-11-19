/**
 * FELICES COLITAS CALLAO - Reportes de mascotas encontradas
 * Guarda los reportes en una hoja de cálculo de Google y las fotos en Google Drive.
 *
 * Cómo usarlo (los pasos completos están en el README.md del proyecto):
 *   1. Abre tu hoja de cálculo de Google > Extensiones > Apps Script y pega este archivo.
 *   2. Ejecuta una vez la función "configurar" y acepta los permisos (crea las pestañas que falten sin tocar tus datos).
 *   3. Implementar > Nueva implementación > Aplicación web
 *        Ejecutar como: Yo      Quién tiene acceso: Cualquier persona
 *   4. Copia la URL que termina en /exec y pégala en js/config.js (COLITAS_API_URL).
 */

var NOMBRE_HOJA = 'Reportes';
var NOMBRE_AVISOS = 'Avisos';            // avisos de búsqueda de mascotas perdidas
var NOMBRE_COINCIDENCIAS = 'Coincidencias'; // posibles coincidencias entre un reporte nuevo y un aviso de búsqueda
var URL_SITIO = '';                      // dirección de tu página (ej. https://tusitio.org). Va en el correo de aviso; si está vacía, el correo no lleva enlace
var NOMBRE_USUARIOS = 'Usuarios';        // cuentas (la contraseña se guarda solo como huella con sal, nunca en texto)
var NOMBRE_SESIONES = 'Sesiones';        // sesiones iniciadas (se guarda la huella del código, no el código)
var NOMBRE_MOVIMIENTOS = 'Movimientos';  // historial de ColiCoins (ganados y gastados)
var NOMBRE_PRODUCTOS = 'Productos';      // catálogo de la Tienda Solidaria (edítalo aquí: nombre, precios, stock, imagen)
var NOMBRE_PEDIDOS = 'Pedidos';          // compras en dinero y canjes con ColiCoins
var NOMBRE_CONFIG = 'Configuracion';      // pestaña de ajustes (clave | valor | descripcion). No guarda datos personales ni claves.
// Valores por defecto de Configuracion. Se crean solo si faltan: nunca se sobrescribe lo que ya cambiaste a mano.
var CONFIG_INICIAL = [
  ['version_sistema', '3.1', 'Versión de la estructura del libro'],
  ['version_descriptor', '3', 'Versión de la firma visual que escribe la página (columna firma de Reportes; se leen v2 y v3)'],
  ['max_reportes_lista', '200', 'Máximo de reportes que se envían a la página'],
  ['filas_a_leer', '400', 'Cuántas de las últimas filas de Reportes se leen en cada consulta'],
  ['max_por_hora', '5', 'Reportes que puede publicar un mismo celular en una hora'],
  ['coicoins_por_reencuentro', '200', 'ColiCoins que recibe quien reportó una mascota cuando escribes "Reencontrado" en el estado de su reporte'],
  ['max_sin_celular_por_hora', '30', 'Reportes sin celular que se aceptan en total por hora (no hay un celular con qué limitar a cada persona)']
];
var NOMBRE_CARPETA = 'Colitas Felices - Fotos de reportes';
// "firma" (columna O) guarda la firma visual versionada (v2 o v3). Va al final para no mover las demás.
var COLUMNAS = ['id', 'creado', 'fecha_hallazgo', 'tipo', 'tamano', 'distrito', 'lugar',
                'descripcion', 'collar', 'nombre', 'telefono', 'foto', 'paleta', 'estado', 'firma', 'correcciones', 'usuario'];

// Columnas de la pestaña Avisos (avisos de búsqueda)
var COLUMNAS_AVISOS = ['id', 'creado', 'fecha_perdida', 'tipo', 'tamano', 'distrito', 'lugar', 'nombre_mascota',
                       'descripcion', 'collar', 'contacto', 'telefono', 'foto', 'estado', 'paleta', 'firma', 'correo'];
var COLUMNAS_COINCIDENCIAS = ['creado', 'aviso_id', 'reporte_id', 'porcentaje', 'foto', 'distrito', 'lugar', 'estado'];
var UMBRAL_COINCIDENCIA = 70;           // se registra solo si la similitud SUPERA este porcentaje

// Solo distritos del Callao
var DISTRITOS = ['Bellavista', 'Callao', 'Carmen de la Legua Reynoso', 'La Perla', 'La Punta', 'Mi Perú', 'Ventanilla'];
var TIPOS = ['perro', 'gato'];
var TAMANOS = ['pequeno', 'mediano', 'grande'];
var MAX_FOTO_BYTES = 3 * 1024 * 1024;   // 3 MB (la página envía fotos de unos 200 KB)
// MAX_REPORTES_LISTA, FILAS_A_LEER y MAX_POR_HORA ahora se leen de la pestaña Configuracion (config_)

/* ----------------------------------------------------------
   Preparación (se ejecuta una sola vez a mano)
   ---------------------------------------------------------- */
function configurar() {
  var hoja = obtenerHoja_();
  actualizarEncabezados_(hoja);      // agrega la columna "firma" si tu hoja es anterior a esta versión
  hojaConfig_();                     // crea la pestaña Configuracion y sus valores si faltan
  obtenerHojaAvisos_();              // crea la pestaña Avisos (y le agrega las columnas nuevas) si falta
  obtenerHojaCoincidencias_();       // crea la pestaña Coincidencias si falta
  MailApp.getRemainingDailyQuota();  // pide el permiso para enviar correos
  hojaUsuarios_(); hojaSesiones_(); hojaMovimientos_(); hojaPedidos_(); sembrarProductos_();   // Tienda Solidaria y cuentas de aviso
  carpetaFotos_();
  Logger.log('Listo. Pestañas: "' + NOMBRE_HOJA + '" y "' + NOMBRE_CONFIG + '". No se borró ni modificó ningún reporte. Ahora implementa como aplicación web.');
}

// Lee un ajuste de la pestaña Configuracion (número). Si falta o no es válido, usa el valor por defecto.
function config_(clave, defecto) {
  try {
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_CONFIG);
    if (!hoja || hoja.getLastRow() < 2) return defecto;
    var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][0]) === clave) { var n = Number(filas[i][1]); return isFinite(n) && n > 0 ? n : defecto; }
    }
  } catch (e) { /* se usa el valor por defecto */ }
  return defecto;
}

function hojaConfig_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(NOMBRE_CONFIG);
  if (!hoja) hoja = libro.insertSheet(NOMBRE_CONFIG);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, 3).setValues([['clave', 'valor', 'descripcion']]).setFontWeight('bold').setBackground('#F28C28').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
  }
  var existentes = {};
  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().forEach(function (f) { existentes[String(f[0])] = true; });
  var nuevas = CONFIG_INICIAL.filter(function (f) { return !existentes[f[0]]; });
  if (nuevas.length) hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas);
  return hoja;
}

/* ----------------------------------------------------------
   GET: la página pide la lista de reportes
   ---------------------------------------------------------- */
function doGet(e) {
  try {
    var accion = e && e.parameter && e.parameter.action;
    if (accion === 'productos') return respuesta_({ ok: true, productos: listarProductos_() });
    if (accion === 'avisos') return respuesta_({ ok: true, avisos: listarAvisos_() });
    if (accion === 'coincidencias') return respuesta_({ ok: true, coincidencias: listarCoincidencias_(String(e.parameter.ids || '')) });
    if (accion !== 'list') return respuesta_({ ok: true, mensaje: 'Colitas Felices Callao: servicio de reportes activo.' });
    return respuesta_({ ok: true, reportes: listarReportes_() });
  } catch (err) {
    return respuesta_({ ok: false, error: 'No pudimos cargar los reportes.' });
  }
}

function listarReportes_() {
  var hoja = obtenerHoja_();
  var ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  var zona = Session.getScriptTimeZone(), maxLista = config_('max_reportes_lista', 200);
  var primera = Math.max(2, ultima - config_('filas_a_leer', 400) + 1);        // solo las filas más recientes
  var filas = hoja.getRange(primera, 1, ultima - primera + 1, COLUMNAS.length).getValues();
  var lista = [];
  for (var i = filas.length - 1; i >= 0 && lista.length < maxLista; i--) {
    var f = filas[i];
    var estado = String(f[13] || 'Activo').toLowerCase();
    if (estado !== 'activo') continue;           // "Reencontrado" u otros: no se muestran
    if (!f[0] || !f[11]) continue;
    lista.push({
      id: String(f[0]),
      fecha: fechaTexto_(f[2], zona),
      tipo: String(f[3]), tamano: String(f[4]), distrito: String(f[5]), lugar: String(f[6]),
      nota: String(f[7]), collar: String(f[8]) === 'Sí', nombre: String(f[9]),
      telefono: String(f[10]).replace(/\D/g, ''), foto: String(f[11]), paleta: String(f[12]),
      firma: String(f[14] || '')                   // vacía en los reportes antiguos: la página los compara solo por colores
    });
  }
  return lista;
}

function fechaTexto_(valor, zona) {
  if (valor instanceof Date) return Utilities.formatDate(valor, zona, 'yyyy-MM-dd');
  return String(valor).substring(0, 10);
}

/* ----------------------------------------------------------
   POST: la página envía un reporte nuevo
   ---------------------------------------------------------- */
function doPost(e) {
  var bloqueo = LockService.getScriptLock();
  try {
    var d = JSON.parse(e.postData.contents);

    // Campo trampa: los programas automáticos lo rellenan; se ignora sin avisar
    if (d.web) return respuesta_({ ok: true });
    if (d.registro === 'aviso') return procesarAviso_(d, bloqueo);
    if (d.registro && ACCIONES_CUENTA[d.registro]) return ACCIONES_CUENTA[d.registro](d, bloqueo);   // cuentas y tienda     // aviso de búsqueda (pestaña Avisos)

    var error = validar_(d);
    if (error) return respuesta_({ ok: false, error: error });

    bloqueo.waitLock(20000);
    if (superaLimite_(d.telefono)) {
      return respuesta_({ ok: false, error: 'Ya enviaste varios reportes. Inténtalo de nuevo en una hora.' });
    }

    var id = Utilities.getUuid().substring(0, 8);
    var urlFoto = guardarFoto_(d.fotoDataUrl, id);
    var hoja = obtenerHoja_();
    hoja.appendRow([
      id, new Date(), d.fecha, d.tipo, d.tamano, d.distrito, limpiar_(d.lugar, 120),
      limpiar_(d.nota, 200), d.collar ? 'Sí' : 'No', limpiar_(d.nombre, 40), String(d.telefono || ''),
      urlFoto, JSON.stringify(paletaSegura_(d.paleta)), 'Activo', firmaSegura_(d.firma), correccionesSeguras_(d.correcciones),
      usuarioDeToken_(d.token)      // vacío si no había sesión: solo los reportes con cuenta pueden ganar ColiCoins
    ]);
    try { registrarCoincidencias_(d.coincidencias, id, urlFoto, d); } catch (x) { /* el reporte ya quedó publicado; la notificación es un extra */ }
    return respuesta_({ ok: true, id: id });
  } catch (err) {
    return respuesta_({ ok: false, error: 'No pudimos guardar el reporte. Inténtalo otra vez.' });
  } finally {
    try { bloqueo.releaseLock(); } catch (x) { /* no tenía el bloqueo */ }
  }
}

function validar_(d) {
  if (!d || typeof d !== 'object') return 'Datos incompletos.';
  if (TIPOS.indexOf(d.tipo) < 0) return 'Elige si es perro o gato.';
  if (d.tamano && TAMANOS.indexOf(d.tamano) < 0) return 'El tamaño no es válido.';       // el tamaño es opcional
  if (DISTRITOS.indexOf(d.distrito) < 0) return 'Solo recibimos reportes de distritos del Callao.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) return 'La fecha no es válida.';
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (d.fecha > hoy) return 'La fecha no puede ser futura.';
  if (d.telefono && !/^9\d{8}$/.test(String(d.telefono))) return 'El celular debe tener 9 dígitos y empezar con 9.';   // el celular es opcional
  var m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/.exec(String(d.fotoDataUrl || ''));
  if (!m) return 'La foto no es válida.';
  if (m[2].length * 0.75 > MAX_FOTO_BYTES) return 'La foto es demasiado pesada.';
  return null;
}

// Quita el "=" y símbolos que Google Sheets leería como fórmula y recorta el largo
function limpiar_(texto, max) {
  var t = String(texto || '').replace(/[\r\n]+/g, ' ').trim().substring(0, max);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function paletaSegura_(paleta) {
  var salida = [];
  (Array.isArray(paleta) ? paleta : []).slice(0, 6).forEach(function (c) {
    if (c && /^#[0-9a-fA-F]{6}$/.test(c.hex) && typeof c.w === 'number') {
      var item = { hex: c.hex.toLowerCase(), w: Math.round(c.w * 1000) / 1000 };
      if (c.o === 'm') item.o = 'm';           // color agregado a mano por la persona (si falta, es detectado)
      salida.push(item);
    }
  });
  return salida;
}

// Correcciones que hizo la persona: elipse (cx,cy,rx,ry en %), si la confirmó, colores quitados y colores agregados.
// Solo se guarda lo que calza con el formato esperado; si no, queda vacío y el reporte se publica igual.
function correccionesSeguras_(c) {
  if (!c || typeof c !== 'object') return '';
  var hexes = function (a) { return (Array.isArray(a) ? a : []).filter(function (h) { return /^#[0-9a-fA-F]{6}$/.test(h); }).slice(0, 6).map(function (h) { return h.toLowerCase(); }); };
  var e = (Array.isArray(c.e) ? c.e : []).slice(0, 4).map(function (n) { return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); });
  return JSON.stringify({ v: 1, e: e.length === 4 ? e : [], c: c.c ? 1 : 0, q: hexes(c.q), m: hexes(c.m) });
}

// La firma guarda dónde está cada color de la mascota. Se aceptan dos versiones (si no calza, se guarda vacía y
// el reporte igual se publica: se compara por su paleta):
//   v3: "3|origen|confianza|cx,cy,rx,ry,ancho,alto|zona x16"  con zona = rrggbb + confianza(1-9) + mezcla(0-9), o "-"
//   v2: "2|origen|color x16"                                  con color = rrggbb, o "-"  (reportes antiguos)
var RE_FIRMA_V3 = /^3\|[01]\|\d\|\d{1,3},\d{1,3},\d{1,3},\d{1,3},\d{1,5},\d{1,5}\|(?:[0-9a-f]{6}[1-9]\d|-)(?:,(?:[0-9a-f]{6}[1-9]\d|-)){15}$/;
var RE_FIRMA_V2 = /^2\|[01]\|(?:[0-9a-f]{6}|-)(?:,(?:[0-9a-f]{6}|-)){15}$/;
function firmaSegura_(firma) {
  var t = String(firma || '').toLowerCase();
  return (t.length <= 260 && (RE_FIRMA_V3.test(t) || RE_FIRMA_V2.test(t))) ? t : '';
}

function superaLimite_(telefono, prefijo) {
  var cache = CacheService.getScriptCache();
  var clave = telefono ? (prefijo || 'rep_') + telefono : 'rep_sin_celular';
  var maximo = telefono ? config_('max_por_hora', 5) : config_('max_sin_celular_por_hora', 30);
  var n = Number(cache.get(clave) || 0);
  if (n >= maximo) return true;
  cache.put(clave, String(n + 1), 3600);
  return false;
}

/* ----------------------------------------------------------
   Hoja y Drive
   ---------------------------------------------------------- */
function obtenerHoja_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(NOMBRE_HOJA);
  if (!hoja) hoja = libro.insertSheet(NOMBRE_HOJA);
  if (hoja.getLastRow() > 0 && String(hoja.getRange(1, COLUMNAS.length).getValue()) !== COLUMNAS[COLUMNAS.length - 1]) actualizarEncabezados_(hoja);   // hoja anterior: agrega "usuario"
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold').setBackground('#F28C28').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.getRange('C:C').setNumberFormat('@');   // fecha como texto (aaaa-mm-dd)
    hoja.getRange('K:K').setNumberFormat('@');   // celular como texto
    hoja.getRange('O:O').setNumberFormat('@');   // firma como texto
  }
  return hoja;
}

// Para hojas creadas con la versión anterior: agrega el encabezado "firma" (columna O) sin tocar los datos.
function actualizarEncabezados_(hoja) {
  var n = COLUMNAS.length;
  var encabezado = hoja.getRange(1, 1, 1, n).getValues()[0];
  if (String(encabezado[n - 1]) !== COLUMNAS[n - 1]) {
    hoja.getRange(1, n).setValue(COLUMNAS[n - 1]).setFontWeight('bold').setBackground('#F28C28').setFontColor('#ffffff');
  }
  hoja.getRange('O:O').setNumberFormat('@');
}

function carpetaFotos_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_FOTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se vuelve a crear */ } }
  var carpeta = DriveApp.createFolder(NOMBRE_CARPETA);
  props.setProperty('CARPETA_FOTOS', carpeta.getId());
  return carpeta;
}

function guardarFoto_(dataUrl, id, prefijo) {
  var m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl);
  var tipo = m[1] === 'png' ? 'image/png' : 'image/jpeg';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), tipo, (prefijo || 'reporte') + '-' + id + (m[1] === 'png' ? '.png' : '.jpg'));
  var archivo = carpetaFotos_().createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + archivo.getId() + '&sz=w800';
}

function respuesta_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

/* ----------------------------------------------------------
   AVISOS DE BÚSQUEDA (pestaña "Avisos")
   GET  ?action=avisos  -> lista de avisos activos
   POST { registro: 'aviso', ... } -> publica un aviso nuevo (el celular es obligatorio)
   Para retirar un aviso (mascota reencontrada) escribe "Reencontrado" en la columna estado.
   ---------------------------------------------------------- */
function obtenerHojaAvisos_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(NOMBRE_AVISOS);
  if (!hoja) hoja = libro.insertSheet(NOMBRE_AVISOS);
  var n = COLUMNAS_AVISOS.length;
  if (hoja.getLastRow() > 0 && String(hoja.getRange(1, n).getValue()) !== COLUMNAS_AVISOS[n - 1]) {   // hoja de la versión anterior: se agregan los encabezados nuevos
    hoja.getRange(1, 1, 1, n).setValues([COLUMNAS_AVISOS]).setFontWeight('bold').setBackground('#C0392B').setFontColor('#ffffff');
    hoja.getRange('P:P').setNumberFormat('@');
  }
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, COLUMNAS_AVISOS.length).setValues([COLUMNAS_AVISOS]).setFontWeight('bold').setBackground('#C0392B').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.getRange('C:C').setNumberFormat('@');   // fecha como texto (aaaa-mm-dd)
    hoja.getRange('L:L').setNumberFormat('@');   // celular como texto
    hoja.getRange('P:P').setNumberFormat('@');   // firma como texto
  }
  return hoja;
}

function listarAvisos_() {
  var hoja = obtenerHojaAvisos_();
  var ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  var zona = Session.getScriptTimeZone(), maxLista = config_('max_reportes_lista', 200);
  var primera = Math.max(2, ultima - config_('filas_a_leer', 400) + 1);
  var filas = hoja.getRange(primera, 1, ultima - primera + 1, COLUMNAS_AVISOS.length).getValues();
  var lista = [];
  for (var i = filas.length - 1; i >= 0 && lista.length < maxLista; i--) {
    var f = filas[i];
    if (String(f[13] || 'Activo').toLowerCase() !== 'activo') continue;
    if (!f[0] || !f[12]) continue;
    lista.push({
      id: String(f[0]), fecha: fechaTexto_(f[2], zona),
      tipo: String(f[3]), tamano: String(f[4]), distrito: String(f[5]), lugar: String(f[6]), nombreMascota: String(f[7]),
      nota: String(f[8]), collar: String(f[9]) === 'Sí', contacto: String(f[10]),
      telefono: String(f[11]).replace(/\D/g, ''), foto: String(f[12]),
      paleta: String(f[14] || ''), firma: String(f[15] || '')     // el correo (f[16]) es privado: nunca se envía a la página
    });
  }
  return lista;
}

function validarAviso_(d) {
  if (TIPOS.indexOf(d.tipo) < 0) return 'Elige si es perro o gato.';
  if (d.tamano && TAMANOS.indexOf(d.tamano) < 0) return 'El tamaño no es válido.';
  if (!String(d.nombreMascota || '').trim()) return 'Escribe el nombre de tu mascota.';
  if (DISTRITOS.indexOf(d.distrito) < 0) return 'Solo recibimos avisos de distritos del Callao.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) return 'La fecha no es válida.';
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (d.fecha > hoy) return 'La fecha no puede ser futura.';
  if (!/^9\d{8}$/.test(String(d.telefono || ''))) return 'El celular debe tener 9 dígitos y empezar con 9.';
  var m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/.exec(String(d.fotoDataUrl || ''));
  if (!m) return 'La foto no es válida.';
  if (m[2].length * 0.75 > MAX_FOTO_BYTES) return 'La foto es demasiado pesada.';
  return null;
}

function procesarAviso_(d, bloqueo) {
  var error = validarAviso_(d);
  if (error) return respuesta_({ ok: false, error: error });
  bloqueo.waitLock(20000);
  if (superaLimite_(String(d.telefono), 'av_')) {
    return respuesta_({ ok: false, error: 'Ya publicaste varios avisos. Inténtalo de nuevo en una hora.' });
  }
  var id = Utilities.getUuid().substring(0, 8);
  var urlFoto = guardarFoto_(d.fotoDataUrl, id, 'aviso');
  obtenerHojaAvisos_().appendRow([
    id, new Date(), d.fecha, d.tipo, d.tamano || '', d.distrito, limpiar_(d.lugar, 120), limpiar_(d.nombreMascota, 30),
    limpiar_(d.nota, 200), d.collar ? 'Sí' : 'No', limpiar_(d.contacto, 40), String(d.telefono), urlFoto, 'Activo',
    JSON.stringify(paletaSegura_(d.paleta)), firmaSegura_(d.firma), correoSeguro_(d.correo)
  ]);
  return respuesta_({ ok: true, id: id });
}

/* ----------------------------------------------------------
   COINCIDENCIAS (pestaña "Coincidencias") y notificación al dueño
   La página compara la foto del reporte nuevo con los avisos y envía las que superan el 70 %.
   Aquí se comprueban, se guardan y, si el aviso tiene correo, se avisa por correo.
   GET ?action=coincidencias&ids=id1,id2  -> las coincidencias de esos avisos (la página guarda los ids de los avisos de cada persona)
   ---------------------------------------------------------- */
function correoSeguro_(c) {
  var t = String(c || '').trim().toLowerCase();
  return (t.length <= 80 && /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}$/.test(t)) ? t : '';
}

function obtenerHojaCoincidencias_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(NOMBRE_COINCIDENCIAS);
  if (!hoja) hoja = libro.insertSheet(NOMBRE_COINCIDENCIAS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, COLUMNAS_COINCIDENCIAS.length).setValues([COLUMNAS_COINCIDENCIAS]).setFontWeight('bold').setBackground('#C0392B').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Registra las coincidencias de un reporte recién publicado y avisa a cada dueño (máximo 5 por reporte)
function registrarCoincidencias_(lista, reporteId, urlFoto, d) {
  if (!Array.isArray(lista) || !lista.length) return;
  var hojaAv = obtenerHojaAvisos_(), ultima = hojaAv.getLastRow();
  if (ultima < 2) return;
  var filas = hojaAv.getRange(2, 1, ultima - 1, COLUMNAS_AVISOS.length).getValues(), avisos = {};
  filas.forEach(function (f) { if (String(f[13] || 'Activo').toLowerCase() === 'activo') avisos[String(f[0])] = { nombre: String(f[7]), correo: String(f[16] || '') }; });
  var hoja = obtenerHojaCoincidencias_(), usados = {};
  lista.slice(0, 5).forEach(function (c) {
    var id = c && String(c.avisoId), pct = Math.round(Number(c && c.pct));
    if (!avisos[id] || usados[id] || !(pct > UMBRAL_COINCIDENCIA) || pct > 100) return;
    usados[id] = true;
    hoja.appendRow([new Date(), id, reporteId, pct, urlFoto, d.distrito, limpiar_(d.lugar, 120), 'Nueva']);
    if (avisos[id].correo) avisarPorCorreo_(avisos[id], pct, d.distrito);
  });
}

function avisarPorCorreo_(aviso, pct, distrito) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    var nombre = aviso.nombre || 'tu mascota';
    var enlace = URL_SITIO ? '\n\nRevisa el reporte aquí: ' + URL_SITIO.replace(/\/$/, '') + '/avisos-busqueda.html' : '\n\nEntra a la sección "Avisos de búsqueda" de Colitas Felices Callao para revisar el reporte.';
    MailApp.sendEmail({
      to: aviso.correo, name: 'Colitas Felices Callao',
      subject: 'Posible coincidencia con ' + nombre,
      body: 'Hola,\n\nSe publicó un nuevo reporte de una mascota encontrada en ' + distrito + ' que se parece a ' + nombre +
            ' (similitud visual: ' + pct + ' %).\n\nEs solo una posible coincidencia, no una confirmación: revisa la foto y el lugar para comprobar si es tu mascota.' +
            enlace + '\n\nColitas Felices Callao'
    });
  } catch (e) { /* si falla el correo, la notificación igual queda en la página */ }
}

function listarCoincidencias_(idsTexto) {
  var ids = {}, hay = false;
  idsTexto.split(',').slice(0, 10).forEach(function (i) { if (/^[0-9a-f]{8}$/.test(i)) { ids[i] = true; hay = true; } });
  if (!hay) return [];
  var hoja = obtenerHojaCoincidencias_(), ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  var zona = Session.getScriptTimeZone();
  var primera = Math.max(2, ultima - 200 + 1);
  var filas = hoja.getRange(primera, 1, ultima - primera + 1, COLUMNAS_COINCIDENCIAS.length).getValues(), lista = [];
  for (var i = filas.length - 1; i >= 0 && lista.length < 30; i--) {
    var f = filas[i];
    if (!ids[String(f[1])] || String(f[7]).toLowerCase() === 'descartada') continue;
    lista.push({ avisoId: String(f[1]), reporteId: String(f[2]), pct: Number(f[3]), fecha: fechaTexto_(f[0], zona), foto: String(f[4]), distrito: String(f[5]), lugar: String(f[6]) });
  }
  return lista;
}

/* ==========================================================
   CUENTAS, TIENDA SOLIDARIA Y COLICOINS
   POST { registro: 'registrar' | 'entrar' | 'salir' | 'yo' | 'pedido' | 'canjear', ... }
   GET  ?action=productos
   - Los precios SIEMPRE se calculan aquí con la pestaña Productos; los que envía la página se ignoran.
   - ColiCoins: se ganan cuando un reporte hecho con sesión iniciada pasa a "Reencontrado" (ver onEdit) y se gastan con "canjear".
   ========================================================== */
var ACCIONES_CUENTA = { registrar: registrar_, entrar: entrar_, salir: salir_, yo: yo_, pedido: pedido_, canjear: canjear_ };
var DIAS_SESION = 30;
var VUELTAS_CLAVE = 1000;
var COLUMNAS_USUARIOS = ['id', 'creado', 'nombre', 'correo', 'sal', 'huella', 'edad', 'genero', 'saldo', 'estado'];
var COLUMNAS_MOVIMIENTOS = ['fecha', 'usuario_id', 'tipo', 'monto', 'detalle'];
var COLUMNAS_PRODUCTOS = ['id', 'nombre', 'descripcion', 'imagen', 'precio_soles', 'precio_colicoins', 'stock', 'activo'];
var COLUMNAS_PEDIDOS = ['id', 'creado', 'usuario_id', 'tipo', 'productos', 'total_soles', 'total_colicoins', 'nombre', 'telefono', 'entrega', 'direccion', 'estado'];
// Productos de ejemplo (precios de ejemplo: cámbialos en la pestaña Productos). Se crean solo si esa pestaña está vacía.
var PRODUCTOS_INICIALES = [
  ['placa', 'Placa de identificación', 'Placa de acero con el nombre de tu mascota y tu celular grabados.', 'imagenes/ilustraciones/perro-lengua.webp', 15, 150, '', 'Sí'],
  ['polo', 'Polo Colitas Felices', 'Polo de algodón con el logo de la página. Indica tu talla al coordinar la entrega.', 'imagenes/ilustraciones/gato-feliz.webp', 35, 350, '', 'Sí'],
  ['taza', 'Taza «Una colita feliz»', 'Taza de cerámica para el desayuno de quienes aman a los animales.', 'imagenes/ilustraciones/perro-hueso.webp', 18, 180, '', 'Sí'],
  ['bolsa', 'Bolsa de tela reutilizable', 'Bolsa ecológica con estampado de mascotas, ideal para el paseo.', 'imagenes/ilustraciones/labrador.webp', 20, 200, '', 'Sí'],
  ['bandana', 'Bandana para perros y gatos', 'Bandana de tela suave en colores de Colitas Felices.', 'imagenes/ilustraciones/yorkie.webp', 12, 120, '', 'Sí'],
  ['llavero', 'Llavero de patita', 'Llavero con forma de patita para tener siempre cerca a tu compañero.', 'imagenes/ilustraciones/gato-atigrado.webp', 8, 80, '', 'Sí'],
  ['stickers', 'Pack de stickers', 'Seis stickers de perros y gatos para tu cuaderno, laptop o botella.', 'imagenes/ilustraciones/bulldog-juego.webp', 10, 100, '', 'Sí'],
  ['collar', 'Collar reflectante', 'Collar con tira reflectante para paseos más seguros de noche.', 'imagenes/ilustraciones/paseo.webp', 22, 220, '', 'Sí']
];

function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function sha_(t) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)); }
function huellaClave_(clave, sal) { var h = sal + clave; for (var i = 0; i < VUELTAS_CLAVE; i++) h = sha_(h + sal); return h; }

function hojaConEncabezado_(nombre, columnas, color) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold').setBackground(color).setFontColor('#ffffff');
    hoja.setFrozenRows(1);
  }
  return hoja;
}
function hojaUsuarios_() { var h = hojaConEncabezado_(NOMBRE_USUARIOS, COLUMNAS_USUARIOS, '#F28C28'); h.getRange('D:D').setNumberFormat('@'); return h; }
function hojaSesiones_() { return hojaConEncabezado_(NOMBRE_SESIONES, ['huella_codigo', 'usuario_id', 'expira'], '#5A6570'); }
function hojaMovimientos_() { return hojaConEncabezado_(NOMBRE_MOVIMIENTOS, COLUMNAS_MOVIMIENTOS, '#F28C28'); }
function hojaProductos_() { return hojaConEncabezado_(NOMBRE_PRODUCTOS, COLUMNAS_PRODUCTOS, '#F28C28'); }
function hojaPedidos_() { var h = hojaConEncabezado_(NOMBRE_PEDIDOS, COLUMNAS_PEDIDOS, '#F28C28'); h.getRange('I:I').setNumberFormat('@'); return h; }

function sembrarProductos_() {
  var hoja = hojaProductos_();
  if (hoja.getLastRow() < 2) hoja.getRange(2, 1, PRODUCTOS_INICIALES.length, COLUMNAS_PRODUCTOS.length).setValues(PRODUCTOS_INICIALES);
}

// Busca una fila por el valor exacto de una columna (letra). Devuelve { fila, v } o null.
function buscarFila_(hoja, letra, valor) {
  if (hoja.getLastRow() < 2 || !valor) return null;
  var c = hoja.getRange(letra + ':' + letra).createTextFinder(String(valor)).matchEntireCell(true).findNext();
  if (!c || c.getRow() < 2) return null;
  return { fila: c.getRow(), v: hoja.getRange(c.getRow(), 1, 1, hoja.getLastColumn()).getValues()[0] };
}

/* ----- Sesiones ----- */
function crearSesion_(usuarioId) {
  var codigo = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var h = sha_(codigo), expira = Date.now() + DIAS_SESION * 86400000;
  hojaSesiones_().appendRow([h, usuarioId, expira]);
  CacheService.getScriptCache().put('ses_' + h, usuarioId, 21000);
  return codigo;
}
// Devuelve el id del usuario dueño del código, o '' si no hay sesión válida
function usuarioDeToken_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return '';
  var h = sha_(token), cache = CacheService.getScriptCache(), id = cache.get('ses_' + h);
  if (id) return id;
  var hoja = hojaSesiones_(), ultima = hoja.getLastRow();
  if (ultima < 2) return '';
  var primera = Math.max(2, ultima - 1500 + 1);
  var filas = hoja.getRange(primera, 1, ultima - primera + 1, 3).getValues();
  for (var i = filas.length - 1; i >= 0; i--) {
    if (filas[i][0] === h) {
      if (Number(filas[i][2]) < Date.now()) return '';
      cache.put('ses_' + h, String(filas[i][1]), 21000);
      return String(filas[i][1]);
    }
  }
  return '';
}
function usuarioActual_(d) {
  var id = usuarioDeToken_(d && d.token);
  if (!id) return null;
  var u = buscarFila_(hojaUsuarios_(), 'A', id);
  return u && String(u.v[9] || 'Activo').toLowerCase() === 'activo' ? u : null;
}

/* ----- Registro, entrada, salida ----- */
function registrar_(d, bloqueo) {
  var nombre = limpiar_(d.nombre, 60), correo = correoSeguro_(d.correo), clave = String(d.clave || ''), edad = Number(d.edad);
  if (nombre.length < 2) return respuesta_({ ok: false, error: 'Escribe tu nombre de usuario.' });
  if (!correo) return respuesta_({ ok: false, error: 'Escribe un correo válido.' });
  if (clave.length < 6 || clave.length > 64) return respuesta_({ ok: false, error: 'La contraseña debe tener entre 6 y 64 caracteres.' });
  if (!(edad >= 18 && edad <= 80)) return respuesta_({ ok: false, error: 'Debes ser mayor de edad para crear una cuenta.' });
  if (['hombre', 'mujer'].indexOf(d.genero) < 0) return respuesta_({ ok: false, error: 'Elige tu género.' });
  bloqueo.waitLock(20000);
  var hoja = hojaUsuarios_();
  if (buscarFila_(hoja, 'D', correo)) return respuesta_({ ok: false, error: 'Ya existe una cuenta con ese correo.' });
  var id = Utilities.getUuid().substring(0, 8), sal = Utilities.getUuid();
  hoja.appendRow([id, new Date(), nombre, correo, sal, huellaClave_(clave, sal), Math.round(edad), d.genero, 0, 'Activo']);
  return respuesta_({ ok: true });
}

function entrar_(d) {
  var correo = correoSeguro_(d.correo), clave = String(d.clave || ''), cache = CacheService.getScriptCache();
  var claveCache = 'fallos_' + sha_(correo || 'x'), fallos = Number(cache.get(claveCache) || 0);
  if (fallos >= 5) return respuesta_({ ok: false, error: 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.' });
  var u = correo ? buscarFila_(hojaUsuarios_(), 'D', correo) : null;
  if (!u || huellaClave_(clave, String(u.v[4])) !== String(u.v[5]) || String(u.v[9] || 'Activo').toLowerCase() !== 'activo') {
    cache.put(claveCache, String(fallos + 1), 900);
    return respuesta_({ ok: false, error: 'Correo o contraseña incorrectos.' });
  }
  cache.remove(claveCache);
  return respuesta_({ ok: true, token: crearSesion_(String(u.v[0])), nombre: String(u.v[2]), saldo: Number(u.v[8]) || 0 });
}

function salir_(d) {
  var token = String(d.token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return respuesta_({ ok: true });
  var h = sha_(token), hoja = hojaSesiones_();
  CacheService.getScriptCache().remove('ses_' + h);
  var f = buscarFila_(hoja, 'A', h);
  if (f) hoja.getRange(f.fila, 3).setValue(0);
  return respuesta_({ ok: true });
}

function yo_(d) {
  var u = usuarioActual_(d);
  if (!u) return respuesta_({ ok: false, sesion: false, error: 'Tu sesión terminó. Inicia sesión otra vez.' });
  var id = String(u.v[0]), hoja = hojaMovimientos_(), ultima = hoja.getLastRow(), movs = [], zona = Session.getScriptTimeZone();
  if (ultima >= 2) {
    var primera = Math.max(2, ultima - 300 + 1);
    var filas = hoja.getRange(primera, 1, ultima - primera + 1, 5).getValues();
    for (var i = filas.length - 1; i >= 0 && movs.length < 10; i--) {
      if (String(filas[i][1]) === id) movs.push({ fecha: fechaTexto_(filas[i][0], zona), tipo: String(filas[i][2]), monto: Number(filas[i][3]), detalle: String(filas[i][4]) });
    }
  }
  return respuesta_({ ok: true, nombre: String(u.v[2]), saldo: Number(u.v[8]) || 0, movimientos: movs });
}

// Suma (o resta) ColiCoins a una cuenta y deja el movimiento. Quien llama debe tener el bloqueo.
function moverColiCoins_(usuarioId, monto, tipo, detalle) {
  var hoja = hojaUsuarios_(), u = buscarFila_(hoja, 'A', usuarioId);
  if (!u) return null;
  var nuevo = (Number(u.v[8]) || 0) + monto;
  if (nuevo < 0) return null;
  hoja.getRange(u.fila, 9).setValue(nuevo);
  hojaMovimientos_().appendRow([new Date(), usuarioId, tipo, monto, limpiar_(detalle, 120)]);
  return nuevo;
}

/* Reencuentro confirmado: al escribir "Reencontrado" en la columna estado de un reporte (pestaña Reportes),
   quien lo publicó con sesión iniciada recibe ColiCoins una sola vez. (Es un activador simple: funciona al editar a mano la hoja.) */
function onEdit(e) {
  var bloqueo = LockService.getScriptLock();
  try {
    if (!e || !e.range) return;
    var hoja = e.range.getSheet();
    if (hoja.getName() !== NOMBRE_HOJA || e.range.getRow() < 2 || e.range.getColumn() !== 14) return;
    if (String(e.value || '').toLowerCase() !== 'reencontrado') return;
    var fila = hoja.getRange(e.range.getRow(), 1, 1, COLUMNAS.length).getValues()[0];
    var reporte = String(fila[0]), usuario = String(fila[COLUMNAS.length - 1] || '');
    if (!reporte || !usuario) return;
    bloqueo.waitLock(20000);
    var mov = hojaMovimientos_();
    if (mov.getLastRow() > 1 && mov.getRange('E:E').createTextFinder('reporte:' + reporte).matchEntireCell(true).findNext()) return;   // ya se otorgó
    moverColiCoins_(usuario, config_('coicoins_por_reencuentro', 200), 'reencuentro', 'reporte:' + reporte);
  } catch (err) { /* un fallo aquí no debe bloquear la edición de la hoja */ }
  finally { try { bloqueo.releaseLock(); } catch (x) {} }
}

/* ----- Catálogo y pedidos ----- */
function leerProductos_() {
  var hoja = hojaProductos_(), ultima = hoja.getLastRow(), mapa = {}, lista = [];
  if (ultima < 2) return { lista: lista, mapa: mapa };
  hoja.getRange(2, 1, ultima - 1, COLUMNAS_PRODUCTOS.length).getValues().forEach(function (f, i) {
    var id = String(f[0]);
    if (!id || String(f[7] || 'Sí').toLowerCase() === 'no') return;
    var p = { id: id, nombre: String(f[1]), descripcion: String(f[2]), imagen: String(f[3]), soles: Number(f[4]) || 0, colicoins: Math.round(Number(f[5]) || 0),
              stock: f[6] === '' ? null : Math.max(0, Math.round(Number(f[6]) || 0)), fila: i + 2 };
    if (p.soles <= 0 && p.colicoins <= 0) return;
    lista.push(p); mapa[id] = p;
  });
  return { lista: lista, mapa: mapa };
}
function listarProductos_() {
  return leerProductos_().lista.map(function (p) { return { id: p.id, nombre: p.nombre, descripcion: p.descripcion, imagen: p.imagen, soles: p.soles, colicoins: p.colicoins, stock: p.stock }; });
}

// Valida los productos del carrito con los precios y el stock reales. Devuelve { error } o { lineas, soles, colicoins }.
function armarPedido_(items, moneda) {
  if (!Array.isArray(items) || !items.length || items.length > 10) return { error: 'Tu carrito está vacío.' };
  var cat = leerProductos_().mapa, lineas = [], soles = 0, cc = 0, vistos = {};
  for (var i = 0; i < items.length; i++) {
    var id = String(items[i] && items[i].id), cant = Math.round(Number(items[i] && items[i].cant)), p = cat[id];
    if (!p || vistos[id]) return { error: 'Un producto del carrito ya no está disponible.' };
    vistos[id] = true;
    if (!(cant >= 1 && cant <= 10)) return { error: 'La cantidad de ' + p.nombre + ' no es válida.' };
    if (p.stock !== null && p.stock < cant) return { error: 'No hay suficiente stock de ' + p.nombre + '.' };
    if (moneda === 'dinero' && p.soles <= 0) return { error: p.nombre + ' solo se canjea con ColiCoins.' };
    if (moneda === 'colicoins' && p.colicoins <= 0) return { error: p.nombre + ' no se puede canjear con ColiCoins.' };
    lineas.push({ id: id, nombre: p.nombre, cant: cant, soles: p.soles, colicoins: p.colicoins, fila: p.fila, stock: p.stock });
    soles += p.soles * cant; cc += p.colicoins * cant;
  }
  return { lineas: lineas, soles: Math.round(soles * 100) / 100, colicoins: cc };
}

function contactoPedido_(d) {
  var nombre = limpiar_(d.nombre, 60), tel = String(d.telefono || '').replace(/\D/g, ''), entrega = d.entrega, dir = limpiar_(d.direccion, 150);
  if (nombre.length < 2) return { error: 'Escribe tu nombre.' };
  if (!/^9\d{8}$/.test(tel)) return { error: 'Escribe un celular de 9 dígitos que empiece con 9.' };
  if (['recojo', 'envio'].indexOf(entrega) < 0) return { error: 'Elige cómo quieres recibir tu pedido.' };
  if (entrega === 'envio' && dir.length < 6) return { error: 'Escribe la dirección de entrega.' };
  return { nombre: nombre, telefono: tel, entrega: entrega, direccion: entrega === 'envio' ? dir : '' };
}

function guardarPedido_(tipo, usuarioId, calc, c, estado) {
  var id = 'P' + Utilities.getUuid().substring(0, 6).toUpperCase();
  var resumen = calc.lineas.map(function (l) { return l.cant + ' x ' + l.nombre; }).join('; ');
  hojaPedidos_().appendRow([id, new Date(), usuarioId || '', tipo, limpiar_(resumen, 400), tipo === 'dinero' ? calc.soles : 0, tipo === 'colicoins' ? calc.colicoins : 0,
    c.nombre, c.telefono, c.entrega, c.direccion, estado]);
  var hoja = hojaProductos_();
  calc.lineas.forEach(function (l) { if (l.stock !== null) hoja.getRange(l.fila, 7).setValue(l.stock - l.cant); });   // se reserva el stock
  return id;
}

// Compra en dinero real: queda "Pendiente de pago" hasta que confirmes el pago (Yape, Plin o transferencia) en la pestaña Pedidos.
function pedido_(d, bloqueo) {
  var c = contactoPedido_(d); if (c.error) return respuesta_({ ok: false, error: c.error });
  bloqueo.waitLock(20000);
  var calc = armarPedido_(d.items, 'dinero'); if (calc.error) return respuesta_({ ok: false, error: calc.error });
  var u = usuarioActual_(d);
  var id = guardarPedido_('dinero', u ? String(u.v[0]) : '', calc, c, 'Pendiente de pago');
  return respuesta_({ ok: true, id: id, total: calc.soles });
}

// Canje con ColiCoins: exige sesión y descuenta el saldo en el mismo paso.
function canjear_(d, bloqueo) {
  var c = contactoPedido_(d); if (c.error) return respuesta_({ ok: false, error: c.error });
  bloqueo.waitLock(20000);
  var u = usuarioActual_(d);
  if (!u) return respuesta_({ ok: false, sesion: false, error: 'Inicia sesión para canjear tus ColiCoins.' });
  var calc = armarPedido_(d.items, 'colicoins'); if (calc.error) return respuesta_({ ok: false, error: calc.error });
  var saldo = Number(u.v[8]) || 0;
  if (calc.colicoins > saldo) return respuesta_({ ok: false, error: 'Te faltan ' + (calc.colicoins - saldo) + ' ColiCoins para este canje.' });
  var id = guardarPedido_('colicoins', String(u.v[0]), calc, c, 'Por entregar');
  var nuevo = moverColiCoins_(String(u.v[0]), -calc.colicoins, 'canje', 'pedido:' + id);
  return respuesta_({ ok: true, id: id, total: calc.colicoins, saldo: nuevo });
}
