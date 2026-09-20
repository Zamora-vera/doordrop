# DoorDrop

DoorDrop es la plataforma web de logística, cotización de envíos, marketplace, omnicanalidad y soporte operativo desplegada en `https://doordrop.lat`.

## Versión

- **Versión de producto:** `1.5.6`
- **Fuente de versión:** [`VERSION`](./VERSION), [`package.json`](./package.json) y el endpoint operativo `/api/version`.
- **Commit de la copia desplegada/documentada:** `a17b584` (más el commit de esta documentación).

La versión `1.5.6` identifica la release del producto, no una versión individual de cada proveedor de transporte. Los proveedores, credenciales y capacidades disponibles dependen de la configuración del entorno y de las respuestas reales de sus APIs.

## Qué contiene el sistema

DoorDrop combina:

1. Una aplicación React/Vite para clientes, vendedores, administración, marketplace y omnicanalidad.
2. Un backend Express en [`server.ts`](./server.ts) con autenticación, cotizaciones, envíos, pagos, marketplace, correo, tickets, IA y webhooks.
3. Persistencia MySQL mediante [`server/db/connection.ts`](./server/db/connection.ts), repositorios y migraciones SQL.
4. Integraciones con proveedores de transporte, PayPal, Polar, correo, Google Maps, WhatsApp y servicios de impresión bajo demanda.
5. Documentos legales, traducciones, PWA, assets de marca y herramientas operativas.

El mapa detallado de módulos, responsabilidades, datos y flujos está en [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Requisitos y ejecución local

Requisitos mínimos:

- Node.js compatible con las dependencias del proyecto.
- MySQL accesible para el entorno local.
- Variables de entorno basadas en [`.env.example`](./.env.example).

```bash
npm ci
npm run lint
npm run build
npm run dev
```

Para producción, el build genera `dist/` y el proceso se inicia con `npm start`. El fichero [`ecosystem.config.cjs`](./ecosystem.config.cjs) contiene la configuración histórica de proceso; el flujo desplegado actualmente utiliza el contenedor y el script de [`scripts/deploy_from_github.sh`](./scripts/deploy_from_github.sh).

## Base de datos

Las migraciones versionadas están en [`migrations/`](./migrations). Deben ejecutarse de forma controlada sobre el entorno correcto, con backup y comprobación de compatibilidad. Hay dos ficheros con prefijo `V1`, `V30` y `V41` porque corresponden a líneas de evolución históricas diferentes; el nombre completo del fichero es la referencia, no solo el prefijo.

## Variables y secretos

No se incluyen contraseñas, tokens, claves privadas ni valores productivos en el repositorio. Los secretos deben permanecer en el entorno de ejecución o en el gestor de secretos correspondiente. Antes de activar un proveedor hay que comprobar credenciales, permisos, modo sandbox/producción, webhooks y cuenta real autorizada.

## Verificación de una release

Antes de considerar una release lista:

```bash
npm run lint
npm run build
```

Después del despliegue se debe verificar, como mínimo:

- `/api/version` devuelve `DoorDrop` y la versión esperada.
- El contenedor/proceso está activo.
- La página pública y el panel cargan.
- Las rutas afectadas responden con el usuario y rol correctos.
- Las migraciones requeridas existen y son compatibles con el esquema real.
- Las integraciones externas se prueban con una cuenta autorizada, no con datos simulados.

## Marca y autoría

La marca visible del producto es **DoorDrop**. **CodeMorf** es la agencia/desarrollador que mantiene el código; no es la marca principal del SaaS.
