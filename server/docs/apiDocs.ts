/**
 * DoorDrop Customer API Documentation (PUBLIC SAFE)
 * Primary language: English. Also ES / IT.
 *
 * CRITICAL: Never expose wholesale suppliers, purchase channels, or margins.
 * Customers see carrier brands (FedEx, UPS, DHL, Correos, BRT, InPost, Poste...).
 * Internal aggregation is presented only as "DoorDrop network".
 */

export type DocLang = 'en' | 'es' | 'it' | 'fr';
export type DocSection = { title: string; body: string };
export type DocBundle = {
  lang: DocLang;
  title: string;
  subtitle: string;
  version: string;
  updated: string;
  sections: DocSection[];
};

const APP = process.env.APP_URL || 'https://doordrop.lat';
const BASE = APP + '/api';
const VER = '1.3.0';
const UPDATED = new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* OpenAPI — public fields only                                               */
/* -------------------------------------------------------------------------- */


function openApiDescription(): string {
  return [
    "# DoorDrop multi-carrier shipping API",
    "",
    "Interactive OpenAPI documentation (Swagger UI).",
    "",
    "## What you can do",
    "- **Quote** many carriers in one call (FedEx, UPS, DHL, Correos Express, BRT, InPost, Poste Italiane, …)",
    "- **Create** real shipments and download the **official carrier label**",
    "- **Track** packages publicly",
    "- Manage **wallet**, membership discounts, drop-off points and store sync",
    "- Apply plan discounts with a **23% safety cap** while shipping-provider margin is set to 30%",
    "",
    "## Authentication",
    "1. `POST /auth/login` with email + password",
    "2. Send JWT in header: `Authorization: <token>` (or `Bearer <token>`)",
    "3. Click **Authorize** in this UI and paste your token",
    "",
    "## Public carrier brands only",
    "Always show **`carrierName`** to end users (FedEx, UPS, DHL, Correos, BRT, InPost…).",
    "Do **not** expose internal purchase / wholesale channels.",
    "",
    "## Useful links",
    `- PDF guide (EN): ${APP}/api/docs/pdf?lang=en`,
    `- PDF guide (ES): ${APP}/api/docs/pdf?lang=es`,
    `- OpenAI tools: ${APP}/api/docs/openai-tools.json`,
    `- Customer panel: ${APP}/panel/api-docs`,
    "",
    "Primary language: **English**.",
  ].join("\n");
}

