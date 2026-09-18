import { pool } from '../db/connection';
import crypto from 'crypto';
import {
  MarketplaceSellerProfile,
  MarketplaceCategory,
  MarketplaceListing,
  MarketplaceListingImage,
  MarketplaceConversation,
  MarketplaceMessage,
  MarketplaceOffer,
  MarketplaceOrder
} from './types';

function generateUuid(): string {
  return crypto.randomUUID();
}

function normalizeMarketplaceImageUrl(value: any): string {
  const url = String(value || '').trim();
  return url.replace(/^http:\/\/matterhorn-wholesale\.com\//i, 'https://matterhorn-wholesale.com/');
}

function buildSlug(title: string, city: string = ''): string {
  const base = `${title} ${city}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 150);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

export const MarketplaceRepo = {
  // ---------------------------------------------------------------------------
  // Sellers
  // ---------------------------------------------------------------------------
  async getSellerProfileByUserId(userId: string): Promise<MarketplaceSellerProfile | null> {
    const [rows]: any = await pool.query(
      'SELECT * FROM marketplace_seller_profiles WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async getSellerProfileBySlug(slug: string): Promise<MarketplaceSellerProfile | null> {
    const [rows]: any = await pool.query(
      'SELECT * FROM marketplace_seller_profiles WHERE slug = ? LIMIT 1',
      [slug]
    );
    return rows[0] || null;
  },

  async getSellerProfileById(id: string): Promise<MarketplaceSellerProfile | null> {
    const [rows]: any = await pool.query(
      'SELECT * FROM marketplace_seller_profiles WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async createSellerProfile(data: {
    userId: string;
    displayName: string;
    description?: string;
    phone?: string;
    country: string;
    city?: string;
    region?: string;
    zipCode?: string;
    address?: string;
    sellerType?: 'individual' | 'business';
    termsVersion: string;
    termsLanguage: 'es' | 'it' | 'en';
  }): Promise<MarketplaceSellerProfile> {
    const id = generateUuid();
    const slug = buildSlug(data.displayName, data.city || '');
    
    await pool.query(
      `INSERT INTO marketplace_seller_profiles (
        id, user_id, display_name, slug, description, phone, country, city, region, zip_code, address,
        seller_type, verification_level, is_active, terms_accepted_at, terms_version, terms_language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 1, NOW(), ?, ?)`,
      [
        id,
        data.userId,
        data.displayName.trim(),
        slug,
        data.description || null,
        data.phone || null,
        data.country || 'IT',
        data.city || null,
        data.region || null,
        data.zipCode || null,
        data.address || null,
        data.sellerType || 'individual',
        data.termsVersion,
        data.termsLanguage
      ]
    );

    // Update user row
    await pool.query(
      'UPDATE users SET is_seller = 1, seller_profile_id = ? WHERE id = ?',
      [id, data.userId]
    );

    const created = await this.getSellerProfileById(id);
    if (!created) throw new Error('No se pudo crear el perfil de vendedor.');
    return created;
  },

  async acceptSellerTerms(userId: string, version: string, language: 'es' | 'it' | 'en'): Promise<MarketplaceSellerProfile | null> {
    await pool.query(
      `UPDATE marketplace_seller_profiles
       SET terms_accepted_at = NOW(), terms_version = ?, terms_language = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [version, language, userId]
    );
    return this.getSellerProfileByUserId(userId);
  },

  async updateSellerProfile(id: string, fields: Partial<MarketplaceSellerProfile>): Promise<void> {
    const allowed = [
      'display_name', 'description', 'avatar_url', 'logo_url', 'phone',
      'country', 'city', 'region', 'zip_code', 'address', 'seller_type'
    ];
    const keys = Object.keys(fields).filter(k => allowed.includes(k));
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (fields as any)[k]);
    values.push(id);
    await pool.query(`UPDATE marketplace_seller_profiles SET ${sets} WHERE id = ?`, values);
  },

  async getSellerStats(userId: string): Promise<any> {
    const [counts]: any = await pool.query(
      `SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_listings,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft_listings,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) AS sold_listings,
        COALESCE(SUM(view_count), 0) AS total_views,
        COALESCE(SUM(favorite_count), 0) AS total_favorites
      FROM marketplace_listings
      WHERE seller_id = ?`,
      [userId]
    );

    const [msgCount]: any = await pool.query(
      `SELECT COUNT(*) AS unread_messages
       FROM marketplace_messages m
       JOIN marketplace_conversations c ON c.id = m.conversation_id
       WHERE c.seller_id = ? AND m.sender_id != ? AND m.read_at IS NULL`,
      [userId, userId]
    );

    const [offerCount]: any = await pool.query(
      `SELECT COUNT(*) AS pending_offers
       FROM marketplace_offers
       WHERE seller_id = ? AND status = 'pending'`,
      [userId]
    );

    const [ordersCount]: any = await pool.query(
      `SELECT
        COUNT(*) AS total_sales_count,
        COALESCE(SUM(product_amount_minor), 0) AS total_revenue_minor
       FROM marketplace_orders
       WHERE seller_id = ? AND status IN ('paid', 'preparing', 'shipped', 'delivered', 'completed')`,
      [userId]
    );

    return {
      ...(counts[0] || {}),
      unread_messages: msgCount[0]?.unread_messages || 0,
      pending_offers: offerCount[0]?.pending_offers || 0,
      total_sales_count: ordersCount[0]?.total_sales_count || 0,
      total_revenue_minor: ordersCount[0]?.total_revenue_minor || 0
    };
  },

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------
  async listCategories(locale: string = 'es'): Promise<MarketplaceCategory[]> {
    const [rows]: any = await pool.query(
      `SELECT
        c.id, c.slug, c.name, c.icon, c.sort_order, c.is_active, c.parent_id, c.created_at,
        COALESCE(t.name, c.name) AS translated_name
      FROM marketplace_categories c
      LEFT JOIN marketplace_category_translations t ON t.category_id = c.id AND t.locale = ?
      WHERE c.is_active = 1
      ORDER BY c.sort_order ASC, c.name ASC`,
      [locale]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Listings
  // ---------------------------------------------------------------------------
  async createListing(data: {
    sellerId: string;
    categoryId?: number | null;
    title: string;
    description: string;
    condition: string;
    priceMinor: number;
    currency?: string;
    city: string;
    region?: string;
    countryCode: string;
    postalCode?: string;
    originalLanguage?: string;
    weightGrams?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    quantity?: number;
    negotiable?: boolean;
    shippingAvailable?: boolean;
    pickupAvailable?: boolean;
    shippingFromMinor?: number;
    imageUrls?: string[];
  }): Promise<MarketplaceListing> {
    const id = generateUuid();
    const slug = buildSlug(data.title, data.city);
    const currency = data.currency || (data.countryCode === 'GB' ? 'GBP' : 'EUR');

    await pool.query(
      `INSERT INTO marketplace_listings (
        id, seller_id, category_id, title, slug, description, \`condition\`, price_minor, currency,
        city, region, country_code, postal_code, original_language, weight_grams, length_cm, width_cm,
        height_cm, quantity, negotiable, shipping_available, pickup_available, shipping_from_minor,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        id,
        data.sellerId,
        data.categoryId || null,
        data.title.trim(),
        slug,
        data.description.trim(),
        data.condition,
        data.priceMinor,
        currency,
        data.city.trim(),
        data.region || null,
        data.countryCode.toUpperCase().slice(0, 2),
        data.postalCode || null,
        data.originalLanguage || 'es',
        data.weightGrams || 1000,
        data.lengthCm || 20,
        data.widthCm || 15,
        data.heightCm || 10,
        data.quantity || 1,
        data.negotiable !== false ? 1 : 0,
        data.shippingAvailable !== false ? 1 : 0,
        data.pickupAvailable ? 1 : 0,
        data.shippingFromMinor || null
      ]
    );

    if (Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
      for (let i = 0; i < data.imageUrls.length; i++) {
        const imgId = generateUuid();
        await pool.query(
          `INSERT INTO marketplace_listing_images (id, listing_id, url, sort_order, is_cover) VALUES (?, ?, ?, ?, ?)`,
          [imgId, id, data.imageUrls[i], i, i === 0 ? 1 : 0]
        );
      }
    }

    const listing = await this.getListingById(id);
    if (!listing) throw new Error('No se pudo leer la publicación recién creada.');
    return listing;
  },

  async getListingById(idOrSlug: string): Promise<MarketplaceListing | null> {
    const [rows]: any = await pool.query(
      `SELECT
        l.*,
        p.id AS seller_profile_id,
        p.display_name AS seller_name,
        p.slug AS seller_slug,
        p.avatar_url AS seller_avatar,
        p.verification_level AS seller_verification,
        p.avg_rating AS seller_rating,
        p.total_sales AS seller_total_sales,
        p.created_at AS seller_created_at,
        c.name AS category_name,
        c.slug AS category_slug,
        c.icon AS category_icon
      FROM marketplace_listings l
      LEFT JOIN marketplace_seller_profiles p ON p.user_id = l.seller_id
      LEFT JOIN marketplace_categories c ON c.id = l.category_id
      WHERE l.id = ? OR l.slug = ?
      LIMIT 1`,
      [idOrSlug, idOrSlug]
    );

    if (!rows[0]) return null;
    const row = rows[0];

    const [imgRows]: any = await pool.query(
      `SELECT * FROM marketplace_listing_images WHERE listing_id = ? ORDER BY sort_order ASC`,
      [row.id]
    );

    return {
      ...row,
      images: imgRows,
      seller: {
        id: row.seller_profile_id || row.seller_id,
        display_name: row.seller_name || 'Vendedor DoorDrop',
        slug: row.seller_slug || '',
        avatar_url: row.seller_avatar || null,
        city: row.city,
        country: row.country_code,
        verification_level: row.seller_verification || 'unverified',
        avg_rating: Number(row.seller_rating || 0),
        total_sales: Number(row.seller_total_sales || 0),
        created_at: row.seller_created_at
      },
      category: row.category_id ? {
        id: row.category_id,
        slug: row.category_slug,
        name: row.category_name,
        icon: row.category_icon
      } : undefined
    };
  },

  async incrementViews(id: string): Promise<void> {
    await pool.query('UPDATE marketplace_listings SET view_count = view_count + 1 WHERE id = ?', [id]);
  },

  async listPublicListings(filters: {
    search?: string;
    categoryId?: number;
    categorySlug?: string;
    city?: string;
    countryCode?: string;
    minPriceMinor?: number;
    maxPriceMinor?: number;
    condition?: string;
    hasShipping?: boolean;
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
    limit?: number;
    offset?: number;
  }): Promise<{ listings: MarketplaceListing[]; total: number }> {
    const conditions: string[] = ["l.status = 'active'"];
    const params: any[] = [];

    if (filters.search) {
      conditions.push("(l.title LIKE ? OR l.description LIKE ? OR l.city LIKE ?)");
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }
    if (filters.categoryId) {
      conditions.push("l.category_id = ?");
      params.push(filters.categoryId);
    }
    if (filters.categorySlug) {
      conditions.push("c.slug = ?");
      params.push(filters.categorySlug);
    }
    if (filters.city) {
      conditions.push("l.city LIKE ?");
      params.push(`%${filters.city.trim()}%`);
    }
    if (filters.countryCode) {
      conditions.push("l.country_code = ?");
      params.push(filters.countryCode.toUpperCase());
    }
    if (filters.minPriceMinor !== undefined) {
      conditions.push("l.price_minor >= ?");
      params.push(filters.minPriceMinor);
    }
    if (filters.maxPriceMinor !== undefined) {
      conditions.push("l.price_minor <= ?");
      params.push(filters.maxPriceMinor);
    }
    if (filters.condition) {
      conditions.push("l.condition = ?");
      params.push(filters.condition);
    }
    if (filters.hasShipping) {
      conditions.push("l.shipping_available = 1");
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM marketplace_listings l
       LEFT JOIN marketplace_categories c ON c.id = l.category_id
       WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    let orderBy = 'l.created_at DESC';
    if (filters.sort === 'price_asc') orderBy = 'l.price_minor ASC';
    else if (filters.sort === 'price_desc') orderBy = 'l.price_minor DESC';
    else if (filters.sort === 'popular') orderBy = 'l.view_count DESC, l.favorite_count DESC';

    const limit = Math.min(Math.max(1, filters.limit || 24), 60);
    const offset = Math.max(0, filters.offset || 0);

    const [rows]: any = await pool.query(
      `SELECT
        l.*,
        p.display_name AS seller_name,
        p.slug AS seller_slug,
        p.avatar_url AS seller_avatar,
        p.verification_level AS seller_verification,
        p.avg_rating AS seller_rating,
        c.name AS category_name,
        c.slug AS category_slug,
        c.icon AS category_icon,
        (SELECT url FROM marketplace_listing_images WHERE listing_id = l.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS cover_image_url
      FROM marketplace_listings l
      LEFT JOIN marketplace_seller_profiles p ON p.user_id = l.seller_id
      LEFT JOIN marketplace_categories c ON c.id = l.category_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const listings = rows.map((r: any) => ({
      ...r,
      images: r.cover_image_url ? [{ id: '', listing_id: r.id, url: normalizeMarketplaceImageUrl(r.cover_image_url), sort_order: 0, is_cover: 1, file_key: null, created_at: '' }] : [],
      seller: {
        id: r.seller_id,
        display_name: r.seller_name || 'Vendedor DoorDrop',
        slug: r.seller_slug || '',
        avatar_url: r.seller_avatar || null,
        city: r.city,
        country: r.country_code,
        verification_level: r.seller_verification || 'unverified',
        avg_rating: Number(r.seller_rating || 0),
        total_sales: 0,
        created_at: ''
      },
      category: r.category_id ? {
        id: r.category_id,
        slug: r.category_slug,
        name: r.category_name,
        icon: r.category_icon
      } : undefined
    }));

    return { listings, total };
  },

  async listSellerListings(sellerId: string): Promise<MarketplaceListing[]> {
    const [rows]: any = await pool.query(
      `SELECT
        l.*,
        c.name AS category_name,
        (SELECT url FROM marketplace_listing_images WHERE listing_id = l.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS cover_image_url
      FROM marketplace_listings l
      LEFT JOIN marketplace_categories c ON c.id = l.category_id
      WHERE l.seller_id = ?
      ORDER BY l.created_at DESC`,
      [sellerId]
    );

    return rows.map((r: any) => ({
      ...r,
      images: r.cover_image_url ? [{ id: '', listing_id: r.id, url: normalizeMarketplaceImageUrl(r.cover_image_url), sort_order: 0, is_cover: 1, file_key: null, created_at: '' }] : []
    }));
  },

  async updateListing(id: string, sellerId: string, fields: any): Promise<void> {
    const allowed = [
      'title', 'description', 'condition', 'price_minor', 'city', 'region',
      'country_code', 'postal_code', 'category_id', 'weight_grams', 'length_cm',
      'width_cm', 'height_cm', 'quantity', 'negotiable', 'shipping_available',
      'pickup_available', 'shipping_from_minor', 'status'
    ];
    const keys = Object.keys(fields).filter(k => allowed.includes(k));
    if (keys.length === 0) return;
    const sets = keys.map(k => `\`${k}\` = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id, sellerId);
    await pool.query(`UPDATE marketplace_listings SET ${sets}, updated_at = NOW() WHERE id = ? AND seller_id = ?`, values);
  },

  async updateListingStatus(id: string, sellerId: string, status: string): Promise<void> {
    await pool.query(
      `UPDATE marketplace_listings SET status = ?, updated_at = NOW() WHERE id = ? AND seller_id = ?`,
      [status, id, sellerId]
    );
  },

  async deleteListing(id: string, sellerId: string): Promise<void> {
    await pool.query(
      `UPDATE marketplace_listings SET status = 'archived', updated_at = NOW() WHERE id = ? AND seller_id = ?`,
      [id, sellerId]
    );
  },

  // ---------------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------------
  async toggleFavorite(userId: string, listingId: string): Promise<boolean> {
    const [existing]: any = await pool.query(
      `SELECT id FROM marketplace_favorites WHERE user_id = ? AND listing_id = ? LIMIT 1`,
      [userId, listingId]
    );

    if (existing[0]) {
      await pool.query(`DELETE FROM marketplace_favorites WHERE id = ?`, [existing[0].id]);
      await pool.query(`UPDATE marketplace_listings SET favorite_count = GREATEST(0, favorite_count - 1) WHERE id = ?`, [listingId]);
      return false;
    } else {
      const favId = generateUuid();
      await pool.query(
        `INSERT INTO marketplace_favorites (id, user_id, listing_id) VALUES (?, ?, ?)`,
        [favId, userId, listingId]
      );
      await pool.query(`UPDATE marketplace_listings SET favorite_count = favorite_count + 1 WHERE id = ?`, [listingId]);
      return true;
    }
  },

  async isFavorite(userId: string, listingId: string): Promise<boolean> {
    const [rows]: any = await pool.query(
      `SELECT id FROM marketplace_favorites WHERE user_id = ? AND listing_id = ? LIMIT 1`,
      [userId, listingId]
    );
    return Boolean(rows[0]);
  },

  async listFavorites(userId: string): Promise<MarketplaceListing[]> {
    const [rows]: any = await pool.query(
      `SELECT
        l.*,
        (SELECT url FROM marketplace_listing_images WHERE listing_id = l.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS cover_image_url
      FROM marketplace_favorites f
      JOIN marketplace_listings l ON l.id = f.listing_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC`,
      [userId]
    );

    return rows.map((r: any) => ({
      ...r,
      images: r.cover_image_url ? [{ id: '', listing_id: r.id, url: normalizeMarketplaceImageUrl(r.cover_image_url), sort_order: 0, is_cover: 1, file_key: null, created_at: '' }] : []
    }));
  },

  // ---------------------------------------------------------------------------
  // Conversations & Messages
  // ---------------------------------------------------------------------------
  async findOrCreateConversation(listingId: string, buyerId: string, sellerId: string): Promise<MarketplaceConversation> {
    const [existing]: any = await pool.query(
      `SELECT * FROM marketplace_conversations WHERE listing_id = ? AND buyer_id = ? AND seller_id = ? LIMIT 1`,
      [listingId, buyerId, sellerId]
    );
    if (existing[0]) return existing[0];

    const id = generateUuid();
    await pool.query(
      `INSERT INTO marketplace_conversations (id, listing_id, buyer_id, seller_id, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [id, listingId, buyerId, sellerId]
    );

    const [created]: any = await pool.query(
      `SELECT * FROM marketplace_conversations WHERE id = ? LIMIT 1`,
      [id]
    );
    return created[0];
  },

  async listUserConversations(userId: string): Promise<MarketplaceConversation[]> {
    const [rows]: any = await pool.query(
      `SELECT
        c.*,
        l.title AS listing_title,
        l.slug AS listing_slug,
        l.price_minor AS listing_price_minor,
        l.currency AS listing_currency,
        (SELECT url FROM marketplace_listing_images WHERE listing_id = l.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS listing_image_url,
        ub.name AS buyer_name,
        us.name AS seller_name,
        (SELECT body FROM marketplace_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
      FROM marketplace_conversations c
      JOIN marketplace_listings l ON l.id = c.listing_id
      JOIN users ub ON ub.id = c.buyer_id
      JOIN users us ON us.id = c.seller_id
      WHERE (c.buyer_id = ? OR c.seller_id = ?) AND c.is_archived = 0
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [userId, userId]
    );
    return rows;
  },

  async listMessages(conversationId: string, userId: string): Promise<MarketplaceMessage[]> {
    // Verify participant
    const [conv]: any = await pool.query(
      `SELECT id FROM marketplace_conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?) LIMIT 1`,
      [conversationId, userId, userId]
    );
    if (!conv[0]) return [];

    // Mark unread messages as read
    await pool.query(
      `UPDATE marketplace_messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL`,
      [conversationId, userId]
    );

    const [rows]: any = await pool.query(
      `SELECT m.*, u.name AS sender_name
       FROM marketplace_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`,
      [conversationId]
    );
    return rows;
  },

  async sendMessage(conversationId: string, senderId: string, body: string, messageType: string = 'text'): Promise<MarketplaceMessage> {
    const [conv]: any = await pool.query(
      `SELECT id FROM marketplace_conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?) LIMIT 1`,
      [conversationId, senderId, senderId]
    );
    if (!conv[0]) throw new Error('Conversación no encontrada o no autorizada.');

    const id = generateUuid();
    await pool.query(
      `INSERT INTO marketplace_messages (id, conversation_id, sender_id, body, message_type, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, conversationId, senderId, body.trim(), messageType]
    );

    await pool.query(
      `UPDATE marketplace_conversations SET last_message_at = NOW() WHERE id = ?`,
      [conversationId]
    );

    const [created]: any = await pool.query(
      `SELECT m.*, u.name AS sender_name FROM marketplace_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      [id]
    );
    return created[0];
  },

  // ---------------------------------------------------------------------------
  // Offers
  // ---------------------------------------------------------------------------
  async createOffer(data: {
    listingId: string;
    buyerId: string;
    amountMinor: number;
    message?: string;
  }): Promise<MarketplaceOffer> {
    const listing = await this.getListingById(data.listingId);
    if (!listing) throw new Error('Publicación no encontrada.');
    if (listing.seller_id === data.buyerId) throw new Error('No puedes ofertar en tu propia publicación.');
    if (!listing.negotiable) throw new Error('Esta publicación no admite ofertas.');

    const id = generateUuid();
    await pool.query(
      `INSERT INTO marketplace_offers (
        id, listing_id, buyer_id, seller_id, amount_minor, currency, status, message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [
        id,
        data.listingId,
        data.buyerId,
        listing.seller_id,
        data.amountMinor,
        listing.currency,
        data.message || null
      ]
    );

    // Also auto-start conversation and send system offer message
    const conv = await this.findOrCreateConversation(data.listingId, data.buyerId, listing.seller_id);
    const formattedAmount = (data.amountMinor / 100).toFixed(2);
    await this.sendMessage(
      conv.id,
      data.buyerId,
      `Oferta enviada: ${formattedAmount} ${listing.currency}${data.message ? ` — "${data.message}"` : ''}`,
      'offer'
    );

    const [created]: any = await pool.query(
      `SELECT * FROM marketplace_offers WHERE id = ?`,
      [id]
    );
    return created[0];
  },

  async respondOffer(offerId: string, sellerId: string, status: 'accepted' | 'rejected' | 'countered', counterAmountMinor?: number): Promise<void> {
    const [offers]: any = await pool.query(
      `SELECT * FROM marketplace_offers WHERE id = ? AND seller_id = ? LIMIT 1`,
      [offerId, sellerId]
    );
    if (!offers[0]) throw new Error('Oferta no encontrada.');

    await pool.query(
      `UPDATE marketplace_offers SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, offerId]
    );

    const conv = await this.findOrCreateConversation(offers[0].listing_id, offers[0].buyer_id, sellerId);
    if (status === 'accepted') {
      await this.sendMessage(conv.id, sellerId, `¡Oferta aceptada por ${(offers[0].amount_minor / 100).toFixed(2)} ${offers[0].currency}! Ya puedes proceder a comprar.`, 'system');
    } else if (status === 'rejected') {
      await this.sendMessage(conv.id, sellerId, `Oferta rechazada.`, 'system');
    } else if (status === 'countered' && counterAmountMinor) {
      await this.sendMessage(conv.id, sellerId, `Contraoferta del vendedor: ${(counterAmountMinor / 100).toFixed(2)} ${offers[0].currency}`, 'offer');
    }
  },

  async listOffers(userId: string): Promise<MarketplaceOffer[]> {
    const [rows]: any = await pool.query(
      `SELECT
        o.*,
        l.title AS listing_title,
        l.price_minor AS listing_price_minor,
        ub.name AS buyer_name,
        us.name AS seller_name
      FROM marketplace_offers o
      JOIN marketplace_listings l ON l.id = o.listing_id
      JOIN users ub ON ub.id = o.buyer_id
      JOIN users us ON us.id = o.seller_id
      WHERE o.buyer_id = ? OR o.seller_id = ?
      ORDER BY o.created_at DESC`,
      [userId, userId]
    );
    return rows;
  },

  async getAcceptedOfferForBuyer(
    offerId: string,
    listingId: string,
    buyerId: string
  ): Promise<MarketplaceOffer | null> {
    const [rows]: any = await pool.query(
      `SELECT o.*
         FROM marketplace_offers o
        WHERE o.id = ?
          AND o.listing_id = ?
          AND o.buyer_id = ?
          AND o.status = 'accepted'
          AND NOT EXISTS (
            SELECT 1
              FROM marketplace_orders existing_order
             WHERE existing_order.offer_id = o.id
               AND existing_order.status NOT IN ('cancelled', 'refunded')
          )
        LIMIT 1`,
      [offerId, listingId, buyerId]
    );
    return rows[0] || null;
  },

  // ---------------------------------------------------------------------------
  // Orders & Purchases
  // ---------------------------------------------------------------------------
  async createOrder(data: {
    listingId: string;
    buyerId: string;
    offerId?: string | null;
    productAmountMinor: number;
    shippingAmountMinor: number;
    commissionAmountMinor: number;
    protectionAmountMinor: number;
    totalAmountMinor: number;
    currency: string;
    buyerAddress: any;
    sellerAddress: any;
    shippingServiceName?: string;
    shippingProviderCode?: string;
    quoteId?: string;
    paymentMethod: string;
    status?: MarketplaceOrder['status'];
    paymentReference?: string | null;
    reserveListing?: boolean;
  }): Promise<MarketplaceOrder> {
    const listing = await this.getListingById(data.listingId);
    if (!listing) throw new Error('Publicación no encontrada.');
    if (listing.status !== 'active') throw new Error('El producto ya no está disponible.');

    const orderId = generateUuid();
    const orderNumber = `DD-${Math.floor(100000 + Math.random() * 900000)}`;
    const status = data.status || 'paid';
    const reserveListing = data.reserveListing !== false;

    await pool.query(
      `INSERT INTO marketplace_orders (
        id, order_number, listing_id, buyer_id, seller_id, offer_id, quote_id, product_amount_minor,
        shipping_amount_minor, commission_amount_minor, protection_amount_minor, total_amount_minor,
        currency, status, payment_method, payment_reference, buyer_address_json, seller_address_json,
        shipping_service_name, shipping_provider_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orderId,
        orderNumber,
        data.listingId,
        data.buyerId,
        listing.seller_id,
        data.offerId || null,
        data.quoteId || null,
        data.productAmountMinor,
        data.shippingAmountMinor,
        data.commissionAmountMinor,
        data.protectionAmountMinor,
        data.totalAmountMinor,
        data.currency,
        status,
        data.paymentMethod,
        data.paymentReference || null,
        JSON.stringify(data.buyerAddress),
        JSON.stringify(data.sellerAddress),
        data.shippingServiceName || null,
        data.shippingProviderCode || null
      ]
    );

    if (reserveListing) {
      // Paid wallet orders are sold immediately. PayPal pending orders reserve
      // the listing so two approved checkouts cannot consume the same item.
      const [listingUpdate]: any = status === 'pending_payment'
        ? await pool.query(`UPDATE marketplace_listings SET status = 'reserved', updated_at = NOW() WHERE id = ? AND status = 'active' AND quantity > 0`, [data.listingId])
        : listing.quantity <= 1
          ? await pool.query(`UPDATE marketplace_listings SET status = 'sold', updated_at = NOW() WHERE id = ? AND status = 'active' AND quantity > 0`, [data.listingId])
          : await pool.query(`UPDATE marketplace_listings SET quantity = quantity - 1, updated_at = NOW() WHERE id = ? AND status = 'active' AND quantity > 0`, [data.listingId]);
      if (!listingUpdate?.affectedRows) {
        await pool.query(`DELETE FROM marketplace_orders WHERE id = ?`, [orderId]);
        throw new Error('El producto ya no está disponible.');
      }

      // Update seller total sales only after the payment is final.
      if (status !== 'pending_payment') {
        await pool.query(
          `UPDATE marketplace_seller_profiles SET total_sales = total_sales + 1 WHERE user_id = ?`,
          [listing.seller_id]
        );
      }
    }

    const [created]: any = await pool.query(
      `SELECT * FROM marketplace_orders WHERE id = ?`,
      [orderId]
    );
    return created[0];
  },

  async markOrderPaid(orderId: string, paymentReference: string): Promise<{ order: MarketplaceOrder; activated: boolean }> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows]: any = await conn.query(
        `SELECT o.*, l.status AS listing_status, l.quantity AS listing_quantity
           FROM marketplace_orders o
           JOIN marketplace_listings l ON l.id = o.listing_id
          WHERE o.id = ?
          FOR UPDATE`,
        [orderId]
      );
      const order = rows?.[0];
      if (!order) throw new Error('Pedido Marketplace no encontrado.');
      if (String(order.status) !== 'pending_payment') {
        await conn.commit();
        return { order, activated: false };
      }
      if (!['active', 'reserved'].includes(String(order.listing_status)) || Number(order.listing_quantity || 0) <= 0) {
        throw new Error('El producto ya no está disponible para completar el pago.');
      }

      await conn.query(
        `UPDATE marketplace_orders
            SET status = 'paid', payment_reference = ?, updated_at = NOW()
          WHERE id = ? AND status = 'pending_payment'`,
        [paymentReference, orderId]
      );
      if (Number(order.listing_quantity) <= 1) {
        await conn.query(`UPDATE marketplace_listings SET status = 'sold', updated_at = NOW() WHERE id = ?`, [order.listing_id]);
      } else {
        await conn.query(`UPDATE marketplace_listings SET quantity = quantity - 1, status = 'active', updated_at = NOW() WHERE id = ?`, [order.listing_id]);
      }
      await conn.query(
        `UPDATE marketplace_seller_profiles SET total_sales = total_sales + 1 WHERE user_id = ?`,
        [order.seller_id]
      );
      const [freshRows]: any = await conn.query(`SELECT * FROM marketplace_orders WHERE id = ? LIMIT 1`, [orderId]);
      await conn.commit();
      return { order: freshRows?.[0] || { ...order, status: 'paid', payment_reference: paymentReference }, activated: true };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async cancelPendingOrder(orderId: string, buyerId?: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows]: any = await conn.query(
        `SELECT id, listing_id, status FROM marketplace_orders WHERE id = ? ${buyerId ? 'AND buyer_id = ?' : ''} FOR UPDATE`,
        buyerId ? [orderId, buyerId] : [orderId]
      );
      const order = rows?.[0];
      if (!order || String(order.status) !== 'pending_payment') {
        await conn.commit();
        return false;
      }
      await conn.query(`UPDATE marketplace_orders SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?`, [orderId]);
      await conn.query(
        `UPDATE marketplace_listings AS l
            SET status = 'active', updated_at = NOW()
          WHERE l.id = ? AND l.status = 'reserved'
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_orders other
               WHERE other.listing_id = l.id AND other.status = 'pending_payment' AND other.id <> ?
            )`,
        [order.listing_id, orderId]
      );
      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async listUserOrders(userId: string, role: 'buyer' | 'seller' = 'buyer'): Promise<MarketplaceOrder[]> {
    const col = role === 'buyer' ? 'buyer_id' : 'seller_id';
    const [rows]: any = await pool.query(
      `SELECT
        o.*,
        l.title AS listing_title,
        l.slug AS listing_slug,
        (SELECT url FROM marketplace_listing_images WHERE listing_id = l.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS listing_image_url,
        ub.name AS buyer_name,
        us.name AS seller_name
      FROM marketplace_orders o
      JOIN marketplace_listings l ON l.id = o.listing_id
      JOIN users ub ON ub.id = o.buyer_id
      JOIN users us ON us.id = o.seller_id
      WHERE o.${col} = ?
      ORDER BY o.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async getOrderById(orderId: string, userId: string): Promise<MarketplaceOrder | null> {
    const [rows]: any = await pool.query(
      `SELECT
        o.*,
        l.title AS listing_title,
        l.slug AS listing_slug,
        (SELECT url FROM marketplace_listing_images WHERE listing_id = l.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS listing_image_url,
        ub.name AS buyer_name,
        ub.email AS buyer_email,
        us.name AS seller_name,
        us.email AS seller_email
      FROM marketplace_orders o
      JOIN marketplace_listings l ON l.id = o.listing_id
      JOIN users ub ON ub.id = o.buyer_id
      JOIN users us ON us.id = o.seller_id
      WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
      LIMIT 1`,
      [orderId, userId, userId]
    );
    return rows[0] || null;
  }
};
