import https from 'https';
import crypto from 'crypto';
import { pool } from '../db/connection';

const API_BASE = process.env.CONTRADO_API_BASE || 'https://api.contrado.app/helix/v1';

export class ContradoService {
  private static getApiKey(): string {
    return process.env.CONTRADO_API_KEY || '';
  }

  private static getStoreId(): string {
    return process.env.CONTRADO_STORE_ID || '61803';
  }

  /**
   * Helper para peticiones HTTP a Contrado Helix API
   */
  public static async request<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<{ status: number; success: boolean; data: T | null; message?: string; raw?: any }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { status: 500, success: false, data: null, message: 'CONTRADO_API_KEY no configurada' };
    }

    const storeId = this.getStoreId();
    const url = new URL(`${API_BASE}${path}`);
    
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      'X-Store-Id': storeId,
      ...extraHeaders
    };

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    return new Promise((resolve) => {
      const req = https.request(url, { method, headers }, (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(rawData);
            resolve({
              status: res.statusCode || 200,
              success: parsed.success !== false && (res.statusCode || 200) < 400,
              data: parsed.data ?? parsed,
              message: parsed.message,
              raw: parsed
            });
          } catch {
            resolve({
              status: res.statusCode || 200,
              success: (res.statusCode || 200) < 400,
              data: null,
              message: rawData,
              raw: rawData
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          status: 500,
          success: false,
          data: null,
          message: err.message
        });
      });

      if (payload) req.write(payload);
      req.end();
    });
  }

  /**
   * 1. Obtener información de la tienda
   */
  public static async getStores() {
    return this.request('/stores');
  }

  /**
   * 2. Obtener colecciones
   */
  public static async getCollections(pageNumber = 1, pageSize = 50) {
    return this.request(`/stores/collections?PageNumber=${pageNumber}&PageSize=${pageSize}`);
  }

  /**
   * 3. Obtener productos de la tienda con paginación
   */
  public static async getProducts(pageNumber = 1, pageSize = 20) {
    return this.request(`/stores/products?PageNumber=${pageNumber}&PageSize=${pageSize}`);
  }

  /**
   * 4. Obtener detalle completo de un producto
   */
  public static async getProductDetail(storeProductId: number) {
    return this.request(`/stores/products/${storeProductId}`);
  }

  /**
   * 5. Obtener variantes y opciones de producto
   */
  public static async getProductOptionVariants(storeProductId: number) {
    return this.request(`/stores/products/${storeProductId}/option-variants`);
  }

  /**
   * 6. Obtener tarifas de envío por cultura (ej: it-IT, es-ES, en-GB)
   */
  public static async getShippingRates(cultureCode = 'it-IT') {
    return this.request(`/shipping/${encodeURIComponent(cultureCode)}`);
  }

  /**
   * 7. Crear orden de producción
   */
  public static async createOrder(orderData: {
    externalReferenceId: string;
    recipient: {
      fullName: string;
      email: string;
      phone?: string;
      line1: string;
      line2?: string;
      city: string;
      stateName?: string;
      postCode: string;
      countryCode: string;
    };
    lineItem: Array<{
      storeProductId: number;
      variantId?: string;
      externalReferenceId?: string;
      selectedOptions?: Array<{
        optionId: number;
        optionName: string;
        optionValueId: number;
        optionValueName: string;
      }>;
      quantity: number;
      price: number;
    }>;
    totalAmount: number;
    currencyCode: string;
    cultureCode: string;
    forceInsert?: boolean;
  }) {
    return this.request('/orders/create', 'POST', orderData);
  }

  /**
   * 8. Consultar estado de una orden
   */
  public static async getOrderStatus(orderId: number | string) {
    return this.request(`/orders/${orderId}/status`);
  }

  /**
   * 9. Consultar tracking y envío de una orden
   */
  public static async getOrderShipmentStatus(orderId: number | string) {
    return this.request(`/orders/${orderId}/shipment/status`);
  }

  /**
   * Verificar firma HMAC-SHA256 de webhook Contrado
   */
  public static verifyWebhookSignature(
    timestampHeader: string,
    rawJsonBody: string,
    signatureHeader: string,
    secretKey?: string
  ): boolean {
    const secret = secretKey || process.env.CONTRADO_WEBHOOK_SECRET || process.env.CONTRADO_API_KEY || '';
    if (!secret || !signatureHeader || !timestampHeader) return false;

    try {
      // Replay tolerance: 10 minutes (600 seconds)
      const unixSeconds = Number(timestampHeader);
      if (isNaN(unixSeconds) || Math.abs(Math.floor(Date.now() / 1000) - unixSeconds) > 600) {
        return false;
      }

      const signedPayload = `${timestampHeader}.${rawJsonBody}`;
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(signedPayload, 'utf8');
      const expectedSignature = `sha256=${hmac.digest('hex').toLowerCase()}`;

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signatureHeader.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  /**
   * Guardar evento de webhook para trazabilidad e idempotencia
   */
  public static async logWebhookEvent(event: {
    eventId?: string;
    entityId?: number;
    entityType: string;
    entityAction: string;
    latestStatus?: string;
    description?: string;
    payload: any;
    signature?: string;
  }) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pod_webhook_events (
        id, event_id, entity_id, entity_type, entity_action,
        latest_status, description, payload_json, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        event.eventId || null,
        event.entityId || null,
        event.entityType,
        event.entityAction,
        event.latestStatus || null,
        event.description || null,
        JSON.stringify(event.payload),
        event.signature || null
      ]
    );
    return id;
  }
}
