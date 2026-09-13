/** Swagger UI HTML for DoorDrop (clean AllSender-style) */

export function swaggerUiHtml(opts?: { openapiUrl?: string; title?: string; embed?: boolean }): string {
  const openapiUrl = opts?.openapiUrl || '/openapi.json';
  const title = opts?.title || 'DoorDrop API — Docs';
  const embed = Boolean(opts?.embed);
  const topbar = embed
    ? ''
    : `
  <header class="ship24-topbar">
    <div class="ship24-brand">
      <img src="/brand/logo.png" alt="DoorDrop" onerror="this.style.display='none'" />
      <span>DoorDrop API</span>
      <span class="ship24-badge">Docs</span>
    </div>
    <nav class="ship24-links">
      <a href="/openapi.json" target="_blank" rel="noreferrer">openapi.json</a>
      <a href="/api/docs/pdf?lang=en" target="_blank" rel="noreferrer">PDF</a>
      <a href="/api/docs/openai-tools.json" target="_blank" rel="noreferrer">OpenAI</a>
      <a href="/panel/api-docs">Panel</a>
    </nav>
  </header>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="icon" href="/brand/favicon-32.png" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    html, body { margin: 0; padding: 0; background: #fafafa; }
    .ship24-topbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 18px; background: #0f172a; color: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      position: sticky; top: 0; z-index: 30;
    }
    .ship24-topbar a { color: #e2e8f0; text-decoration: none; font-weight: 700; font-size: 12px; }
    .ship24-topbar a:hover { color: #fff; }
    .ship24-brand { display: flex; align-items: center; gap: 10px; font-weight: 900; }
    .ship24-brand img { height: 26px; border-radius: 6px; background: #fff; padding: 2px; }
    .ship24-links { display: flex; gap: 14px; flex-wrap: wrap; }
    .ship24-badge {
      font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
      background: #2563eb; padding: 3px 8px; border-radius: 999px;
    }
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .info { margin: 20px 0 12px; }
    .swagger-ui .info .title small { background: transparent !important; }
    .swagger-ui .scheme-container { box-shadow: none; background: #fff; }
    ${embed ? '#swagger-ui { padding-top: 4px; }' : ''}
  </style>
</head>
<body>
  ${topbar}
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(openapiUrl)},
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      showExtensions: true,
      showCommonExtensions: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      layout: 'BaseLayout',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    });
  </script>
</body>
</html>`;
}