export function getOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'DoorDrop Shipping API',
      version: VER,
      description: openApiDescription(),
      contact: { name: 'DoorDrop Support', url: APP, email: 'support@doordrop.lat' },
      license: { name: 'Proprietary' },
    },
    externalDocs: {
      description: 'DoorDrop website',
      url: APP,
    },
    tags: [
      { name: 'Auth', description: 'Login / register and obtain JWT' },
      { name: 'Account', description: 'Profile, wallet balance, membership plan' },
      { name: 'Rates', description: 'Multi-carrier quotes — compare FedEx, UPS, DHL, Correos, BRT, InPost…' },
      { name: 'Shipments', description: 'Create, list, finalize, cancel shipments' },
      { name: 'Labels', description: 'Official carrier label download' },
      { name: 'Tracking', description: 'Public package tracking timeline' },
      { name: 'Points', description: 'Pickup / drop-off points (InPost, UPS Access Point, …)' },
      { name: 'FX', description: 'Live currency rates (base EUR)' },
      { name: 'Addresses', description: 'Customer address book' },
      { name: 'Stores', description: 'Ecommerce store connections' },
      { name: 'Reference', description: 'Countries and static reference data' },
      { name: 'Docs', description: 'OpenAPI, PDF guides, OpenAI tool schemas' },
    ],
    servers: [
      { url: BASE, description: 'Production API' },
      { url: 'http://localhost:3000/api', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        DoorDropJWT: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'JWT from POST /auth/login. Send raw token or Bearer <token>.',
        },
      },
      schemas: {
        Package: {
          type: 'object',
          required: ['weight'],
          properties: {
            weight: { type: 'number', example: 1, description: 'kg' },
            length: { type: 'number', example: 20, description: 'cm' },
            width: { type: 'number', example: 15, description: 'cm' },
            height: { type: 'number', example: 10, description: 'cm' },
            qty: { type: 'integer', example: 1 },
          },
        },
        Party: {
          type: 'object',
          required: ['name', 'address', 'city', 'zipCode', 'country'],
          properties: {
            name: { type: 'string' },
            company: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            province: { type: 'string' },
            zipCode: { type: 'string' },
            country: { type: 'string', minLength: 2, maxLength: 2, example: 'ES' },
          },
        },
        QuoteRequest: {
          type: 'object',
          required: ['originCountry', 'originZip', 'destCountry', 'destZip'],
          properties: {
            originCountry: { type: 'string', example: 'ES' },
            originZip: { type: 'string', example: '28001' },
            originCity: { type: 'string', example: 'Madrid' },
            destCountry: { type: 'string', example: 'US' },
            destZip: { type: 'string', example: '10001' },
            destCity: { type: 'string', example: 'New York' },
            currency: { type: 'string', example: 'EUR' },
            packages: { type: 'array', items: { $ref: '#/components/schemas/Package' } },
          },
        },
        QuoteOffer: {
          type: 'object',
          description: 'Normalized rate. Use carrierName for UI. quote id is required to create a shipment.',
          properties: {
            id: { type: 'string', description: 'quoteId for POST /shipments' },
            carrierName: {
              type: 'string',
              description: 'Public carrier brand shown to end users',
              example: 'FedEx',
              enum: [
                'FedEx', 'UPS', 'DHL', 'USPS', 'Correos Express', 'Correos', 'CTT', 'Zeleris', 'Ontime',
                'BRT', 'InPost', 'SDA', 'Poste Italiane', 'GLS', 'TNT', 'MRW', 'SEUR', 'Nacex',
                'Chronopost', 'Colissimo', 'Hermes', 'DPD', 'DoorDrop',
              ],
            },
            provider: { type: 'string', example: 'DoorDrop', description: 'Marca pública de DoorDrop' },
            service: { type: 'string', example: 'Express' },
            serviceId: { type: 'string' },
            customerPrice: { type: 'number', example: 18.5 },
            total: { type: 'number', example: 18.5 },
            currency: { type: 'string', example: 'EUR' },
            planDiscountPercent: { type: 'number', example: 10 },
            estimatedDays: { type: 'integer', example: 3 },
            estimatedDaysMin: { type: 'integer' },
            estimatedDaysMax: { type: 'integer' },
            departureType: { type: 'string', enum: ['home', 'point'] },
            arrivalType: { type: 'string', enum: ['home', 'point'] },
          },
        },
      },
    },
    security: [{ DoorDropJWT: [] }],
    paths: {
      '/auth/login': {
        post: {
          security: [],
          tags: ['Auth'],
          summary: 'Login — obtain JWT',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: { email: { type: 'string' }, password: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'token + user' } },
        },
      },
      '/auth/register': {
        post: { security: [], tags: ['Auth'], summary: 'Register account', responses: { '200': { description: 'created' } } },
      },
      '/user/profile': {
        get: { tags: ['Account'], summary: 'Profile, wallet balance, membership plan', responses: { '200': { description: 'user' } } },
      },
      '/shipments/quote': {
        post: {
          security: [],
          tags: ['Rates'],
          summary: 'Multi-carrier quote (parallel). Login recommended for membership discounts.',
          operationId: 'quoteShipments',
          description:
            'Returns normalized offers from the DoorDrop carrier network in parallel.\n\nEach offer includes a public **carrierName** (FedEx, UPS, DHL, Correos Express, BRT, InPost, Poste Italiane, etc.).\n\nSave `quotes[].id` as **quoteId** to create a shipment.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/QuoteRequest' } } },
          },
          responses: {
            '200': {
              description: 'quotes[] sorted by price',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      quotes: { type: 'array', items: { $ref: '#/components/schemas/QuoteOffer' } },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/shipments': {
        get: { tags: ['Shipments'], summary: 'List my shipments', responses: { '200': { description: 'list' } } },
        post: {
          tags: ['Shipments'],
          summary: 'Create shipment from quoteId (charges wallet, returns official carrier label)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quoteId', 'sender', 'recipient'],
                  properties: {
                    quoteId: { type: 'string' },
                    sender: { $ref: '#/components/schemas/Party' },
                    recipient: { $ref: '#/components/schemas/Party' },
                    packages: { type: 'array', items: { $ref: '#/components/schemas/Package' } },
                    content: { type: 'string' },
                    reference: { type: 'string' },
                    declaredValue: { type: 'number' },
                    exportReason: { type: 'string' },
                    termsOfTrade: { type: 'string', example: 'DDU' },
                    manifest: { type: 'integer', example: 1 },
                    customs: { type: 'array', items: { type: 'object' } },
                    services: { type: 'object', description: 'Selected drop-off / pickup points when required' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'SHIP-XXXX-Y id, tracking, labelUrl' } },
        },
      },
      '/shipments/{id}/finalize': {
        post: {
          tags: ['Shipments'],
          summary: 'Finalize draft after wallet top-up',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
      '/shipments/{id}/retry-label': {
        post: {
          tags: ['Shipments'],
          summary: 'Retry label generation',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
      '/shipments/{id}/cancel-request': {
        post: {
          tags: ['Shipments'],
          summary: 'Request cancellation',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
      '/shipments/{id}/label': {
        get: {
          tags: ['Labels'],
          summary: 'Label metadata',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'label info' } },
        },
      },
      '/shipments/{id}/label/file': {
        get: {
          tags: ['Labels'],
          summary: 'Download official carrier label file',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'PDF/file' } },
        },
      },
      '/tracking/{code}': {
        get: {
          security: [],
          tags: ['Tracking'],
          summary: 'Public tracking timeline',
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'events' } },
        },
      },
      '/drop-off-points': {
        post: {
          tags: ['Points'],
          summary: 'Search nearby pickup / delivery points (InPost, UPS Access Point, etc.)',
          
          responses: { '200': { description: 'points[]' } },
        },
      },
      '/currencies': {
        get: {
          security: [],
          tags: ['FX'],
          summary: 'Live FX rates (base EUR)',
          responses: { '200': { description: 'rates USD, GBP, DOP, ...' } },
        },
      },
      '/public/countries': {
        get: { security: [], tags: ['Reference'], summary: 'Countries list', responses: { '200': { description: 'countries' } } },
      },
      '/address-book': {
        get: { tags: ['Addresses'], summary: 'List saved addresses', responses: { '200': { description: 'list' } } },
        post: { tags: ['Addresses'], summary: 'Save address', responses: { '200': { description: 'created' } } },
      },
      '/stores': {
        get: { tags: ['Stores'], summary: 'Connected ecommerce stores', responses: { '200': { description: 'list' } } },
      },
      '/docs/openapi.json': {
        get: { security: [], tags: ['Docs'], summary: 'This OpenAPI document', responses: { '200': { description: 'OpenAPI 3' } } },
      },
      '/docs/pdf': {
        get: {
          security: [],
          tags: ['Docs'],
          summary: 'PDF documentation (lang=en|es|it)',
          parameters: [{ name: 'lang', in: 'query', schema: { type: 'string', enum: ['en', 'es', 'it'] } }],
          responses: { '200': { description: 'application/pdf' } },
        },
      },
      '/docs/openai-tools.json': {
        get: { security: [], tags: ['Docs'], summary: 'OpenAI function-calling schemas', responses: { '200': { description: 'tools' } } },
      },
    },
  };
}

