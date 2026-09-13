# Genei puntos/oficinas + Google Maps – V1.4.17

Objetivo: permitir servicios de Genei con oficina, punto, delegación, locker o punto a punto usando el mismo modal comercial de Ship24Go.

Reglas:
- Google Maps sólo muestra puntos reales devueltos por el proveedor.
- Si Genei no devuelve puntos para la zona, la UI muestra un mensaje comercial.
- Los intentos técnicos quedan en provider_logs.
- En creación de envío se envían los campos de oficina/punto cuando están disponibles.

Endpoint Ship24Go:
- POST /api/spedirepro/drop-off-points con providerCode=genei

Campos soportados:
- id_oficina_salida
- id_oficina_entrega
- select_oficinas_destino
- unidad_correo
- nombre_drop / cp_drop / pob_drop / dir_drop
