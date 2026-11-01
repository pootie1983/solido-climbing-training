# SOLIDO COACH IA — backend gratuito y opcional

Este backend es un complemento experimental. La app local sigue siendo la fuente de verdad y debe seguir funcionando si el backend no existe, pierde conexión o agota la cuota.

## Regla de coste cero

- Usar exclusivamente **Cloudflare Workers Free** y Workers AI dentro de su asignación gratuita.
- No seleccionar Workers Paid, no comprar créditos, no activar Unified Billing, no configurar auto-top-up y no añadir método de pago.
- Workers AI documenta una asignación gratuita de 10.000 Neurons al día; al alcanzar el límite, las operaciones fallan. No cambiar a un plan de pago para recuperar el servicio.
- Si Cloudflare solicita un método de pago o una actualización de plan para habilitar el servicio, detener la configuración. La función online se queda desactivada y la app usa el Coach local.
- Las condiciones y cuotas pueden cambiar; revisar la página oficial de precios antes de activar el backend.

## Modelo

Se fija `@cf/zai-org/glm-4.7-flash`, que Cloudflare incluye entre los modelos disponibles en Workers Free según su documentación vigente al preparar este backend. No usar modelos que exijan Workers Paid.

## Preparación

1. Crear una cuenta Cloudflare gratuita, sin añadir tarjeta ni contratar Workers Paid.
2. Instalar Wrangler en un equipo con Node.js: `npm install -D wrangler`.
3. Desde esta carpeta, autenticar Wrangler: `npx wrangler login`.
4. Crear un token aleatorio largo para acceso privado al Coach. No reutilizar contraseñas.
5. Guardarlo como secreto: `npx wrangler secret put COACH_ACCESS_TOKEN`.
6. Desplegar únicamente desde el plan Free: `npx wrangler deploy`.
7. Comprobar `https://<worker>.<subdominio>.workers.dev/health`.
8. Si el panel ofrece activar facturación, añadir tarjeta, comprar créditos o pasar a Paid, cancelar y no continuar.

El token de acceso no se incluye en el repositorio ni en el APK. Para la primera prueba privada debe introducirse en un canal de configuración seguro. No publicar el endpoint ni compartir el token. Un token guardado en el almacenamiento de la app puede extraerse de un dispositivo comprometido; para distribuir la función a terceros se necesita autenticación individual y controles adicionales.

## API

`POST /v1/coach/recommendation`

Cabeceras:
- `Authorization: Bearer <COACH_ACCESS_TOKEN>`
- `Content-Type: application/json`

El endpoint acepta solo un resumen de entrenamiento no identificable y una lista de IDs de ejercicios existentes. No acepta nombre, correo, fecha de nacimiento, peso, altura, limitaciones en texto libre, lesiones, localización, sueño, pulso, calorías ni otros datos de Health Connect.

La respuesta se valida en el servidor y la app debe volver a validar IDs y límites contra su propio catálogo antes de mostrar o aceptar una sesión. La IA nunca puede guardar planes ni modificar historial.

## Privacidad y seguridad

- No enviar peticiones online sin consentimiento explícito y revocable dentro de la app.
- El modo local permanece disponible y es el fallback ante cualquier error.
- No registrar cuerpos de petición, tokens ni respuestas.
- No usar la IA para diagnóstico, tratamiento o rehabilitación.
- Este backend no guarda perfiles ni historial.
- Antes de una publicación para más usuarios: autenticación individual, límites por usuario, aviso de privacidad, revisión RGPD y pruebas de seguridad.

## Estado

Backend preparado como código fuente; todavía no desplegado, no configurado en una cuenta Cloudflare y no conectado al APK. La app no debe mostrar la IA online como activa hasta completar configuración y consentimiento.