export function getOpenAiToolSchemas() {
  return {
    model_hint: 'Any tool-calling model (GPT-4.1 / GPT-5 class, etc.)',
    system_prompt:
      'You are a DoorDrop multi-carrier shipping assistant. Quote carriers (FedEx, UPS, DHL, Correos, BRT, InPost, Poste Italiane, etc.), compare price and ETA, and create shipments only after the user confirms. Never invent rates or tracking numbers. Present carrierName to the user — never invent wholesale supplier names.',
    base_url: BASE,
    auth: 'JWT from /auth/login in Authorization header',
    tools: [
      {
        type: 'function',
        function: {
          name: 'doordrop_quote',
          description: 'Get multi-carrier shipping rates. Returns offers with public carrierName (FedEx, UPS, DHL, ...).',
          parameters: {
            type: 'object',
            properties: {
              originCountry: { type: 'string' },
              originZip: { type: 'string' },
              originCity: { type: 'string' },
              destCountry: { type: 'string' },
              destZip: { type: 'string' },
              destCity: { type: 'string' },
              weight_kg: { type: 'number' },
              length_cm: { type: 'number' },
              width_cm: { type: 'number' },
              height_cm: { type: 'number' },
              currency: { type: 'string' },
            },
            required: ['originCountry', 'originZip', 'destCountry', 'destZip', 'weight_kg'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'doordrop_create_shipment',
          description: 'Buy label using quoteId (charges wallet). Returns tracking and official carrier label.',
          parameters: {
            type: 'object',
            properties: {
              quoteId: { type: 'string' },
              sender: { type: 'object' },
              recipient: { type: 'object' },
              content: { type: 'string' },
              reference: { type: 'string' },
              declaredValue: { type: 'number' },
            },
            required: ['quoteId', 'sender', 'recipient'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'doordrop_track',
          description: 'Track package by tracking code',
          parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'doordrop_dropoff_points',
          description: 'Find nearby drop-off / pickup points (InPost lockers, UPS Access Point, etc.)',
          parameters: {
            type: 'object',
            properties: {
              country: { type: 'string' },
              city: { type: 'string' },
              postcode: { type: 'string' },
              direction: { type: 'string', enum: ['sender', 'receiver'] },
              vendor: { type: 'string', description: 'Optional carrier filter e.g. ups, inpost, brt' },
            },
            required: ['country', 'postcode'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'doordrop_list_shipments',
          description: 'List customer shipments',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    http_mapping: {
      doordrop_quote: { method: 'POST', path: '/shipments/quote' },
      doordrop_create_shipment: { method: 'POST', path: '/shipments' },
      doordrop_track: { method: 'GET', path: '/tracking/{code}' },
      doordrop_dropoff_points: { method: 'POST', path: '/drop-off-points' },
      doordrop_list_shipments: { method: 'GET', path: '/shipments' },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Human docs                                                                 */
/* -------------------------------------------------------------------------- */

const EN: DocBundle = {
  lang: 'en',
  title: 'DoorDrop Shipping API',
  subtitle: 'Multi-carrier rates, official labels, tracking, wallet & OpenAI tools',
  version: VER,
  updated: UPDATED,
  sections: [
    {
      title: '1. Platform overview',
      body: `DoorDrop is a unified multi-carrier shipping platform for ecommerce and logistics teams.

Base URL: ${BASE}
Panel docs: ${APP}/panel/api-docs
OpenAPI: ${BASE}/docs/openapi.json
PDF: ${BASE}/docs/pdf?lang=en|es|it
OpenAI tools: ${BASE}/docs/openai-tools.json

Customer flow:
1) Quote origin / destination / packages across the carrier network
2) Compare price, ETA and service type (home or point)
3) Select a quoteId
4) Create shipment (wallet debit + official carrier label)
5) Download label and track the package
6) Optional: drop-off points, store orders, cancel request

All rates and labels come from live carrier services. No simulated tracking.`,
    },
    {
      title: '2. Carriers available to customers (public brands)',
      body: `IMPORTANT — customer-facing integrations must display CARRIER BRANDS only.

Use the field carrierName from each quote (examples of brands you may receive depending on route):

INTERNATIONAL / EXPRESS
- FedEx
- UPS
- DHL
- TNT
- DPD
- Hermes

SPAIN / IBERIA (examples)
- Correos Express
- Correos
- CTT
- Zeleris
- Ontime
- SEUR
- MRW
- Nacex

ITALY (examples)
- BRT
- InPost
- SDA
- Poste Italiane
- GLS

OTHER / NETWORK
- DoorDrop (marca pública utilizada cuando un servicio se vende bajo la identidad de la plataforma)

DO NOT show, log, or document wholesale purchase channels, aggregator vendor codes, or supplier margins to end users.
DoorDrop routes each shipment through its private logistics network. That routing is internal.

How to show a rate in your UI:
  {carrierName} — {service} — {total} {currency} — {estimatedDays} days

How to create:
  Use quote.id as quoteId. Do not ask the user to pick an internal supplier.`,
    },
    {
      title: '3. Authentication',
      body: `POST ${BASE}/auth/login
Body: { "email": "you@company.com", "password": "..." }
Response includes JWT.

Send on protected routes:
  Authorization: <token>
  or Authorization: Bearer <token>

Register: POST /auth/register
Profile: GET /user/profile  (wallet balance, currency, active membership)

Keep the JWT on your server for production automations. Do not embed it in public websites.`,
    },
    {
      title: '4. Membership & pricing (customer view)',
      body: `Membership (monthly catalog in EUR):
- Basic: 0 EUR — 0% shipping discount
- Pro: 29.99 EUR — 10% off shipping totals
- Enterprise: 50 EUR — 20% off shipping totals

Safety limit: the maximum plan shipping discount is 23% while the shipping network uses a 30% provider margin. This prevents the discounted customer price from falling below the provider cost after rounding.

Paid via wallet, card (Polar), or PayPal.

Per shipment:
The quote total (customerPrice / total) is the amount charged to the wallet when the label is purchased.
Membership discount is already applied in the quote when the user is logged in (planDiscountPercent).

Insufficient wallet balance creates a draft / pending payment shipment that can be finalized after top-up.`,
    },
    {
      title: '5. Currencies & FX',
      body: `GET ${BASE}/currencies  (public)

Base currency: EUR
Live market rates (cached ~5 minutes): USD, GBP, MXN, DOP, and more.

Account currency is stored on the user profile. Quotes can be requested in a target currency.`,
    },
    {
      title: '6. Multi-carrier quote',
      body: `POST ${BASE}/shipments/quote
Auth: optional (recommended for membership discounts)

{
  "originCountry": "ES",
  "originZip": "28001",
  "originCity": "Madrid",
  "destCountry": "US",
  "destZip": "10001",
  "destCity": "New York",
  "currency": "EUR",
  "packages": [
    { "weight": 1.5, "length": 30, "width": 20, "height": 15, "qty": 1 }
  ]
}

Italy CAP example (city can be auto-filled for major cities):
{
  "originCountry": "IT", "originZip": "00186",
  "destCountry": "IT", "destZip": "20121",
  "packages": [{ "weight": 1, "length": 20, "width": 15, "height": 10, "qty": 1 }]
}

Dominican Republic international:
{
  "originCountry": "DO", "originZip": "10100", "originCity": "Santo Domingo",
  "destCountry": "US", "destZip": "33101", "destCity": "Miami",
  "packages": [{ "weight": 1, "length": 20, "width": 15, "height": 10, "qty": 1 }]
}

Response (normalized, max 10, sorted by price):
{
  "quotes": [
    {
      "id": "q_...",
      "carrierName": "FedEx",
      "provider": "DoorDrop",
      "service": "Express",
      "serviceId": "...",
      "customerPrice": 24.90,
      "total": 24.90,
      "currency": "EUR",
      "planDiscountPercent": 10,
      "estimatedDays": 3,
      "departureType": "home",
      "arrivalType": "home"
    },
    {
      "id": "q_...",
      "carrierName": "UPS",
      "service": "Standard",
      "total": 19.40,
      "currency": "EUR",
      "estimatedDays": 5
    }
  ]
}

Always store quote.id — required as quoteId to create the shipment.
Re-quote if the offer is older than ~15 minutes.`,
    },
    {
      title: '7. Create shipment & official label',
      body: `POST ${BASE}/shipments
Auth: required

{
  "quoteId": "q_...",
  "sender": {
    "name": "Acme SL",
    "email": "ship@acme.com",
    "phone": "+34600111222",
    "address": "Calle Mayor 1",
    "city": "Madrid",
    "zipCode": "28001",
    "country": "ES"
  },
  "recipient": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+12125551234",
    "address": "350 5th Ave",
    "city": "New York",
    "state": "NY",
    "zipCode": "10118",
    "country": "US"
  },
  "packages": [{ "weight": 1, "length": 20, "width": 15, "height": 10, "qty": 1 }],
  "content": "Apparel samples",
  "reference": "ORDER-10045",
  "declaredValue": 40,
  "manifest": 1
}

Success:
{
  "success": true,
  "shipment": {
    "id": "SHIP-8393-9",
    "trackingCode": "...",
    "status": "Label ready",
    "labelUrl": "https://..."
  }
}

Shipment IDs: SHIP-XXXX-Y
labelUrl is the official carrier document — never a mock label.`,
    },
    {
      title: '8. Labels, tracking, points, stores',
      body: `Labels:
  GET /shipments/{id}/label
  GET /shipments/{id}/label/file
  POST /shipments/{id}/retry-label

Tracking (public):
  GET /tracking/{code}

List / cancel:
  GET /shipments
  POST /shipments/{id}/cancel-request

Drop-off / pickup points (InPost, UPS Access Point, and other point networks):
  POST /drop-off-points
  Body example:
  {
    "country": "IT",
    "city": "Roma",
    "postcode": "00186",
    "direction": "sender",
    "vendors": ["inpost"]
  }
  

Stores (ecommerce sync):
  GET /stores
  POST /stores/{id}/sync
  GET /stores/{id}/orders

Address book:
  GET|POST /address-book`,
    },
    {
      title: '9. Quote fields for integrators',
      body: `Public fields you should use in UI and OMS:

- id                → quoteId for purchase
- carrierName       → FedEx / UPS / DHL / Correos Express / BRT / InPost / ...
- service           → service display name
- serviceId         → service code when needed
- total / customerPrice / currency
- planDiscountPercent / planName (if membership applied)
- estimatedDays / estimatedDaysMin / estimatedDaysMax
- departureType / arrivalType  (home | point)

Client-side filters:
- cheapest, fastest, carrier brand, home-to-home, point service, domestic vs international

Do not expose internal routing metadata to shoppers.`,
    },
    {
      title: '10. OpenAI / LLM agents',
      body: `Use your OpenAI key + DoorDrop tools:

1) Your backend stores the DoorDrop JWT
2) GET ${BASE}/docs/openai-tools.json
3) Map tool calls to DoorDrop REST
4) Show carrierName to the end user

Tools: doordrop_quote, doordrop_create_shipment, doordrop_track,
doordrop_dropoff_points, doordrop_list_shipments

Never invent rates. Confirm before create (wallet charge).`,
    },
    {
      title: '11. Errors & best practices',
      body: `400 — validation / missing fields
401 — login required
404 — quote or shipment not found
500 — temporary failure (retry with backoff)

Best practices:
- Prefer originCity / destCity (especially IT and DO)
- Re-quote before purchase if stale
- Store shipment.id + trackingCode + carrierName in your OMS
- Present only public carrier brands in customer emails and storefronts
- Use HTTPS only`,
    },
    {
      title: '12. Quick cURL',
      body: `# Login
curl -s -X POST ${BASE}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@company.com","password":"***"}'

# Multi-carrier quote
curl -s -X POST ${BASE}/shipments/quote \\
  -H "Content-Type: application/json" \\
  -H "Authorization: $TOKEN" \\
  -d '{"originCountry":"ES","originZip":"28001","originCity":"Madrid","destCountry":"ES","destZip":"08001","destCity":"Barcelona","packages":[{"weight":1,"length":20,"width":15,"height":10,"qty":1}]}'

# Create
curl -s -X POST ${BASE}/shipments \\
  -H "Content-Type: application/json" \\
  -H "Authorization: $TOKEN" \\
  -d '{"quoteId":"q_...","sender":{...},"recipient":{...},"packages":[{...}],"content":"Goods","manifest":1}'

# Track
curl -s ${BASE}/tracking/TRACKING_CODE

# PDF
curl -sL "${BASE}/docs/pdf?lang=en" -o DoorDrop-API-EN.pdf`,
    },
  ],
};

const ES: DocBundle = {
  lang: 'es',
  title: 'API de Envíos DoorDrop',
  subtitle: 'Multi-transportista: tarifas, etiquetas oficiales, tracking, monedero y OpenAI',
  version: VER,
  updated: UPDATED,
  sections: [
    {
      title: '1. Visión de la plataforma',
      body: `DoorDrop es una plataforma unificada multi-transportista.

URL base: ${BASE}
Panel docs: ${APP}/panel/api-docs
OpenAPI: ${BASE}/docs/openapi.json
PDF: ${BASE}/docs/pdf?lang=es

Flujo:
1) Cotizar origen/destino/paquetes en la red de transportistas
2) Comparar precio, plazo y tipo de servicio
3) Elegir quoteId
4) Crear envío (cargo monedero + etiqueta oficial del transportista)
5) Descargar etiqueta / trackear

Las tarifas y etiquetas son reales. No se inventan tracking.`,
    },
    {
      title: '2. Transportistas visibles al cliente (marcas públicas)',
      body: `CRÍTICO: en UI, facturas y API de cara al usuario SOLO marcas de transportista.

Usa el campo carrierName de cada cotización. Ejemplos según ruta:

INTERNACIONAL / EXPRESS
- FedEx, UPS, DHL, TNT, DPD, Hermes

ESPAÑA / IBERIA
- Correos Express, Correos, CTT, Zeleris, Ontime, SEUR, MRW, Nacex

ITALIA
- BRT, InPost, SDA, Poste Italiane, GLS

RED
- DoorDrop (marca pública de la plataforma cuando aplica)

NO muestres canales de compra mayorista, códigos de agregador internos ni márgenes de suministro.
DoorDrop enruta por su red privada: eso es interno.

En pantalla:
  {carrierName} — {service} — {total} {currency} — {estimatedDays} días`,
    },
    {
      title: '3. Autenticación',
      body: `POST /auth/login → JWT
Header: Authorization: <token> (o Bearer <token>)
GET /user/profile → saldo, moneda, plan
No expongas el JWT en front público de producción.`,
    },
    {
      title: '4. Membresía y precios',
      body: `Planes mensuales (EUR):
- Básico 0 → 0% dto
- Pro 29.99 → 10% dto en envíos
- Enterprise 50 → 20% dto

Límite de seguridad: el descuento máximo de envío es 23% con margen de proveedor del 30%. Así el precio con descuento no queda por debajo del coste del proveedor después del redondeo.

El total de la cotización (total / customerPrice) es lo que se cobra del monedero al comprar la etiqueta.
El descuento del plan ya viene aplicado si hay sesión.`,
    },
    {
      title: '5. Monedas y FX',
      body: `GET /currencies — base EUR, tasas en vivo (USD, GBP, DOP, ...), caché ~5 min.`,
    },
    {
      title: '6. Cotizar multi-transportista',
      body: `POST /shipments/quote

{
  "originCountry": "ES",
  "originZip": "28001",
  "originCity": "Madrid",
  "destCountry": "ES",
  "destZip": "08001",
  "destCity": "Barcelona",
  "currency": "EUR",
  "packages": [{ "weight": 1, "length": 20, "width": 15, "height": 10, "qty": 1 }]
}

Respuesta: quotes[] con id, carrierName (FedEx/UPS/Correos Express/...),
service, total, currency, estimatedDays, departureType, arrivalType.

Guarda quote.id como quoteId. Vuelve a cotizar si la tarifa envejece.`,
    },
    {
      title: '7. Crear envío y etiqueta',
      body: `POST /shipments
{ "quoteId":"q_...", "sender":{...}, "recipient":{...}, "packages":[...], "content":"...", "manifest":1 }

Respuesta: shipment.id formato SHIP-8393-9, trackingCode, labelUrl (documento oficial del transportista).`,
    },
    {
      title: '8. Tracking, puntos, tiendas',
      body: `GET /tracking/{code}
GET /shipments
GET /shipments/{id}/label · /label/file
POST /drop-off-points  (puntos InPost, UPS Access Point, etc.)
GET /stores · sincronización ecommerce
GET|POST /address-book`,
    },
    {
      title: '9. OpenAI / agentes',
      body: `GET /docs/openai-tools.json
Tools: doordrop_quote, doordrop_create_shipment, doordrop_track,
doordrop_dropoff_points, doordrop_list_shipments
Muestra carrierName al usuario final. Nunca inventes tarifas.`,
    },
    {
      title: '10. Errores y buenas prácticas',
      body: `400 validación · 401 sesión · 404 no encontrado · 500 reintentar
Prefiere ciudad en IT/DO. Re-cotiza antes de comprar.
En emails y tienda: solo marcas públicas de transportista.
IDs de envío: SHIP-XXXX-Y`,
    },
  ],
};

const IT: DocBundle = {
  lang: 'it',
  title: 'API Spedizioni DoorDrop',
  subtitle: 'Multi-corriere: tariffe, etichette ufficiali, tracking, wallet e OpenAI',
  version: VER,
  updated: UPDATED,
  sections: [
    {
      title: '1. Panoramica',
      body: `DoorDrop unifica più corrieri in una sola API.
Base URL: ${BASE}
Docs: ${APP}/panel/api-docs
OpenAPI: ${BASE}/docs/openapi.json
PDF: ${BASE}/docs/pdf?lang=it

Flusso: quotare → scegliere quoteId → creare spedizione (wallet + etichetta ufficiale) → tracking.`,
    },
    {
      title: '2. Corrieri pubblici (brand per il cliente)',
      body: `Mostra SOLO il brand del corriere (campo carrierName):

FedEx, UPS, DHL, TNT, DPD,
Correos Express, CTT, Zeleris,
BRT, InPost, SDA, Poste Italiane, GLS,
DoorDrop (marchio pubblico della piattaforma quando applicabile)

NON esporre canali di acquisto all'ingrosso, codici fornitore interni o margini di rete.
DoorDrop instrada in modo privato: resta interno.

UI: {carrierName} — {service} — {total} {currency}`,
    },
    {
      title: '3. Autenticazione',
      body: `POST /auth/login → JWT in Authorization.
GET /user/profile → saldo, valuta, piano.`,
    },
    {
      title: '4. Membership e prezzi',
      body: `Piani mensili EUR: Basic 0 (0%), Pro 29.99 (10%), Enterprise 50 (20%).
Limite di sicurezza: lo sconto massimo sulla spedizione è 23% con margine del 30% sul fornitore. Il prezzo scontato non scende sotto il costo del fornitore dopo l'arrotondamento.
Il totale quotato è addebitato sul wallet all'acquisto etichetta.`,
    },
    {
      title: '5. Valute',
      body: `GET /currencies — FX live base EUR.`,
    },
    {
      title: '6. Preventivo multi-corriere',
      body: `POST /shipments/quote con origin/dest e packages[].
Risposta: quotes[] con id e carrierName (FedEx, UPS, BRT, InPost, ...).
Salva id come quoteId.`,
    },
    {
      title: '7. Crea spedizione',
      body: `POST /shipments con quoteId, sender, recipient.
ID: SHIP-8393-9 · tracking + labelUrl ufficiali del corriere.`,
    },
    {
      title: '8. Tracking e punti',
      body: `GET /tracking/{code}
POST /drop-off-points (InPost, UPS Access Point, ...)
GET /shipments/{id}/label`,
    },
    {
      title: '9. OpenAI',
      body: `GET /docs/openai-tools.json — function calling.
Mostra carrierName all'utente finale.`,
    },
    {
      title: '10. Best practice',
      body: `Niente brand di wholesale. Re-quote prima dell'acquisto. Città consigliata in IT.`,
    },
  ],
};

export function getDocBundle(lang: string): DocBundle {
  const l = String(lang || 'en').toLowerCase().slice(0, 2);
  if (l === 'es') return ES;
  if (l === 'it') return IT;
  return EN;
}

export function docsToMarkdown(doc: DocBundle): string {
  const lines = [
    `# ${doc.title}`,
    '',
    `> ${doc.subtitle}`,
    '',
    `**Version:** ${doc.version} · **Updated:** ${doc.updated} · **Lang:** ${doc.lang.toUpperCase()}`,
    '',
  ];
  for (const s of doc.sections) {
    lines.push(`## ${s.title}`, '', s.body, '');
  }
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* PDF with WinAnsiEncoding                                                   */
/* -------------------------------------------------------------------------- */

function toWinAnsiBytes(input: string): number[] {
  const bytes: number[] = [];
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c === 0x20ac) {
      bytes.push(0x80);
      continue;
    }
    if (c < 128) {
      bytes.push(c);
      continue;
    }
    if (c >= 0xa0 && c <= 0xff) {
      bytes.push(c);
      continue;
    }
    const map: Record<number, number> = {
      0x2013: 0x2d,
      0x2014: 0x2d,
      0x2018: 0x27,
      0x2019: 0x27,
      0x201c: 0x22,
      0x201d: 0x22,
      0x2026: 0x2e,
      0x00a0: 0x20,
    };
    bytes.push(map[c] ?? 0x3f);
  }
  return bytes;
}

function pdfStringLiteral(input: string): string {
  const bytes = toWinAnsiBytes(input);
  let out = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
    else out += String.fromCharCode(b);
  }
  return out + ')';
}

export function docsToPdfBuffer(doc: DocBundle, options: { publicNote?: string } = {}): Buffer {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const fontSize = 9.5;
  const titleSize = 15;
  const headingSize = 11;
  const maxChars = 95;

  const wrap = (text: string): string[] => {
    const out: string[] = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.replace(/\t/g, '  ');
      if (!line) {
        out.push('');
        continue;
      }
      let rest = line;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut < maxChars * 0.55) cut = maxChars;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut).trimStart();
      }
      out.push(rest);
    }
    return out;
  };

  type Cmds = string[];
  const pages: Cmds[] = [];
  let cmds: Cmds = [];
  let y = pageHeight - margin;

  const newPage = () => {
    pages.push(cmds);
    cmds = [];
    y = pageHeight - margin;
  };
  const ensure = (need: number) => {
    if (y - need < margin) newPage();
  };
  const drawText = (str: string, size: number, bold = false) => {
    ensure(size + 3);
    cmds.push('BT');
    cmds.push(`/${bold ? 'F2' : 'F1'} ${size} Tf`);
    cmds.push(`1 0 0 1 ${margin} ${y.toFixed(2)} Tm`);
    cmds.push(`${pdfStringLiteral(str)} Tj`);
    cmds.push('ET');
    y -= size + 3.2;
  };

  drawText(doc.title, titleSize, true);
  drawText(doc.subtitle, fontSize, false);
  drawText(`Version ${doc.version}  |  ${doc.updated}  |  ${doc.lang.toUpperCase()}  |  doordrop.lat`, 8.5, false);
  y -= 6;
  const publicNote = options.publicNote === undefined
    ? 'Public multi-carrier API — show FedEx, UPS, DHL, Correos, BRT, InPost... never wholesale channels.'
    : String(options.publicNote || '');
  if (publicNote) drawText(publicNote, 8.5, false);
  y -= 10;

  for (const section of doc.sections) {
    y -= 4;
    drawText(section.title, headingSize, true);
    y -= 2;
    for (const ln of wrap(section.body)) {
      if (ln === '') {
        y -= 5;
        continue;
      }
      drawText(ln, fontSize, false);
    }
    y -= 6;
  }
  pages.push(cmds);

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const font1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const font2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const contentIds: number[] = [];
  for (const pageCmds of pages) {
    const stream = pageCmds.join('\n');
    const len = Buffer.byteLength(stream, 'latin1');
    contentIds.push(add(`<< /Length ${len} >>\nstream\n${stream}\nendstream`));
  }
  const pageIds: number[] = [];
  for (const contentId of contentIds) {
    pageIds.push(
      add(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> >>`
      )
    );
  }
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const pagesId = add(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);
  for (const pid of pageIds) {
    objects[pid - 1] = objects[pid - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
