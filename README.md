# Colitas Felices Callao

Página web de concientización y ayuda para mascotas del Callao.

## Páginas

| Página | Archivo | Menú |
|---|---|---|
| Inicio (sin pie de redes) | `index.html` | Inicio |
| Quiénes somos | `quienes-somos.html` | Quiénes somos |
| Historias felices | `historias-mascotas-felices.html` | Colitas Felices Blog > Historias felices |
| Infórmate | `informate.html` | Colitas Felices Blog > Infórmate |
| Mascotas perdidas (buscar por maqueta o por imagen) | `mascotas-perdidas-callao.html` | Ayuda > Mascotas perdidas |
| Reportar una mascota | `reportar-mascota.html` | Ayuda > Reportar una mascota |
| Avisos de búsqueda (formulario y tarjetas «Se busca») | `avisos-busqueda.html` | Ayuda > Avisos de búsqueda |
| Tienda Solidaria (soles o ColiCoins) | `tienda-solidaria.html` | Tienda Solidaria |

La página se ve al **100 %** (tamaño real) y se adapta a computadora, tablet y celular con `css/adaptable.css`.

## Conectar los reportes con Google Sheets (Google Apps Script)

Mientras `js/config.js` esté vacío, la página funciona en **modo prueba**: muestra reportes de ejemplo y
guarda los reportes nuevos solo en el navegador de quien los envía. Para guardarlos de verdad:

1. Crea una **hoja de cálculo de Google** nueva (por ejemplo, "Colitas Felices - Reportes").
2. Entra a **Extensiones > Apps Script**, borra lo que haya y pega el contenido de `google-apps-script/Code.gs`. Guarda.
3. En la barra superior elige la función **`configurar`** y pulsa **Ejecutar**. Acepta los permisos
   (crea la pestaña "Reportes" con sus columnas y una carpeta de Drive para las fotos).
4. Pulsa **Implementar > Nueva implementación**, tipo **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
5. Copia la **URL de la aplicación web** (termina en `/exec`).
6. Pégala en `js/config.js`:
   ```js
   const COLITAS_API_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
   ```
7. Sube los archivos a tu hosting y prueba enviando un reporte desde `reportar-mascota.html`.

**Si cambias `Code.gs`:** Implementar > Administrar implementaciones > Editar > Nueva versión (la URL no cambia).

### Cómo funciona

- **Reportar una mascota** envía la foto (ya reducida) y los datos al script. El script guarda la foto en
  Drive y una fila en la hoja: fecha, animal, tamaño, distrito, lugar, descripción, collar, contacto,
  enlace de la foto y los colores principales de la foto.
- **Mascotas perdidas** lee esa hoja y muestra los reportes. Se puede filtrar por animal, tamaño,
  distrito (solo del Callao), fecha y palabras clave, y comparar con una **maqueta** o una **imagen**.
- Al reportar, la persona **encierra a la mascota** en la foto con una elipse aproximada. Esa elipse no recorta
  la foto: solo orienta la separación del fondo y se guarda (en forma compacta) dentro de la columna `firma`.
- La similitud visual se calcula comparando **colores principales, zonas del cuerpo (cuadrícula 4 × 4) y manchas**,
  más el tamaño (no reconoce rostros ni razas). Una maqueta pintada y una foto se comparan con tolerancia.
  Siempre hay que confirmar con la foto y el lugar.
- El celular de quien reporta se muestra solo como botón de WhatsApp ("Es mi mascota"). El formulario
  pide su permiso.
- Cuando una mascota vuelva a casa, escribe **Reencontrado** en la columna `estado` de la hoja y dejará de mostrarse.

### Estructura del libro de Google Sheets (un solo libro)

- **Reportes**: los reportes de mascotas encontradas (columnas `id … estado | firma`). La columna `firma` guarda,
  de forma compacta, la elipse, la confianza y las 16 zonas de color (v3); las v2 y los reportes sin firma se siguen leyendo.
- **Configuracion**: ajustes (`clave | valor | descripcion`): versiones y límites. La crea `configurar()` si falta y
  nunca pisa valores que ya cambiaste. Las fotos están en Google Drive (carpeta guardada en las propiedades del script).

### Distritos permitidos

Bellavista, Callao (Cercado), Carmen de la Legua Reynoso, La Perla, La Punta, Mi Perú y Ventanilla.
La lista está en `js/reportes.js` (`DISTRITOS`) y en `google-apps-script/Code.gs`. El script rechaza
cualquier distrito que no esté en su lista.

### Notas

