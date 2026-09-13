# Ship24Go V1.2.0 — Dashboard profesional y modo claro/oscuro

## Resumen

Esta versión agrega una experiencia visual profesional en modo claro y oscuro, junto con métricas modernas en Super Admin y Panel Cliente usando Chart.js.

## Super Admin

- Dashboard renovado con tarjetas comerciales.
- Gráfico de evolución de ingresos de los últimos 7 días.
- Ranking de países donde más se envía.
- Panel destacado del país líder.
- Gráfico de envíos por agencia/proveedor.
- Botón de modo claro/oscuro en escritorio y móvil.

## Panel Cliente

- Dashboard renovado con saldo, envíos del mes, entregados y estado del servicio.
- Gráfico moderno de actividad de envíos.
- Gráfico de destinos principales.
- Estado de envíos separado por pendientes, tránsito y entregados.
- Mantiene el modo claro/oscuro profesional del panel.

## API interna

- `GET /api/admin/reports` ahora devuelve `countries` y `providers`.
- `GET /api/user/reports` devuelve métricas del cliente, países principales y actividad diaria.

## Base de datos

No requiere nuevas tablas. Usa los envíos, cotizaciones y direcciones existentes.
