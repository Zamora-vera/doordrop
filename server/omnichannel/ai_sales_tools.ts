import { pool } from '../db/connection.js';
import crypto from 'crypto';
import { sendNotificationEvent } from '../services/emailService';

/**
 * Autonomous Sales Tools for DoorDrop AI Employee:
 * 1. search_products: Find products by name or category with photos, prices, descriptions
 * 2. send_product_photos: Return direct product image URLs and media details to render in chat
 * 3. quote_shipping: Real DoorDrop shipping calculation by country, city and ZIP code
 * 4. create_order_checkout: Conclude transactions, create row in marketplace_orders, generate secure payment link
 * 5. lookup_or_generate_tracking: Retrieve live tracking info from an actual order
 * 6. verify_business_rules: Validate minimum order amount, free shipping, and seller return/exchange terms
 * 7. handoff_to_human: Alert human team for complex inquiries
 */

export async function handleAIToolCall(toolName: string, args: any, sellerUserId: string) {
  try {
    switch (toolName) {
      case 'search_products': {
        const query = String(args.query || args.term || '').trim();
        const [rows]: any = await pool.query(
          `SELECT l.id, l.title, l.description, l.price_minor, l.currency, l.quantity, l.status, l.weight_grams,
                  (SELECT img.url FROM marketplace_listing_images img WHERE img.listing_id = l.id ORDER BY img.is_cover DESC, img.sort_order ASC LIMIT 1) as cover_image
           FROM marketplace_listings l
           WHERE (l.seller_id = ? OR ? = '')
             AND (l.title LIKE ? OR l.description LIKE ?)
             AND l.status = 'active'
           LIMIT 6`,
          [sellerUserId, sellerUserId, `%${query}%`, `%${query}%`]
        );

        return {
          count: rows.length,
          products: rows.map((p: any) => ({
            id: p.id,
            title: p.title,
            price: Number((p.price_minor / 100).toFixed(2)),
            currency: p.currency || 'EUR',
            stock: p.quantity,
            weight_grams: p.weight_grams || 300,
            description: p.description?.slice(0, 180) || '',
            primary_image: p.cover_image ? p.cover_image.replace(/^http:\/\//i, 'https://') : null
          }))
        };
      }

      case 'send_product_photos': {
        const term = String(args.product_name || args.query || args.product_id || '').trim();
        const searchWords = term.split(/\s+/).filter((w: string) => w.length >= 2);

        let rows: any[] = [];
        const [exactRows]: any = await pool.query(
          `SELECT l.id, l.title, l.price_minor, l.currency, l.quantity
           FROM marketplace_listings l
           WHERE (l.seller_id = ? OR ? = '')
             AND (l.title LIKE ? OR l.id = ?)
             AND l.status = 'active'
           LIMIT 1`,
          [sellerUserId, sellerUserId, `%${term}%`, term]
        );

        if (exactRows.length) {
          rows = exactRows;
        } else if (searchWords.length > 0) {
          const likeClauses = searchWords.map(() => `(l.title LIKE ? OR l.description LIKE ?)`).join(' AND ');
          const params: any[] = [sellerUserId, sellerUserId];
          for (const w of searchWords) params.push(`%${w}%`, `%${w}%`);

          const [fallbackRows]: any = await pool.query(
            `SELECT l.id, l.title, l.price_minor, l.currency, l.quantity
             FROM marketplace_listings l
             WHERE (l.seller_id = ? OR ? = '')
               AND (${likeClauses})
               AND l.status = 'active'
             LIMIT 1`,
            params
          );
          rows = fallbackRows;
        }

        if (!rows.length) {
          return { found: false, message: `Non abbiamo trovato foto per "${term}".` };
        }

        const product = rows[0];
        const [imgRows]: any = await pool.query(
          `SELECT url FROM marketplace_listing_images WHERE listing_id = ? ORDER BY is_cover DESC, sort_order ASC LIMIT 4`,
          [product.id]
        );

        const images = imgRows.map((r: any) => r.url.replace(/^http:\/\//i, 'https://'));
        const price = Number((product.price_minor / 100).toFixed(2));
        const primaryImage = images[0] || null;

        return {
          found: true,
          product_id: product.id,
          title: product.title,
          price,
          currency: product.currency || 'EUR',
          images,
          media_attachment_url: primaryImage,
          message: `Foto trovate per ${product.title} (€${price} EUR): ${primaryImage}`
        };
      }

      case 'quote_shipping': {
        const fromCountry = 'IT';
        const toCountry = String(args.to_country || args.country || 'IT').toUpperCase().trim();
        const zipCode = String(args.zip_code || args.zip || args.cap || '').trim();
        const city = String(args.city || '').trim();
        const weightKg = Number(args.weight_kg) || 0.5;

        // Check seller settings for free shipping threshold
        const [aiSettings]: any = await pool.query(
          "SELECT free_shipping_threshold, min_order_amount FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
          [sellerUserId]
        );
        const freeThreshold = Number(aiSettings[0]?.free_shipping_threshold || 50.0);

        let rate = 7.50;
        let carrier = 'DoorDrop Italia Express';
        let deliveryTime = '24/48 ore lavorative';

        if (toCountry === 'IT') {
          // Italian domestic rates
          const isIsland = zipCode.startsWith('9') || zipCode.startsWith('07') || zipCode.startsWith('08');
          rate = isIsland
            ? 8.90
            : 7.50 + Math.max(0, (weightKg - 1) * 1.50);
          carrier = isIsland ? 'DoorDrop Isole Express' : 'DoorDrop Italia Express';
          deliveryTime = isIsland ? '48/72 ore' : '24/48 ore';
        } else if (['ES', 'FR', 'DE', 'AT', 'BE', 'NL', 'PT'].includes(toCountry)) {
          rate = 12.90 + Math.max(0, (weightKg - 1) * 2.50);
          carrier = 'DoorDrop EuroExpress';
          deliveryTime = '3-4 giorni lavorativi';
        } else {
          rate = 22.00 + Math.max(0, (weightKg - 1) * 5.00);
          carrier = 'DoorDrop Global Courier';
          deliveryTime = '4-6 giorni lavorativi';
        }

        const finalRate = Number(rate.toFixed(2));
        return {
          origin: fromCountry,
          destination: { country: toCountry, zip_code: zipCode, city },
          weight_kg: weightKg,
          rate: finalRate,
          currency: 'EUR',
          carrier,
          delivery_time: deliveryTime,
          free_shipping_applicable_from: freeThreshold,
          summary: `Spedizione per ${city || toCountry} (CAP: ${zipCode || 'standard'}) con ${carrier}: €${finalRate} EUR (${deliveryTime}). Gratuita a partire da €${freeThreshold}!`
        };
      }

      case 'create_order_checkout': {
        const productName = String(args.product_name || args.product_title || '').trim();
        const quantity = Math.max(1, Number(args.quantity) || 1);
        const buyerName = String(args.buyer_name || args.customer_name || '').trim();
        const buyerEmail = String(args.buyer_email || args.customer_email || args.email || '').trim().toLowerCase();
        const buyerPhone = String(args.buyer_phone || args.phone || '').trim();
        const buyerAddress = String(args.buyer_address || args.address || '').trim();
        const buyerZip = String(args.buyer_zip || args.zip_code || args.cap || '').trim();
        const buyerCity = String(args.buyer_city || args.city || '').trim();
        const buyerCountry = String(args.buyer_country || args.country || '').toUpperCase().trim();

        if (!buyerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) || !buyerAddress || !buyerCity || !/^[A-Z]{2}$/.test(buyerCountry)) {
          return { success: false, error: 'Para crear el checkout necesito nombre, correo, dirección, ciudad y país del comprador.' };
        }

        // 1. Find listing with flexible multi-word matching
        const searchWords = productName.split(/\s+/).filter((w: string) => w.length >= 2);
        let prods: any[] = [];

        const [exactProds]: any = await pool.query(
          `SELECT id, title, price_minor, currency, quantity, weight_grams
           FROM marketplace_listings
           WHERE (seller_id = ? OR ? = '')
             AND (title LIKE ? OR id = ?)
             AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`,
          [sellerUserId, sellerUserId, `%${productName}%`, productName]
        );

        if (exactProds.length) {
          prods = exactProds;
        } else if (searchWords.length > 0) {
          const likeClauses = searchWords.map(() => `(title LIKE ? OR description LIKE ?)`).join(' AND ');
          const params: any[] = [sellerUserId, sellerUserId];
          for (const w of searchWords) params.push(`%${w}%`, `%${w}%`);

          const [matchProds]: any = await pool.query(
            `SELECT id, title, price_minor, currency, quantity, weight_grams
             FROM marketplace_listings
             WHERE (seller_id = ? OR ? = '')
               AND (${likeClauses})
               AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`,
            params
          );
          prods = matchProds;
        }

        if (!prods.length) {
          return { success: false, error: `Articolo "${productName}" non trovato a catalogo o non disponibile.` };
        }
        const prod = prods[0];

        // 2. Check seller business rules
        const [aiSettings]: any = await pool.query(
          "SELECT min_order_amount, free_shipping_threshold FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
          [sellerUserId]
        );
        const minOrder = Number(aiSettings[0]?.min_order_amount || 0);
        const freeThreshold = Number(aiSettings[0]?.free_shipping_threshold || 50.0);

        const unitPrice = prod.price_minor / 100;
        const productTotal = unitPrice * quantity;

        if (minOrder > 0 && productTotal < minOrder) {
          return {
            success: false,
            error: `L'importo minimo per effettuare un ordine con questo venditore è di €${minOrder.toFixed(2)} EUR (totale attuale: €${productTotal.toFixed(2)}).`
          };
        }

        // Calculate shipping
        let shippingRate = (buyerCountry === 'IT') ? 7.50 : 12.90;
        if (freeThreshold > 0 && productTotal >= freeThreshold) {
          shippingRate = 0.00;
        }

        const totalAmount = Number((productTotal + shippingRate).toFixed(2));
        const orderId = crypto.randomUUID();
        const orderNumber = `DD-${Date.now().toString().slice(-6)}`;
        const buyerAddressJson = JSON.stringify({
          name: buyerName,
          email: buyerEmail,
          phone: buyerPhone,
          address: buyerAddress,
          zip_code: buyerZip,
          city: buyerCity,
          country: buyerCountry
        });

        // 3. Insert into marketplace_orders
        await pool.query(
          `INSERT INTO marketplace_orders 
            (id, order_number, listing_id, buyer_id, seller_id, product_amount_minor, shipping_amount_minor, total_amount_minor, currency, status, payment_method, buyer_address_json, shipping_service_name)
           VALUES (?, ?, ?, 'usr_guest_omnichannel', ?, ?, ?, ?, 'EUR', 'pending_payment', 'online_checkout', ?, 'DoorDrop Express')`,
          [
            orderId,
            orderNumber,
            prod.id,
            sellerUserId,
            Math.round(productTotal * 100),
            Math.round(shippingRate * 100),
            Math.round(totalAmount * 100),
            buyerAddressJson
          ]
        );

        const checkoutUrl = `https://doordrop.lat/marketplace/order/${orderId}/checkout`;

        return {
          success: true,
          order_id: orderId,
          order_number: orderNumber,
          product: prod.title,
          quantity,
          product_price: unitPrice,
          shipping_rate: shippingRate,
          free_shipping: shippingRate === 0,
          total_amount: totalAmount,
          currency: 'EUR',
          checkout_url: checkoutUrl,
          message: `Ordine #${orderNumber} pronto! Prodotto: ${prod.title}. Totale: €${totalAmount} EUR (${shippingRate === 0 ? 'Spedizione Gratuita!' : `Spedizione €${shippingRate}`}). Link pagamento sicuro: ${checkoutUrl}`
        };
      }

      case 'lookup_or_generate_tracking': {
        const query = String(args.order_number || args.query || '').trim();
        const [orders]: any = await pool.query(
          `SELECT id, order_number, status, tracking_code, shipping_service_name, created_at
           FROM marketplace_orders
           WHERE (seller_id = ? OR 1=1)
             AND (order_number LIKE ? OR tracking_code LIKE ? OR id = ?)
           LIMIT 1`,
          [sellerUserId, `%${query}%`, `%${query}%`, query]
        );

        if (!orders.length) {
          return { found: false, message: `Nessun ordine o spedizione trovata con riferimento "${query}".` };
        }

        const o = orders[0];
        const tracking = String(o.tracking_code || '').trim();
        if (!tracking) {
          return {
            found: true,
            tracking_pending: true,
            order_number: o.order_number,
            status: o.status || 'pending_payment',
            service: o.shipping_service_name || 'DoorDrop Express',
            message: 'El pedido existe, pero todavía no tiene una guía real asignada por el transportista.'
          };
        }

        return {
          found: true,
          order_number: o.order_number,
          tracking_code: tracking,
          service: o.shipping_service_name || 'DoorDrop Express',
          tracking_url: `https://doordrop.lat/tracking?code=${encodeURIComponent(tracking)}`,
          status: o.status || 'in_transit'
        };
      }

      case 'verify_business_rules': {
        const [settings]: any = await pool.query(
          "SELECT sales_contract_text, min_order_amount, free_shipping_threshold FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
          [sellerUserId]
        );
        const s = settings[0] || {};
        return {
          min_order_amount: Number(s.min_order_amount || 0),
          free_shipping_threshold: Number(s.free_shipping_threshold || 50.0),
          contract_conditions: s.sales_contract_text || 'Spedizioni espresse 24/48 ore con DoorDrop. Resi garantiti entro 14 giorni.'
        };
      }

      case 'handoff_to_human': {
        const requestedConversationId = Number(args.conversation_id || args.conversationId || args.local_conversation_id || 0);
        if (!requestedConversationId) {
          return {
            handoff: true,
            status: 'human_assignment_pending',
            message: 'La solicitud fue marcada para atención humana. Falta asociarla a una conversación activa.'
          };
        }

        const [conversationRows]: any = await pool.query(
          'SELECT * FROM omnichannel_conversations WHERE id = ? AND user_id = ? LIMIT 1',
          [requestedConversationId, sellerUserId]
        );
        if (!conversationRows.length) {
          return { handoff: false, status: 'conversation_not_found', message: 'No se encontró la conversación activa para transferir.' };
        }

        const conversation = conversationRows[0];
        const reason = String(args.reason || 'needs_human_support').trim().slice(0, 160);
        const summary = String(args.summary || conversation.last_message || conversation.contact_name || '').trim().slice(0, 1200);
        const [agentRows]: any = await pool.query(
          "SELECT member_id, name, email FROM omnichannel_team WHERE user_id = ? AND type = 'human' AND is_active = 1 ORDER BY created_at ASC LIMIT 1",
          [sellerUserId]
        );
        const agent = agentRows[0] || null;
        const assignedAgentId = agent?.member_id || 'team-human-pending';
        const assignedAgentName = agent?.name || 'Equipo Humano';

        await pool.query(
          `UPDATE omnichannel_conversations
           SET assigned_agent_id = ?, assigned_agent_name = ?, assigned_agent_type = 'human', ai_active = 0, status = 'open'
           WHERE id = ? AND user_id = ?`,
          [assignedAgentId, assignedAgentName, requestedConversationId, sellerUserId]
        );
        const [messageResult]: any = await pool.query(
          `INSERT INTO omnichannel_messages
            (conversation_id, direction, sender_type, sender_name, text_content, status)
           VALUES (?, 'outbound', 'system', 'Sistema DoorDrop', ?, 'read')`,
          [requestedConversationId, `🔔 Conversación transferida a ${assignedAgentName}. Motivo: ${reason}.`]
        );

        const [ownerRows]: any = await pool.query('SELECT id, name, email, country FROM users WHERE id = ? LIMIT 1', [sellerUserId]);
        const owner = ownerRows[0] || {};
        const customerEmail = String(owner.email || '').trim().toLowerCase();
        const ticketUrl = `${process.env.APP_URL || 'https://doordrop.lat'}/panel/omnichannel`;
        const handoffEntityId = `ai-${requestedConversationId}-${messageResult.insertId}`;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
          await sendNotificationEvent({
            eventCode: 'omnichannel_handoff_customer',
            entityType: 'omnichannel_handoff',
            entityId: handoffEntityId,
            audience: 'customer',
            userId: sellerUserId,
            toEmail: customerEmail,
            recipientName: owner.name || conversation.contact_name,
            language: owner.country || 'es',
            variables: {
              userName: owner.name || customerEmail,
              ticketId: `CONV-${requestedConversationId}`,
              ticketUrl,
              summary,
              statusLabel: `Asignada a ${assignedAgentName}`
            }
          }).catch(() => undefined);
        }

        const internalEmail = String(agent?.email || process.env.CANCELLATION_REVIEW_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(internalEmail)) {
          await sendNotificationEvent({
            eventCode: 'omnichannel_handoff_internal',
            entityType: 'omnichannel_handoff',
            entityId: handoffEntityId,
            audience: 'internal',
            toEmail: internalEmail,
            recipientName: assignedAgentName,
            language: 'es',
            variables: {
              customerName: owner.name || conversation.contact_name || 'Cliente',
              customerEmail: customerEmail || 'No disponible',
              ticketId: `CONV-${requestedConversationId}`,
              ticketUrl,
              channel: conversation.platform || 'omnichannel',
              reason,
              summary
            }
          }).catch(() => undefined);
        }

        return {
          handoff: true,
          status: internalEmail ? 'human_operator_alerted' : 'human_assignment_pending',
          conversation_id: requestedConversationId,
          assigned_agent: assignedAgentName,
          message: internalEmail
            ? 'La conversación fue transferida y el operador recibió el aviso.'
            : 'La conversación fue transferida al equipo humano; queda pendiente un correo de atención configurado.'
        };
      }

      default:
        return { error: `Strumento non riconosciuto: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[AI Sales Tools] Error executing ${toolName}:`, err);
    return { error: err.message || 'Errore durante l\'esecuzione dello strumento.' };
  }
}
