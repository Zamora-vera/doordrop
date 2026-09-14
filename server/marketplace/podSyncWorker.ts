import { pool } from '../db/connection';
import { ContradoService } from '../services/contradoService';
import crypto from 'crypto';

export class PodSyncWorker {
  private static isSyncing = false;

  private static generateSlug(title: string, id: number): string {
    const base = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 120);
    return `${base}-${id}`;
  }

  public static async getZubuySellerId(): Promise<string> {
    const [rows]: any = await pool.query(
      "SELECT id FROM marketplace_seller_profiles WHERE slug = 'zubuy-print' LIMIT 1"
    );
    if (rows.length > 0) return rows[0].id;
    throw new Error("Perfil de vendedor 'zubuy-print' no encontrado.");
  }

  public static async syncCatalog(options: { batchSize?: number; pageNumber?: number } = {}) {
    if (this.isSyncing) {
      console.log('[Zubuy Print Sync] Sincronización en curso, omitiendo ejecución redundante.');
      return { success: false, message: 'Actualización en curso' };
    }

    this.isSyncing = true;
    const batchSize = options.batchSize || 20;
    const pageNumber = options.pageNumber || 1;
    let syncedCount = 0;
    let failedCount = 0;

    try {
      console.log(`[Zubuy Print Sync] Consultando productos Contrado Helix (Lote ${batchSize}, Página ${pageNumber})...`);

      const [settingsRows]: any = await pool.query(
        "SELECT * FROM contrado_settings WHERE store_id = 61803 LIMIT 1"
      );
      const marginPercent = Number(settingsRows[0]?.global_margin_percent || 35.0);
      const sellerId = await this.getZubuySellerId();

      const prodRes = await ContradoService.getProducts(pageNumber, batchSize);

      // Si Contrado responde con "No Store Products Found", es un estado vacío legítimo
      const isNotFoundMsg = prodRes.message && prodRes.message.includes('No Store Products Found');
      if (!prodRes.success && !isNotFoundMsg) {
        throw new Error(prodRes.message || 'Error al conectar con Contrado Helix API');
      }

      const rawData = prodRes.data?.data || prodRes.data || [];
      const productsList = Array.isArray(rawData) ? rawData : [];

      console.log(`[Zubuy Print Sync] ${productsList.length} producto(s) encontrado(s) en la tienda Contrado.`);

      for (const p of productsList) {
        try {
          const contradoProdId = p.storeProductId || p.id;
          if (!contradoProdId) continue;

          const detailRes = await ContradoService.getProductDetail(contradoProdId);
          const detail = detailRes.data || p;

          const title = String(detail.storeProductName || detail.name || 'Producto Personalizado Zubuy').trim();
          const description = String(detail.storeProductDescription || detail.description || '').trim();
          const thumbUrl = detail.productThumb || detail.productImages?.[0]?.storeThumb800Quality || '';

          const variantRes = await ContradoService.getProductOptionVariants(contradoProdId);
          const variants = variantRes.data?.productVariants || [];

          let minCostMinor = 0;
          if (variants.length > 0) {
            const minCost = Math.min(...variants.map((v: any) => Number(v.price || v.costPrice || 0)));
            minCostMinor = Math.round(minCost * 100);
          } else {
            const cost = Number(detail.price || detail.costPrice || 25);
            minCostMinor = Math.round(cost * 100);
          }

          const retailPriceMinor = Math.round(minCostMinor * (1 + marginPercent / 100));
          const slug = this.generateSlug(title, contradoProdId);
          const listingId = crypto.randomUUID();

          const [existingListing]: any = await pool.query(
            "SELECT id FROM marketplace_listings WHERE external_product_id = ? AND provider = 'contrado' LIMIT 1",
            [String(contradoProdId)]
          );

          let activeListingId = listingId;

          if (existingListing.length > 0) {
            activeListingId = existingListing[0].id;
            await pool.query(
              `UPDATE marketplace_listings SET
                title = ?,
                description = ?,
                price_minor = ?,
                currency = 'EUR',
                status = 'active',
                quantity = 999,
                updated_at = NOW()
              WHERE id = ?`,
              [title, description, retailPriceMinor, activeListingId]
            );
          } else {
            await pool.query(
              `INSERT INTO marketplace_listings (
                id, seller_id, title, slug, description, condition_type,
                price_minor, currency, city, country_code, original_language,
                quantity, shipping_available, pickup_available, status,
                listing_type, provider, external_product_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'new', ?, 'EUR', 'Madrid', 'ES', 'it', 999, 1, 0, 'active', 'pod', 'contrado', ?, NOW(), NOW())`,
              [activeListingId, sellerId, title, slug, description, retailPriceMinor, String(contradoProdId)]
            );
          }

          if (thumbUrl) {
            const [imgExists]: any = await pool.query(
              "SELECT id FROM marketplace_listing_images WHERE listing_id = ? AND url = ? LIMIT 1",
              [activeListingId, thumbUrl]
            );
            if (!imgExists.length) {
              await pool.query(
                `INSERT INTO marketplace_listing_images (id, listing_id, url, sort_order, is_cover, created_at)
                 VALUES (?, ?, ?, 0, 1, NOW())`,
                [crypto.randomUUID(), activeListingId, thumbUrl]
              );
            }
          }

          const podId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO pod_products (
              id, listing_id, store_id, contrado_product_id, base_product_id,
              design_pattern_id, collection_id, name, description, product_thumb,
              product_images_json, product_3d_images_json, care_instruction_json,
              specifications_json, size_chart_json, production_time, is_out_of_stock,
              shipping_price_group_id, provider_cost_minor, provider_currency,
              retail_price_minor, retail_currency, margin_percent, sync_status,
              last_synced_at
            ) VALUES (?, ?, 61803, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'EUR', ?, 'synced', NOW())
            ON DUPLICATE KEY UPDATE
              listing_id = VALUES(listing_id),
              name = VALUES(name),
              description = VALUES(description),
              product_thumb = VALUES(product_thumb),
              product_images_json = VALUES(product_images_json),
              product_3d_images_json = VALUES(product_3d_images_json),
              provider_cost_minor = VALUES(provider_cost_minor),
              retail_price_minor = VALUES(retail_price_minor),
              margin_percent = VALUES(margin_percent),
              sync_status = 'synced',
              last_synced_at = NOW()`,
            [
              podId,
              activeListingId,
              contradoProdId,
              detail.baseProductId || null,
              detail.designPatternId || null,
              detail.collectionId || null,
              title,
              description,
              thumbUrl,
              JSON.stringify(detail.productImages || []),
              JSON.stringify(detail.product3dImages || []),
              JSON.stringify(detail.careInstruction || null),
              JSON.stringify(detail.productSpecification || []),
              JSON.stringify(detail.sizeChart || null),
              detail.productionTime || '3-5 días hábiles',
              detail.isOutOfStock ? 1 : 0,
              detail.shippingPriceGroupId || null,
              minCostMinor,
              retailPriceMinor,
              marginPercent
            ]
          );

          syncedCount++;
        } catch (err) {
          console.error('[Zubuy Print Sync] Error sincronizando producto individual:', err);
          failedCount++;
        }
      }

      const nextSync = new Date(Date.now() + 12 * 3600 * 1000);
      const statusMsg = productsList.length === 0
        ? 'No hay productos para mostrar en la tienda Contrado'
        : `Catálogo actualizado. ${syncedCount} importados.`;

      await pool.query(
        `UPDATE contrado_settings SET
          last_synced_at = NOW(),
          next_sync_at = ?,
          last_sync_status = 'success',
          last_sync_message = ?
        WHERE store_id = 61803`,
        [nextSync, statusMsg]
      );

      return {
        success: true,
        message: productsList.length === 0 ? 'No hay productos para mostrar' : 'Catálogo actualizado',
        syncedCount,
        failedCount,
        nextSyncAt: nextSync
      };
    } catch (err: any) {
      console.error('[Zubuy Print Sync] Error:', err);
      return {
        success: false,
        message: 'No fue posible completar la actualización. Intenta nuevamente.'
      };
    } finally {
      this.isSyncing = false;
    }
  }

  public static async syncShippingRates(cultureCode = 'it-IT') {
    try {
      const res = await ContradoService.getShippingRates(cultureCode);
      if (!res.success || !res.data?.priceGroups) return;

      const priceGroups = res.data.priceGroups;
      for (const group of priceGroups) {
        const groupId = group.shippingPriceGroupId;
        for (const region of group.regions || []) {
          const regionName = region.regionName || '';
          const priceMinor = Math.round(Number(region.price || 0) * 100);
          const incMinor = Math.round(Number(region.incrementValue || 0) * 100);
          const currency = region.currencyCode || 'EUR';

          for (const country of region.countries || []) {
            const countryCode = country.countryCode;
            const isHome = country.isHomeCountry ? 1 : 0;

            await pool.query(
              `INSERT INTO pod_shipping_cache (
                shipping_price_group_id, region_name, culture_code, country_code,
                price_minor, increment_value_minor, currency, is_home_country
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                price_minor = VALUES(price_minor),
                increment_value_minor = VALUES(increment_value_minor),
                currency = VALUES(currency),
                updated_at = NOW()`,
              [groupId, regionName, cultureCode, countryCode, priceMinor, incMinor, currency, isHome]
            );
          }
        }
      }
      console.log(`[Zubuy Print Shipping] Tarifas cacheadas para ${cultureCode}.`);
    } catch (err) {
      console.error('[Zubuy Print Shipping] Error al sincronizar tarifas:', err);
    }
  }

  public static initCron() {
    console.log('[Zubuy Print Cron] Iniciando programador cada 12 horas (Lotes de 20 productos nocturnos)...');
    this.syncShippingRates('it-IT');
    this.syncShippingRates('es-ES');

    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    setInterval(() => {
      console.log('[Zubuy Print Cron] Ejecutando sincronización programada cada 12 horas...');
      this.syncCatalog({ batchSize: 20 });
    }, TWELVE_HOURS_MS);
  }
}
