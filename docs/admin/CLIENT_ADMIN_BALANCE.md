# Super Admin - Clientes, recargas y acceso asistido

## Funciones agregadas

En `/admin/clients` el Super Admin puede:

- Ver ficha ampliada del cliente.
- Ver moneda de la cuenta.
- Ver saldo y saldo pendiente.
- Recargar saldo en una moneda diferente y acreditar la moneda del cliente usando las tasas disponibles en `/api/currencies`.
- Bloquear o activar una cuenta.
- Entrar temporalmente como cliente para revisar su panel.
- Ver si tiene tarjeta asociada y los datos enmascarados guardados por la aplicación.
- Desvincular tarjeta.
- Ajustar saldo pendiente cuando el balance está en negativo.

## Conversión de moneda

La recarga administrativa recibe:

- monto solicitado
- moneda de entrada
- moneda del cliente

El servidor usa el mismo motor interno de tasas que expone `/api/currencies`. El saldo se acredita en la moneda del cliente.

## Seguridad visual

La interfaz muestra mensajes comerciales y no expone detalles internos. Los detalles operativos se registran en `provider_logs` con `provider_code = admin_clients`.

## Acceso como cliente

Al entrar como cliente, el token del Super Admin se guarda temporalmente en el navegador y aparece una barra superior para volver al Super Admin.

## Nota sobre tarjeta

La aplicación solo muestra la tarjeta enmascarada disponible en la cuenta. No se cobra automáticamente la tarjeta desde esta acción administrativa.
