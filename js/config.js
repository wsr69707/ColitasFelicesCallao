/* ==========================================================
   CONFIGURACIÓN DE REPORTES (Google Sheets + Apps Script)
   Lo usan: reportar-mascota.html y mascotas-perdidas-callao.html

   Pega aquí la URL de tu aplicación web de Google Apps Script
   (la que termina en /exec). Los pasos están en el README.md.

   Mientras esté vacía, la página funciona en "modo prueba":
   muestra reportes de ejemplo y guarda los nuevos solo en el
   navegador de quien los envía.
   ========================================================== */
const COLITAS_API_URL = "https://script.google.com/macros/s/AKfycbzE0q36Oo__cC9iHS2ulfpefuXOr6ZPRv9ogXYoq8-HGD9paS7i-IqwXcJSbGjB4OqZ/exec";

/* ==========================================================
   TIENDA SOLIDARIA (tienda-solidaria.html)
   Las compras en dinero real quedan como "Pendiente de pago" en la pestaña Pedidos. Escribe aquí cómo quieres
   que te paguen: la página muestra estos datos al terminar la compra. Si los dejas vacíos, no se muestra ese medio.
   ========================================================== */
const TIENDA_YAPE = "";          // número de Yape o Plin, ej. "987654321"
const TIENDA_WHATSAPP = "";      // WhatsApp para coordinar pagos y entregas, con código de país, ej. "51987654321"