- Si tu cuenta es de una organización de Google Workspace, puede bloquear compartir archivos
  "con cualquier persona que tenga el enlace". En ese caso, usa una cuenta personal de Gmail para el script.
- Revisa la hoja de vez en cuando y borra los reportes falsos o antiguos.

### Avisos de búsqueda (pestaña «Avisos»)

- En **Mascotas perdidas**, después de buscar, aparece el botón rojo **«No encuentro a mi mascota»**. Lleva a
  `avisos-busqueda.html` con el animal, tamaño, descripción y foto (si buscó por imagen) ya escritos en el formulario.
- Cada aviso se guarda en la pestaña **Avisos** (la crea `configurar()`), con su foto en la misma carpeta de Drive.
  El celular es obligatorio y se muestra solo como botón de WhatsApp («Tengo información»).
- Para retirar un aviso, escribe **Reencontrado** en su columna `estado`.
- **Si ya tenías el script publicado:** pega el nuevo `Code.gs`, ejecuta `configurar` una vez e
  Implementar > Administrar implementaciones > Editar > Nueva versión. La URL no cambia.

### Coincidencias automáticas (pestaña «Coincidencias»)

- Al **publicar un reporte**, la página compara su foto (colores y zonas del cuerpo, el mismo motor de «Mascotas perdidas»)
  con las fotos de **Avisos de búsqueda**. Si alguna **supera el 70 %** de similitud visual, el reporte se publica y se
  registra una coincidencia con ese aviso (máximo 5 por reporte).
- **Notificación al dueño:** (1) en `avisos-busqueda.html` aparece «Posibles coincidencias con tu aviso» con la foto del reporte y
  un botón «Ver el reporte» (se muestra en el mismo navegador donde se publicó el aviso); (2) si el dueño dejó un **correo**
  (opcional, privado), se le envía un correo. Para que el correo lleve enlace, escribe tu dirección en `URL_SITIO` de `Code.gs`.
- El umbral está en `UMBRAL_COINCIDENCIA` (`js/coincidencias.js` y `Code.gs`).
- **Para activarlo:** pega el nuevo `Code.gs`, ejecuta `configurar` (acepta el permiso de enviar correos) y publica una
  **Nueva versión** de la implementación. Los avisos anteriores a esta versión no tienen foto analizada y no se comparan:
  deben volver a publicarse.
- Es una comparación visual aproximada, no una identificación: el dueño siempre debe confirmar con la foto y el lugar.

### Cuentas, Tienda Solidaria y ColiCoins

- **Cuentas reales:** `registro.html` e `iniciosesion.html` ahora hablan con Apps Script (`js/sesion.js`). El servidor guarda la contraseña solo
  como huella con sal (pestaña **Usuarios**), emite una sesión de 30 días (pestaña **Sesiones**) y bloquea 15 minutos tras 5 intentos fallidos.
  Antes esos formularios no guardaban nada. Los datos ya no viajan en la dirección de la página.
- **Tienda Solidaria:** el catálogo sale de la pestaña **Productos** (edita nombre, descripción, `imagen`, `precio_soles`, `precio_colicoins`,
  `stock`; escribe `No` en `activo` para ocultar uno). Los 8 productos y precios iniciales son **de ejemplo** y usan ilustraciones de la
  página como imagen. Los precios siempre los calcula el servidor.
- **Visitantes:** ven soles y compran. El pedido queda **Pendiente de pago** en la pestaña **Pedidos**; confirma el pago a mano. Escribe tu número de
  Yape/Plin y tu WhatsApp en `TIENDA_YAPE` y `TIENDA_WHATSAPP` (`js/config.js`) para que la página los muestre al terminar. No hay pasarela de pago.
- **Con sesión:** los precios se ven en **ColiCoins** y un botón permite cambiar a soles. Con ColiCoins se **canjea** (descuenta el saldo y crea
  un pedido «Por entregar»); con soles se compra como visitante.
- **Cómo se ganan ColiCoins:** los reportes hechos con sesión iniciada guardan quién los publicó. Cuando escribes **Reencontrado** en la columna
  `estado` de ese reporte (pestaña **Reportes**), esa persona recibe `coicoins_por_reencuentro` (pestaña **Configuracion**, 200 por defecto), una sola vez.
  Cada movimiento queda en **Movimientos**. Puedes ajustar un saldo a mano en **Usuarios** (columna `saldo`).
- **Para activarlo:** pega el nuevo `Code.gs`, ejecuta `configurar`, y publica una **Nueva versión**. La función `onEdit` funciona sola (activador simple).

