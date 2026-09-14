import { Router, Request, Response } from 'express';
import { pool } from '../db/connection';
import { ContradoService } from '../services/contradoService';
import { PodSyncWorker } from './podSyncWorker';
import { UserRepo } from '../db/repos';
import crypto from 'crypto';

export const podRouter = Router();

// Middleware super_admin
const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores.' });
  }
  next();
};

// -----------------------------------------------------------------------------
// 1. PUBLIC / CLIENT ROUTES
// -----------------------------------------------------------------------------

/**
 * Obtener detalle extendido de un producto POD (especificaciones, size chart, 3D mockups)
 */
podRouter.get('/products/:listingId', async (req: Request, res: Response) => {
  try {
    const { listingId } = req.params;
    const [rows]: any = await pool.query(
      `SELECT p.*, l.slug, l.title, l.price_minor, l.currency, l.quantity, l.status
       FROM pod_products p
       JOIN marketplace_listings l ON p.listing_id = l.id
       WHERE p.listing_id = ? OR l.slug = ? LIMIT 1`,
      [listingId, listingId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Producto POD no encontrado.' });
    }

    const item = rows[0];
    const [variants]: any = await pool.query(
      'SELECT * FROM pod_product_variants WHERE pod_product_id = ?',
      [item.listing_id]
    );

    res.json({
      success: true,
      product: {
        ...item,
        images: typeof item.product_images_json === 'string' ? JSON.parse(item.product_images_json) : item.product_images_json,
        images3d: typeof item.product_3d_images_json === 'string' ? JSON.parse(item.product_3d_images_json) : item.product_3d_images_json,
        careInstruction: typeof item.care_instruction_json === 'string' ? JSON.parse(item.care_instruction_json) : item.care_instruction_json,
        specifications: typeof item.specifications_json === 'string' ? JSON.parse(item.specifications_json) : item.specifications_json,
        sizeChart: typeof item.size_chart_json === 'string' ? JSON.parse(item.size_chart_json) : item.size_chart_json,
        variants: variants.map((v: any) => ({
          ...v,
          attributes: typeof v.attributes_json === 'string' ? JSON.parse(v.attributes_json) : v.attributes_json
        }))
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al consultar producto POD.' });
  }
});

/**
 * Cotizar tarifa de envío real Contrado para un producto según el país de destino
 */
podRouter.post('/shipping/quote', async (req: Request, res: Response) => {
  try {
    const { listingId, countryCode, cultureCode = 'it-IT', quantity = 1 } = req.body;
    if (!countryCode) {
      return res.status(400).json({ error: 'El código de país es requerido.' });
    }

    let shippingPriceGroupId = 1;
    if (listingId) {
      const [prod]: any = await pool.query(
        'SELECT shipping_price_group_id FROM pod_products WHERE listing_id = ? LIMIT 1',
        [listingId]
      );
      if (prod.length && prod[0].shipping_price_group_id) {
        shippingPriceGroupId = prod[0].shipping_price_group_id;
      }
    }

    // Consultar tarifa en caché local sincronizada
    const [rates]: any = await pool.query(
      `SELECT * FROM pod_shipping_cache
       WHERE shipping_price_group_id = ? AND country_code = ?
       ORDER BY id DESC LIMIT 1`,
      [shippingPriceGroupId, countryCode.toUpperCase()]
    );

    let priceMinor = 1500; // 15.00 EUR fallback por defecto para envíos internacionales
    let incrementMinor = 300;
    let currency = 'EUR';
    let regionName = 'Estándar Internacional Contrado';

    if (rates.length > 0) {
      priceMinor = rates[0].price_minor;
      incrementMinor = rates[0].increment_value_minor;
      currency = rates[0].currency;
      regionName = rates[0].region_name;
    }

    const totalShippingMinor = priceMinor + Math.max(0, quantity - 1) * incrementMinor;

    res.json({
      success: true,
      quote: {
        shippingPriceMinor: totalShippingMinor,
        shippingPrice: totalShippingMinor / 100,
        currency,
        regionName,
        carrier: 'Contrado Express / International Courier',
        estimatedDays: '3-6 días hábiles'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al cotizar envío POD.' });
  }
});

// -----------------------------------------------------------------------------
// 2. ADMIN ROUTES
// -----------------------------------------------------------------------------

/**
 * Obtener estado de conexión y métricas de Zubuy Print
 */
podRouter.get('/admin/status', async (_req: any, res: Response) => {
  try {
    const [settings]: any = await pool.query('SELECT * FROM contrado_settings WHERE store_id = 61803 LIMIT 1');
    const [countRows]: any = await pool.query(
      "SELECT COUNT(*) as count FROM marketplace_listings WHERE provider = 'contrado' AND status = 'active'"
    );
    const [orderRows]: any = await pool.query('SELECT COUNT(*) as count FROM pod_orders');

    const config = settings[0] || {};
    const apiKey = process.env.CONTRADO_API_KEY || '';
    const maskedKey = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'No configurada';

    res.json({
      success: true,
      status: {
        isConnected: Boolean(apiKey),
        storeId: config.store_id || 61803,
        storeName: config.store_name || 'Zubuy Print',
        cultureCode: config.culture_code || 'it-IT',
        baseCurrency: config.base_currency || 'EUR',
        globalMarginPercent: Number(config.global_margin_percent || 35),
        activeProductsCount: countRows[0]?.count || 0,
        totalOrdersCount: orderRows[0]?.count || 0,
        canvasStatus: config.canvas_enabled ? 'Disponible' : 'En validación (API Artwork pendiente)',
        lastSyncedAt: config.last_synced_at,
        nextSyncAt: config.next_sync_at,
        lastSyncStatus: config.last_sync_status,
        lastSyncMessage: config.last_sync_message,
        apiKeyMasked: maskedKey
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al consultar estado de Zubuy Print.' });
  }
});

/**
 * Disparar sincronización manual inmediata
 */
podRouter.post('/admin/sync', async (req: any, res: Response) => {
  try {
    const { batchSize = 20, pageNumber = 1 } = req.body;
    const result = await PodSyncWorker.syncCatalog({ batchSize, pageNumber });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al iniciar sincronización.' });
  }
});

/**
 * Actualizar configuración y margen global
 */
podRouter.put('/admin/settings', async (req: any, res: Response) => {
  try {
    const { globalMarginPercent, storeName } = req.body;
    await pool.query(
      `UPDATE contrado_settings SET
        global_margin_percent = ?,
        store_name = ?
      WHERE store_id = 61803`,
      [Number(globalMarginPercent || 35), storeName || 'Zubuy Print']
    );
    res.json({ success: true, message: 'Configuración actualizada.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al guardar configuración.' });
  }
});

// -----------------------------------------------------------------------------
// 3. CONTRADO WEBHOOK RECEIVER (POST /api/webhooks/contrado)
// -----------------------------------------------------------------------------

export async function handleContradoWebhook(req: Request, res: Response) {
  try {
    const timestampHeader = String(req.headers['webhook-timestamp'] || '');
    const signatureHeader = String(req.headers['x-hub-signature-256'] || '');
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    // Si la firma está configurada, validamos HMAC
    if (signatureHeader && timestampHeader) {
      const isValid = ContradoService.verifyWebhookSignature(timestampHeader, rawBody, signatureHeader);
      if (!isValid) {
        console.warn('[Contrado Webhook] Firma HMAC inválida o fuera de tolerancia.');
        return res.status(401).json({ error: 'Firma de webhook no válida.' });
      }
    }

    const payload = req.body;
    const { EntityType, EntityAction, EntityId, LatestStatus, Description } = payload;

    console.log(`[Contrado Webhook] Evento recibido: ${EntityType} -> ${EntityAction} (ID: ${EntityId}, Status: ${LatestStatus})`);

    // Log para auditoría
    await ContradoService.logWebhookEvent({
      entityId: EntityId,
      entityType: EntityType || 'Unknown',
      entityAction: EntityAction || 'Unknown',
      latestStatus: LatestStatus,
      description: Description,
      payload,
      signature: signatureHeader
    });

    // Manejar cambios de estado de órdenes
    if (EntityType === 'Order' && EntityAction === 'OrderStatusChange') {
      await pool.query(
        `UPDATE pod_orders SET
          contrado_status = ?,
          production_status = ?,
          updated_at = NOW()
        WHERE contrado_order_id = ?`,
        [LatestStatus, LatestStatus, EntityId]
      );
    }

    // Manejar productos discontinuados o reactivados
    if (EntityType === 'Product') {
      if (EntityAction === 'ProductDisContinue' || EntityAction === 'ProductOutOfStock') {
        await pool.query(
          "UPDATE pod_products SET is_out_of_stock = 1 WHERE contrado_product_id = ?",
          [EntityId]
        );
      } else if (EntityAction === 'ProductRestored' || EntityAction === 'ProductInStock') {
        await pool.query(
          "UPDATE pod_products SET is_out_of_stock = 0 WHERE contrado_product_id = ?",
          [EntityId]
        );
      }
    }

    return res.status(200).json({ success: true, message: 'Webhook procesado exitosamente.' });
  } catch (err: any) {
    console.error('[Contrado Webhook] Error procesando evento:', err);
    return res.status(500).json({ error: 'Error interno en webhook.' });
  }
}
