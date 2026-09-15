import { pool } from '../db/connection.js';
import crypto from 'crypto';
import { sendNotificationEvent } from '../services/emailService.js';

const INTERNAL_DOORDROP_URL = String(
  process.env.DOORDROP_INTERNAL_URL || process.env.INTERNAL_API_URL || 'http://127.0.0.1:3000'
).replace(/\/+$/, '');
const LIVE_QUOTE_TIMEOUT_MS = 12000;
const LIVE_FX_TIMEOUT_MS = 6000;

type MerchantContext = {
  id: string;
  name: string | null;
  email: string | null;
  country: string;
  currency: string;
  businessType: string | null;
  origin: { country: string; zipCode: string; city: string } | null;
};

function normalizeIsoCountry(value: any): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function normalizeCurrency(value: any): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function finitePositiveNumber(value: any): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

async function requestInternalJson(path: string, init: RequestInit = {}, timeoutMs = LIVE_QUOTE_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${INTERNAL_DOORDROP_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
    });
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      throw new Error(`DoorDrop API HTTP ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function getMerchantContext(userId: string): Promise<MerchantContext | null> {
  const [userRows]: any = await pool.query(
    `SELECT id, name, email, country, currency, business_type
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [userId]
  );
  const user = userRows[0];
  if (!user) return null;

  let address: any = null;
  try {
    const [pickupRows]: any = await pool.query(
      `SELECT city, zip_code, country
         FROM pickup_addresses
        WHERE user_id = ?
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1`,
      [userId]
    );
    address = pickupRows[0] || null;
  } catch {
    // Older installations may not have pickup_addresses yet; continue to the
    // next real address source instead of inventing an origin.
  }

  if (!address) {
    try {
      const [companyRows]: any = await pool.query(
        `SELECT city, zip_code, country
           FROM companies
          WHERE user_id = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
        [userId]
      );
      address = companyRows[0] || null;
    } catch {
      // Continue to the real sender address book below.
    }
  }

  if (!address) {
    try {
      const [senderRows]: any = await pool.query(
        `SELECT city, zip_code, country
           FROM address_book
          WHERE user_id = ? AND type = 'sender'
          ORDER BY is_default DESC, updated_at DESC
          LIMIT 1`,
        [userId]
      );
      address = senderRows[0] || null;
    } catch {
      // No configured sender address. The caller will return a clear action.
    }
  }

  const userCountry = normalizeIsoCountry(user.country);
  const userCurrency = normalizeCurrency(user.currency);
  const addressCountry = normalizeIsoCountry(address?.country);
  const addressZip = String(address?.zip_code || '').trim();
  const addressCity = String(address?.city || '').trim();

  return {
    id: String(user.id),
    name: user.name ? String(user.name) : null,
    email: user.email ? String(user.email) : null,
    country: userCountry,
    currency: userCurrency,
    businessType: user.business_type ? String(user.business_type) : null,
    origin: address && addressCountry && addressZip
      ? { country: addressCountry, zipCode: addressZip, city: addressCity }
      : null
  };
}

async function requestLiveShippingQuotes(sellerUserId: string, args: any, currencyOverride?: string) {
  const merchant = await getMerchantContext(sellerUserId);
  if (!merchant) return { success: false, error: 'No se encontró el negocio vendedor.' };

  const originCountry = normalizeIsoCountry(args.from_country || args.origin_country || merchant.origin?.country);
  const originZip = String(args.from_zip || args.origin_zip || merchant.origin?.zipCode || '').trim();
  const originCity = String(args.from_city || args.origin_city || merchant.origin?.city || '').trim();
  const destinationCountry = normalizeIsoCountry(args.to_country || args.dest_country || args.country);
  const destinationZip = String(args.zip_code || args.to_zip || args.dest_zip || args.zip || args.cap || '').trim();
  const destinationCity = String(args.city || args.to_city || args.dest_city || '').trim();
  const weightKg = finitePositiveNumber(args.weight_kg || args.weightKg || args.weight);
  const currency = normalizeCurrency(currencyOverride || args.currency || merchant.currency);

  if (!originCountry || !originZip) {
    return { success: false, error: 'El negocio debe configurar un país y código postal de recogida reales antes de cotizar.' };
  }
  if (!destinationCountry || !destinationZip) {
    return { success: false, error: 'Faltan el país y el código postal reales de destino.' };
  }
  if (!weightKg) {
    return { success: false, error: 'Falta el peso real del paquete en kilogramos.' };
  }
  if (!currency) {
    return { success: false, error: 'El negocio no tiene una moneda válida configurada.' };
  }

  const packageData: any = {
    weight: weightKg,
    qty: Math.max(1, Number(args.quantity || args.qty || 1))
  };
  for (const [source, target] of [['length_cm', 'length'], ['width_cm', 'width'], ['height_cm', 'height']] as const) {
    const value = finitePositiveNumber(args[source]);
    if (value) packageData[target] = value;
  }

  try {
    const payload = await requestInternalJson('/api/shipments/quote', {
      method: 'POST',
      body: JSON.stringify({
        originCountry,
        originZip,
        originCity,
        destCountry: destinationCountry,
        destZip: destinationZip,
        destCity: destinationCity,
        currency,
        packages: [packageData],
        persistQuotes: false
      })
    });
    const offers = Array.isArray(payload?.quotes) ? payload.quotes : [];
    return {
      success: true,
      merchant,
      origin: { country: originCountry, zip_code: originZip, city: originCity },
      destination: { country: destinationCountry, zip_code: destinationZip, city: destinationCity },
      weight_kg: weightKg,
      currency,
      offers: offers
        .filter((offer: any) => Number(offer?.customerPrice ?? offer?.total ?? offer?.price) > 0)
        .slice(0, 6)
        .map((offer: any) => ({
          id: offer.id || null,
          provider: offer.providerDisplayName || offer.provider || null,
          provider_code: offer.providerCode || null,
          carrier: offer.carrierName || null,
          service: offer.service || null,
          rate: Number(offer.customerPrice ?? offer.total ?? offer.price),
          currency: normalizeCurrency(offer.currency) || currency,
          delivery_time: offer.deliveryText || null,
          estimated_days: offer.estimatedDays ?? null
        }))
    };
  } catch (error: any) {
    console.error('[AI Sales Agent] Live quote error:', error?.message || 'unknown');
    return { success: false, error: 'No se pudo consultar la cotización multi-transportista en vivo.' };
  }
}

async function getLiveFxRates(): Promise<Record<string, number>> {
  const payload = await requestInternalJson('/api/currencies', {}, LIVE_FX_TIMEOUT_MS);
  const rates = payload?.rates;
  if (!rates || typeof rates !== 'object') throw new Error('Tasas FX no disponibles.');
  return rates;
}

function convertViaEur(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const sourceAmount = Number(amount);
  if (!from || !to || !Number.isFinite(sourceAmount)) throw new Error('Moneda o importe no válido.');
  if (from === to) return Number(sourceAmount.toFixed(2));
  const fromRate = Number(rates[from]);
  const toRate = Number(rates[to]);
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    throw new Error('No hay tasa FX para convertir este importe.');
  }
  return Number(((sourceAmount / fromRate) * toRate).toFixed(2));
}

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
    args = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
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
            currency: normalizeCurrency(p.currency) || null,
            stock: p.quantity,
            weight_grams: p.weight_grams || 300,
            description: p.description?.slice(0, 180) || '',
            primary_image: p.cover_image ? p.cover_image.replace(/^http:\/\//i, 'https://') : null
          }))
        };
      }

      case 'get_product_recommendation': {
        const category = String(args.category || '').trim();
        const requirements = String(args.customer_requirements || args.query || '').trim();
        const maxPrice = Number(args.max_price);
        const priceLimit = Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice * 100 : null;
        const terms = Array.from(new Set(
          [category, requirements]
            .join(' ')
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((term: string) => term.length >= 2)
        )).slice(0, 8);

        const conditions = [
          '(l.seller_id = ? OR ? = \'\')',
          "l.status = 'active'",
          'COALESCE(l.quantity, 0) > 0'
        ];
        const params: any[] = [sellerUserId, sellerUserId];
        if (terms.length > 0) {
          conditions.push(`(${terms.map(() => '(l.title LIKE ? OR l.description LIKE ? OR l.category_id IN (SELECT id FROM marketplace_categories WHERE name LIKE ?))').join(' OR ')})`);
          for (const term of terms) params.push(`%${term}%`, `%${term}%`, `%${term}%`);
        }
        if (priceLimit !== null) {
          conditions.push('l.price_minor <= ?');
          params.push(Math.round(priceLimit));
        }

        const [rows]: any = await pool.query(
          `SELECT l.id, l.title, l.description, l.price_minor, l.currency, l.quantity, l.category_id, l.weight_grams,
                  (SELECT img.url FROM marketplace_listing_images img WHERE img.listing_id = l.id ORDER BY img.is_cover DESC, img.sort_order ASC LIMIT 1) AS cover_image
             FROM marketplace_listings l
            WHERE ${conditions.join(' AND ')}
            ORDER BY l.updated_at DESC
            LIMIT 3`,
          params
        );

        return {
          count: rows.length,
          basis: 'Catálogo real DoorDrop: artículos activos con disponibilidad comprobada.',
          products: rows.map((p: any, index: number) => ({
            position: index + 1,
            id: p.id,
            title: p.title,
            price: Number((Number(p.price_minor || 0) / 100).toFixed(2)),
            currency: normalizeCurrency(p.currency) || null,
            stock: Number(p.quantity || 0),
            description: String(p.description || '').slice(0, 240),
            primary_image: p.cover_image ? String(p.cover_image).replace(/^http:\/\//i, 'https://') : null
          }))
        };
      }

      case 'get_store_info': {
        const [storeRows]: any = await pool.query(
          `SELECT id, name, email, phone, country, currency, business_type, status
             FROM users
            WHERE id = ?
            LIMIT 1`,
          [sellerUserId]
        );
        if (!storeRows.length) return { found: false, message: 'No se encontró la tienda.' };

        const [settingsRows]: any = await pool.query(
          `SELECT business_info, sales_contract_text, free_shipping_threshold, min_order_amount, website_url
             FROM omnichannel_ai_settings
            WHERE user_id = ?
            LIMIT 1`,
          [sellerUserId]
        );
        const store = storeRows[0];
        const settings = settingsRows[0] || {};
        const merchantContext = await getMerchantContext(sellerUserId);
        return {
          found: true,
          store: {
            name: store.name || null,
            email: store.email || null,
            phone: store.phone || null,
            country: store.country || null,
            currency: normalizeCurrency(store.currency) || null,
            business_type: store.business_type || null,
            status: store.status || null,
            website_url: settings.website_url || null,
            business_info: settings.business_info || null,
            fulfillment_origin: merchantContext?.origin || null
          },
          policies: {
            sales_contract: settings.sales_contract_text || null,
            free_shipping_threshold: settings.free_shipping_threshold === null || settings.free_shipping_threshold === undefined
              ? null
              : Number(settings.free_shipping_threshold),
            min_order_amount: settings.min_order_amount === null || settings.min_order_amount === undefined
              ? null
              : Number(settings.min_order_amount)
          }
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
          currency: normalizeCurrency(product.currency) || null,
          images,
          media_attachment_url: primaryImage,
          message: `Fotos oficiales encontradas para ${product.title} (${price.toFixed(2)} ${normalizeCurrency(product.currency) || 'moneda del producto'}): ${primaryImage}`
        };
      }

      case 'quote_shipping': {
        const liveQuote = await requestLiveShippingQuotes(sellerUserId, args);
        if (!liveQuote.success) return liveQuote;

        const [aiSettings]: any = await pool.query(
          'SELECT free_shipping_threshold FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1',
          [sellerUserId]
        );
        const configuredThreshold = aiSettings[0]?.free_shipping_threshold;
        const freeThreshold = configuredThreshold === null || configuredThreshold === undefined
          ? null
          : Number(configuredThreshold);

        return {
          live: true,
          source: 'DoorDrop multi-carrier API',
          origin: liveQuote.origin,
          destination: liveQuote.destination,
          weight_kg: liveQuote.weight_kg,
          currency: liveQuote.currency,
          offers: liveQuote.offers,
          free_shipping_currency: liveQuote.merchant.currency || null,
          free_shipping_applicable_from: Number.isFinite(freeThreshold) && freeThreshold > 0 ? freeThreshold : null,
          summary: liveQuote.offers.length > 0
            ? `Se encontraron ${liveQuote.offers.length} opciones reales de transporte en ${liveQuote.currency}.`
            : 'No hay ofertas reales disponibles para esta ruta, peso y configuración.'
        };
      }

      case 'create_order_checkout': {
        const productName = String(args.product_name || args.product_title || '').trim();
        const requestedQuantity = Number(args.quantity);
        const quantity = Number.isFinite(requestedQuantity) ? Math.max(1, Math.floor(requestedQuantity)) : 1;
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
          `SELECT id, slug, title, price_minor, currency, quantity, weight_grams, city, country_code, postal_code
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
            `SELECT id, slug, title, price_minor, currency, quantity, weight_grams, city, country_code, postal_code
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
        const availableQuantity = Number(prod.quantity || 0);
        if (availableQuantity < quantity) {
          return { success: false, error: 'La cantidad solicitada ya no está disponible en el catálogo.' };
        }

        const merchant = await getMerchantContext(sellerUserId);
        if (!merchant) {
          return { success: false, error: 'No se encontró el negocio vendedor.' };
        }
        const productCurrency = normalizeCurrency(prod.currency) || merchant.currency;
        if (!productCurrency) {
          return { success: false, error: 'El producto no tiene una moneda válida configurada.' };
        }

        // 2. Check seller business rules. Amounts configured in AI settings
        // belong to the merchant wallet currency, while listings may use a
        // different currency. Convert with the live DoorDrop FX endpoint.
        const [aiSettings]: any = await pool.query(
          "SELECT min_order_amount, free_shipping_threshold FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
          [sellerUserId]
        );
        const configuredMinOrder = aiSettings[0]?.min_order_amount;
        const configuredFreeThreshold = aiSettings[0]?.free_shipping_threshold;
        const rulesCurrency = merchant.currency || productCurrency;
        const minOrder = configuredMinOrder === null || configuredMinOrder === undefined
          ? null
          : Number(configuredMinOrder);
        const freeThreshold = configuredFreeThreshold === null || configuredFreeThreshold === undefined
          ? null
          : Number(configuredFreeThreshold);

        const unitPrice = prod.price_minor / 100;
        const productTotal = unitPrice * quantity;
        let productTotalInRulesCurrency = productTotal;
        if (rulesCurrency !== productCurrency && (minOrder !== null || freeThreshold !== null)) {
          try {
            const fxRates = await getLiveFxRates();
            productTotalInRulesCurrency = convertViaEur(productTotal, productCurrency, rulesCurrency, fxRates);
          } catch (error: any) {
            return { success: false, error: 'No se pudo validar el importe con la tasa de cambio vigente.' };
          }
        }

        if (minOrder !== null && Number.isFinite(minOrder) && minOrder > 0 && productTotalInRulesCurrency < minOrder) {
          return {
            success: false,
            error: `El pedido mínimo es ${minOrder.toFixed(2)} ${rulesCurrency}; el total actual equivale a ${productTotalInRulesCurrency.toFixed(2)} ${rulesCurrency}.`
          };
        }

        // Calculate shipping only from active, connected DoorDrop providers.
        // There is intentionally no country-based or EUR fallback here.
        const liveQuote = await requestLiveShippingQuotes(sellerUserId, {
          from_country: merchant.origin?.country || prod.country_code,
          from_zip: merchant.origin?.zipCode || prod.postal_code,
          from_city: merchant.origin?.city || prod.city,
          to_country: buyerCountry,
          zip_code: buyerZip,
          city: buyerCity,
          weight_kg: (Number(prod.weight_grams) > 0 ? Number(prod.weight_grams) / 1000 : null),
          quantity,
          currency: productCurrency
        }, productCurrency);
        if (!liveQuote.success) return liveQuote;

        const shippingOffer = liveQuote.offers[0];
        if (!shippingOffer) {
          return { success: false, error: 'No hay una opción real de transporte disponible para este destino.' };
        }
        let shippingRate = Number(shippingOffer.rate);
        if (!Number.isFinite(shippingRate) || shippingRate <= 0) {
          return { success: false, error: 'La cotización del transporte no devolvió un importe válido.' };
        }
        const freeShippingApplies = freeThreshold !== null
          && Number.isFinite(freeThreshold)
          && freeThreshold > 0
          && productTotalInRulesCurrency >= freeThreshold;
        if (freeShippingApplies) shippingRate = 0;

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
           VALUES (?, ?, ?, 'usr_guest_omnichannel', ?, ?, ?, ?, ?, 'pending_payment', 'online_checkout', ?, ?)`,
          [
            orderId,
            orderNumber,
            prod.id,
            sellerUserId,
            Math.round(productTotal * 100),
            Math.round(shippingRate * 100),
            Math.round(totalAmount * 100),
            productCurrency,
            buyerAddressJson,
            shippingOffer.service || shippingOffer.carrier || shippingOffer.provider || 'Servicio de transporte'
          ]
        );

        // The marketplace listing is the real authenticated checkout entry
        // point. Do not return the former non-existent order checkout route.
        const appUrl = String(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
        const checkoutUrl = `${appUrl}/marketplace/producto/${encodeURIComponent(String(prod.slug || prod.id))}`;

        return {
          success: true,
          order_id: orderId,
          order_number: orderNumber,
          product: prod.title,
          quantity,
          product_price: unitPrice,
          shipping_rate: shippingRate,
          free_shipping: freeShippingApplies,
          shipping_provider: shippingOffer.provider,
          shipping_service: shippingOffer.service,
          total_amount: totalAmount,
          currency: productCurrency,
          checkout_url: checkoutUrl,
          message: `Pedido #${orderNumber} preparado. Producto: ${prod.title}. Total: ${totalAmount.toFixed(2)} ${productCurrency} (${freeShippingApplies ? 'envío gratuito' : `transporte ${shippingRate.toFixed(2)} ${productCurrency}`}). Enlace de pago: ${checkoutUrl}`
        };
      }

      case 'lookup_or_generate_tracking': {
        const query = String(args.order_number || args.query || '').trim();
        const [orders]: any = await pool.query(
          `SELECT id, order_number, status, tracking_code, shipping_service_name, created_at
           FROM marketplace_orders
           WHERE seller_id = ?
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
            service: o.shipping_service_name || null,
            message: 'El pedido existe, pero todavía no tiene una guía real asignada por el transportista.'
          };
        }

        return {
          found: true,
          order_number: o.order_number,
          tracking_code: tracking,
          service: o.shipping_service_name || null,
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
        const merchant = await getMerchantContext(sellerUserId);
        return {
          min_order_amount: s.min_order_amount === null || s.min_order_amount === undefined ? null : Number(s.min_order_amount),
          free_shipping_threshold: s.free_shipping_threshold === null || s.free_shipping_threshold === undefined ? null : Number(s.free_shipping_threshold),
          currency: merchant?.currency || null,
          contract_conditions: s.sales_contract_text || null,
          source: 'Configuración comercial real del negocio; no se aplican políticas por defecto.'
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
