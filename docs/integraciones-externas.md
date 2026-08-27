# Integraciones externas

## WhatsApp Cloud API

La cola y el webhook estan implementados. Para activarlos configura `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_VERIFY_TOKEN` y `WHATSAPP_CLOUD_APP_SECRET`, y registra `https://<dominio>/api/webhooks/whatsapp` en Meta. Sin esas variables, el cron conserva los mensajes en cola y no marca envios falsos.

## Suscripcion SaaS con Mercado Pago

El registro crea una organizacion en estado `pending`, genera el checkout de una suscripcion Mercado Pago y el cron sincroniza el estado de la preapproval. Configura el token privado en `MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN` y el mapa JSON de planes en `MERCADOPAGO_SUBSCRIPTION_PLAN_IDS`. El acceso se activa solo cuando la API informa estado autorizado.

Antes de produccion se debe registrar un webhook firmado de Mercado Pago y verificarlo con su SDK oficial o su algoritmo documentado y una clave `MERCADOPAGO_WEBHOOK_SECRET`; no se acepta un webhook con una firma inventada.

## SumUp y DTE

SumUp se conecta por salon y sus credenciales se cifran del lado del servidor. El webhook de reservas ya confirma pagos consultando la API antes de confirmar la cita. La emision DTE no se habilita hasta confirmar por contrato las capacidades tributarias disponibles de la cuenta SumUp o definir un proveedor DTE chileno; no se emiten boletas simuladas.
