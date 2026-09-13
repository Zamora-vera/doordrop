import { pool } from '../db/connection.js';

/**
 * Internal tools callable by DoorDrop Omnichannel AI Employee:
 * 1. lookup_order: Search order by order number, buyer email or phone
 * 2. lookup_tracking: Search shipping/label tracking number across platform
 * 3. quote_shipping: Calculate instant DoorDrop shipping rate (Domestic / International)
 * 4. search_products: Search marketplace catalog products with price, stock, images
 * 5. get_store_info: Information about the current merchant's store
 */

export async function handleAIToolCall(toolName: string, args: any, sellerUserId: string) {
  try {
    switch (toolName) {
      case 'lookup_order': {
        const query = (args.query || args.order_id || args.order_number || '').trim();
        if (!query) return { error: 'Por favor proporciona el número de orden o email de compra.' };

        const [rows]: any = await pool.query(
          `SELECT id, order_number, total_amount, currency, status, payment_status, shipping_status, created_at, buyer_name, buyer_email
           FROM marketplace_orders
           WHERE (seller_user_id = ? OR ? = 0)
             AND (order_number LIKE ? OR buyer_email LIKE ? OR buyer_phone LIKE ? OR id = ?)
           ORDER BY id DESC LIMIT 5`,
          [sellerUserId, sellerUserId, `%${query}%`, `%${query}%`, `%${query}%`, isNaN(Number(query)) ? 0 : Number(query)]
        );

        if (rows.length === 0) {
          return { found: false, message: `No se encontró ningún pedido con la referencia "${query}".` };
        }
        return { found: true, orders: rows };
      }

      case 'lookup_tracking': {
        const tracking = (args.tracking_number || args.query || '').trim();
        if (!tracking) return { error: 'Proporciona el código de seguimiento o número de guía.' };

        // Check shipments / orders
        const [rows]: any = await pool.query(
          `SELECT s.id, s.tracking_number, s.carrier, s.status, s.sender_city, s.recipient_city, s.created_at, s.updated_at
           FROM shipments s
           WHERE s.tracking_number LIKE ? OR s.id = ?
           ORDER BY s.id DESC LIMIT 3`,
          [`%${tracking}%`, isNaN(Number(tracking)) ? 0 : Number(tracking)]
        );

        if (rows.length === 0) {
          return { found: false, message: `El número de seguimiento "${tracking}" no se encuentra en el sistema o aún no ha sido registrado por la transportadora.` };
        }
        return { found: true, shipment: rows[0] };
      }

      case 'quote_shipping': {
        const fromCountry = (args.from_country || 'IT').toUpperCase();
        const toCountry = (args.to_country || 'IT').toUpperCase();
        const weightKg = Number(args.weight_kg) || 1.0;

        // Standard DoorDrop internal estimate
        let baseRate = 6.90;
        let carrierName = 'DoorDrop Express';

        if (fromCountry === toCountry && fromCountry === 'IT') {
          baseRate = 7.50 + Math.max(0, (weightKg - 1) * 1.50);
          carrierName = 'DoorDrop Nazionale Italia';
        } else if (['ES', 'FR', 'DE', 'PT'].includes(toCountry)) {
          baseRate = 12.90 + Math.max(0, (weightKg - 1) * 2.80);
          carrierName = 'DoorDrop International EU';
        } else {
          baseRate = 24.50 + Math.max(0, (weightKg - 1) * 6.00);
          carrierName = 'DoorDrop Global Express';
        }

        return {
          from_country: fromCountry,
          to_country: toCountry,
          weight_kg: weightKg,
          estimated_rate: Number(baseRate.toFixed(2)),
          currency: 'EUR',
          carrier: carrierName,
          delivery_time: fromCountry === toCountry ? '24/48 ore lavorative' : '3-5 giorni lavorativi'
        };
      }

      case 'search_products': {
        const term = (args.query || args.term || '').trim();
        const [rows]: any = await pool.query(
          `SELECT id, title, price, currency, stock, images_json, category, status
           FROM marketplace_products
           WHERE (seller_user_id = ? OR is_active = 1)
             AND (title LIKE ? OR description LIKE ? OR category LIKE ?)
             AND status = 'active'
           LIMIT 6`,
          [sellerUserId, `%${term}%`, `%${term}%`, `%${term}%`]
        );

        return {
          count: rows.length,
          products: rows.map((p: any) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            currency: p.currency || 'EUR',
            stock: p.stock,
            images: (() => {
              try { return JSON.parse(p.images_json); } catch { return []; }
            })()
          }))
        };
      }

      case 'get_store_info': {
        const [rows]: any = await pool.query(
          `SELECT id, store_name, email, phone, city, country, address, zip_code
           FROM users
           WHERE id = ? LIMIT 1`,
          [sellerUserId]
        );
        if (rows.length === 0) return { error: 'Tienda no encontrada.' };
        return { store: rows[0] };
      }

      default:
        return { error: `Herramienta desconocida: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[Omnichannel AI Tools] Error running tool ${toolName}:`, err);
    return { error: err.message || 'Error interno ejecutando la consulta.' };
  }
}
