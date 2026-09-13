/**
 * LogiHub Internacional · SDK mínimo (Node.js)
 * Docs: https://logihub.tech/docs/v2/internacional/
 */
class LogiHubIntlClient {
  constructor(opts = {}) {
    this.apiKey = String(opts.apiKey || '').trim();
    this.baseUrl = String(opts.baseUrl || 'https://my.logihub.tech/api/v2').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (!this.apiKey) throw new Error('API key vacía. Genera una en https://my.logihub.tech/usuario/api/');
    if (typeof this.fetchImpl !== 'function') throw new Error('fetch no disponible');
  }
  services() { return this.request('GET', '/internacional/services.php'); }
  countries(query = {}) {
    const qs = new URLSearchParams();
    if (query.region) qs.set('region', query.region);
    if (query.q) qs.set('q', query.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.request('GET', `/internacional/countries.php${suffix}`);
  }
  statuses() { return this.request('GET', '/internacional/statuses.php'); }
  quote(body) { return this.request('POST', '/internacional/quote.php', body); }
  create(body) { return this.request('POST', '/internacional/create.php', body); }
  tracking(tracking) {
    return this.request('GET', `/internacional/tracking.php?tracking=${encodeURIComponent(tracking)}`);
  }
  label(tracking) {
    return this.request('GET', `/internacional/label.php?tracking=${encodeURIComponent(tracking)}`);
  }
  account() { return this.request('GET', '/account/summary.php'); }
  async request(method, path, body) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'Ship24Go-LogiHub-Intl/1.0',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: 'invalid_json', message: text }; }
    if (typeof data !== 'object' || data === null) data = { ok: false, message: String(data) };
    data.http_status = res.status;
    return data;
  }
}
module.exports = { LogiHubIntlClient };
