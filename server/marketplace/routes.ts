import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { MarketplaceRepo } from './repo';
import { sendNotificationEvent } from '../services/emailService';

export function setupMarketplaceRoutes(app: any, options: {
  pool: any;
  authMiddleware: any;
  requireSuperAdmin: any;
  UserRepo: any;
  generateId: any;
  walletMutation?: (options: {
    userId: string;
    type: 'credit' | 'debit';
    amount: number;
    currency: string;
    description: string;
    referenceType: string;
    referenceId: string;
    status?: string;
    adminNote?: string | null;
    rates?: Record<string, number>;
  }) => Promise<any>;
  paypalCreateOrder?: (options: {
    referenceId: string;
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }) => Promise<{ orderId: string; checkoutUrl: string; chargeAmount: number; chargeCurrency: string }>;
  prepareOrderShipment?: (orderId: string, packageData?: any) => Promise<any>;
  requestSellerPayout?: (orderId: string, sellerId: string) => Promise<any>;
}) {
  const router = Router();
  const { authMiddleware, requireSuperAdmin, UserRepo, pool, walletMutation: mutateWallet, paypalCreateOrder, prepareOrderShipment, requestSellerPayout } = options;

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'marketplace');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const maxMarketplaceImageBytes = 12 * 1024 * 1024;
  const MARKETPLACE_TERMS_VERSION = '1.0';
  const normalizeMarketplaceTermsLanguage = (value: any): 'es' | 'it' | 'en' | null => {
    const language = String(value || '').toLowerCase().slice(0, 2);
    return language === 'es' || language === 'it' || language === 'en' ? language : null;
  };
  const requireAcceptedSellerTerms = async (req: any, res: Response, next: any) => {
    try {
      const profile = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      if (!profile) {
        return res.status(403).json({ error: 'Debes activar tu perfil de vendedor antes de utilizar esta función.' });
      }
      if (profile.terms_accepted_at === null || profile.terms_version !== MARKETPLACE_TERMS_VERSION) {
        return res.status(428).json({
          error: 'Debes leer y aceptar los términos y condiciones del Marketplace.',
          termsRequired: true,
          termsVersion: MARKETPLACE_TERMS_VERSION
        });
      }
      req.marketplaceSellerProfile = profile;
      next();
    } catch (error) {
      console.error('[Marketplace] Error al validar términos del vendedor:', error);
      res.status(500).json({ error: 'No se pudo validar la aceptación de términos.' });
    }
  };

  // ---------------------------------------------------------------------------
  // 1. Categories (Public)
  // ---------------------------------------------------------------------------
  router.get('/categories', async (req: Request, res: Response) => {
    try {
      const locale = String(req.query.locale || 'es').slice(0, 5);
      const categories = await MarketplaceRepo.listCategories(locale);
      res.json({ categories });
    } catch (error: any) {
      console.error('[Marketplace] Error al listar categorías:', error);
      res.status(500).json({ error: 'No se pudieron cargar las categorías.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Public Listings Search & Detail
  // ---------------------------------------------------------------------------
  router.get('/listings', async (req: Request, res: Response) => {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
      const categorySlug = req.query.categorySlug ? String(req.query.categorySlug) : undefined;
      const city = req.query.city ? String(req.query.city) : undefined;
      const countryCode = req.query.countryCode ? String(req.query.countryCode) : undefined;
      const minPriceMinor = req.query.minPrice ? Number(req.query.minPrice) * 100 : undefined;
      const maxPriceMinor = req.query.maxPrice ? Number(req.query.maxPrice) * 100 : undefined;
      const condition = req.query.condition ? String(req.query.condition) : undefined;
      const hasShipping = req.query.hasShipping === 'true';
      const sort = (req.query.sort as any) || 'newest';
      const limit = req.query.limit ? Number(req.query.limit) : 24;
      const offset = req.query.offset ? Number(req.query.offset) : 0;

      const result = await MarketplaceRepo.listPublicListings({
        search,
        categoryId,
        categorySlug,
        city,
        countryCode,
        minPriceMinor,
        maxPriceMinor,
        condition,
        hasShipping,
        sort,
        limit,
        offset
      });

      res.json(result);
    } catch (error: any) {
      console.error('[Marketplace] Error al buscar publicaciones:', error);
      res.status(500).json({ error: 'No se pudieron cargar las publicaciones.' });
    }
  });

  router.get('/listings/:idOrSlug', async (req: Request, res: Response) => {
    try {
      const listing = await MarketplaceRepo.getListingById(req.params.idOrSlug);
      if (!listing) {
        return res.status(404).json({ error: 'Publicación no encontrada.' });
      }
      // Increment view count asynchronously
      MarketplaceRepo.incrementViews(listing.id).catch(() => {});
      res.json({ listing });
    } catch (error: any) {
      console.error('[Marketplace] Error al obtener publicación:', error);
      res.status(500).json({ error: 'No se pudo cargar la publicación.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Logistics Quote for a Listing (Buyer enters destination)
  // ---------------------------------------------------------------------------
  router.post('/listings/:idOrSlug/quote', async (req: any, res: Response) => {
    try {
      const { destCountry, destZip, destCity } = req.body;
      if (!destCountry || !destZip) return res.status(400).json({ error: 'Por favor indica el pa�s y c�digo postal de destino.' });
      const listing = await MarketplaceRepo.getListingById(req.params.idOrSlug);
      if (!listing) return res.status(404).json({ error: 'Publicaci�n no encontrada.' });
      const baseUrl = String(process.env.INTERNAL_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
      const authorization = String(req.headers?.authorization || '');
      const cookie = String(req.headers?.cookie || '');
      const coreResponse = await fetch(`${baseUrl}/api/shipments/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({
          originCountry: listing.country_code || 'IT',
          originZip: listing.postal_code || '', originCity: listing.city || '',
          destCountry: String(destCountry).toUpperCase().slice(0, 2),
          destZip: String(destZip).trim(), destCity: String(destCity || '').trim(),
          packages: [{ width: Math.max(1, Number(listing.width_cm || 10)), height: Math.max(1, Number(listing.height_cm || 10)), length: Math.max(1, Number(listing.length_cm || 10)), weight: Math.max(0.1, Number(listing.weight_grams || 1000) / 1000), qty: 1 }],
          currency: listing.currency || 'EUR', persistQuotes: true
        })
      });
      const payload: any = await coreResponse.json().catch(() => ({}));
      if (!coreResponse.ok) return res.status(coreResponse.status).json(payload);
      const quotes = (Array.isArray(payload.quotes) ? payload.quotes : []).map((quote: any) => ({
        ...quote, id: quote.id,
        carrier: quote.carrierName || quote.providerDisplayName || quote.provider || 'DoorDrop',
        serviceName: quote.service || quote.serviceName || 'Servicio de transporte',
        price: Number(quote.total ?? quote.customerPrice ?? quote.price ?? 0),
        currency: quote.currency || listing.currency || 'EUR',
        pointRequired: quote.departureType === 'point' || quote.arrivalType === 'point'
      })).filter((quote: any) => quote.id && quote.price > 0);
      res.json({ quotes, product: { id: listing.id, title: listing.title, priceMinor: listing.price_minor, currency: listing.currency, originCountry: listing.country_code || 'IT', originCity: listing.city || '' }});
    } catch (error: any) {
      console.error('[Marketplace] Error al cotizar env�o real:', error?.message || error);
      res.status(500).json({ error: 'No se pudo cotizar el env�o para este producto.' });
    }
  });

  // 4. Public Seller Profile
  // ---------------------------------------------------------------------------
  router.get('/sellers/:slug', async (req: Request, res: Response) => {
    try {
      const profile = await MarketplaceRepo.getSellerProfileBySlug(req.params.slug);
      if (!profile || !profile.is_active) {
        return res.status(404).json({ error: 'Perfil de vendedor no encontrado.' });
      }

      const listings = await MarketplaceRepo.listSellerListings(profile.user_id);
      const activeListings = listings.filter(l => l.status === 'active');

      res.json({
        seller: {
          id: profile.id,
          display_name: profile.display_name,
          slug: profile.slug,
          description: profile.description,
          avatar_url: profile.avatar_url,
          logo_url: profile.logo_url,
          country: profile.country,
          city: profile.city,
          verification_level: profile.verification_level,
          avg_rating: Number(profile.avg_rating),
          total_ratings: profile.total_ratings,
          total_sales: profile.total_sales,
          avg_response_time_minutes: profile.avg_response_time_minutes,
          created_at: profile.created_at
        },
        listings: activeListings
      });
    } catch (error: any) {
      console.error('[Marketplace] Error al obtener perfil de vendedor:', error);
      res.status(500).json({ error: 'No se pudo cargar el perfil de vendedor.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Protected: Seller Onboarding & Profile
  // ---------------------------------------------------------------------------
  router.post('/become-seller', authMiddleware, async (req: any, res: Response) => {
    try {
      const { displayName, description, phone, country, city, region, zipCode, address, sellerType, termsAccepted, termsLanguage, language } = req.body;

      if (!displayName || !displayName.trim()) {
        return res.status(400).json({ error: 'El nombre público del vendedor es obligatorio.' });
      }
      if (!country) {
        return res.status(400).json({ error: 'El país del vendedor es obligatorio.' });
      }
      if (termsAccepted !== true) {
        return res.status(400).json({ error: 'Debes aceptar los términos y condiciones del Marketplace.' });
      }
      const acceptedLanguage = normalizeMarketplaceTermsLanguage(termsLanguage || language);
      if (!acceptedLanguage) {
        return res.status(400).json({ error: 'Debes seleccionar uno de los idiomas disponibles para los términos: español, italiano o inglés.' });
      }

      // Check if already a seller
      const existing = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      if (existing) {
        return res.json({ success: true, profile: existing, message: 'Ya eres vendedor.' });
      }

      const profile = await MarketplaceRepo.createSellerProfile({
        userId: req.user.id,
        displayName: displayName.trim(),
        description,
        phone: phone || req.user.phone,
        country: country.toUpperCase().slice(0, 2),
        city,
        region,
        zipCode,
        address,
        sellerType: sellerType || 'individual',
        termsVersion: MARKETPLACE_TERMS_VERSION,
        termsLanguage: acceptedLanguage
      });

      res.json({ success: true, profile });
    } catch (error: any) {
      console.error('[Marketplace] Error en become-seller:', error);
      res.status(500).json({ error: 'No se pudo completar el registro de vendedor.' });
    }
  });

  router.get('/seller/profile', authMiddleware, async (req: any, res: Response) => {
    try {
      const profile = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      const user = await UserRepo.getById(req.user.id).catch(() => null);
      res.json({ profile: profile ? { ...profile, paypalConnected: Boolean(user?.paypal_connected), paypalEmail: user?.paypal_email || null } : null });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo obtener el perfil de vendedor.' });
    }
  });

  router.post('/seller/terms/accept', authMiddleware, async (req: any, res: Response) => {
    try {
      if (req.body?.accepted !== true) {
        return res.status(400).json({ error: 'Debes confirmar la aceptación de los términos.' });
      }
      const acceptedLanguage = normalizeMarketplaceTermsLanguage(req.body?.termsLanguage || req.body?.language);
      if (!acceptedLanguage) {
        return res.status(400).json({ error: 'El idioma de los términos no es válido.' });
      }
      const profile = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      if (!profile) {
        return res.status(404).json({ error: 'No tienes un perfil de vendedor registrado.' });
      }
      const updated = await MarketplaceRepo.acceptSellerTerms(req.user.id, MARKETPLACE_TERMS_VERSION, acceptedLanguage);
      res.json({ success: true, profile: updated });
    } catch (error: any) {
      console.error('[Marketplace] Error al aceptar términos del vendedor:', error);
      res.status(500).json({ error: 'No se pudo guardar la aceptación de términos.' });
    }
  });

  router.put('/seller/profile', authMiddleware, async (req: any, res: Response) => {
    try {
      const profile = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      if (!profile) {
        return res.status(404).json({ error: 'No tienes un perfil de vendedor registrado.' });
      }

      await MarketplaceRepo.updateSellerProfile(profile.id, req.body);
      const updated = await MarketplaceRepo.getSellerProfileById(profile.id);
      res.json({ success: true, profile: updated });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo actualizar el perfil de vendedor.' });
    }
  });

  router.post('/seller/paypal/payout-link', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      if (req.user.role !== 'customer') return res.status(403).json({ error: 'Esta cuenta no puede recibir retiros.' });
      const user = await UserRepo.getById(req.user.id);
      if (user?.paypal_connected && user?.paypal_email) {
        return res.json({ connected: true, paypalEmail: user.paypal_email });
      }
      res.status(428).json({ connected: false, error: 'Vincula tu cuenta PayPal desde Seguridad y pagos antes de solicitar un retiro.', connectPath: '/api/user/paypal/connect' });
    } catch {
      res.status(500).json({ error: 'No se pudo comprobar la cuenta PayPal.' });
    }
  });

  router.get('/seller/dashboard', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const stats = await MarketplaceRepo.getSellerStats(req.user.id);
      const profile = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      res.json({ stats, profile });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar las estadísticas del vendedor.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Protected: Seller Listing Management
  // ---------------------------------------------------------------------------
  router.get('/seller/listings', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const listings = await MarketplaceRepo.listSellerListings(req.user.id);
      res.json({ listings });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar tus publicaciones.' });
    }
  });

  router.post('/seller/listings', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const {
        title,
        description,
        condition,
        price, // in euros/gbp (e.g. 29.99)
        priceMinor,
        currency,
        city,
        region,
        countryCode,
        postalCode,
        categoryId,
        weightGrams,
        lengthCm,
        widthCm,
        heightCm,
        quantity,
        negotiable,
        shippingAvailable,
        pickupAvailable,
        imageUrls
      } = req.body;

      if (!title || title.trim().length < 3) {
        return res.status(400).json({ error: 'El título debe tener al menos 3 caracteres.' });
      }
      if (!description || description.trim().length < 10) {
        return res.status(400).json({ error: 'La descripción debe tener al menos 10 caracteres.' });
      }
      const calculatedPriceMinor = priceMinor || Math.round(Number(price || 0) * 100);
      if (!calculatedPriceMinor || calculatedPriceMinor <= 0) {
        return res.status(400).json({ error: 'Por favor indica un precio válido.' });
      }
      if (!city) {
        return res.status(400).json({ error: 'La ciudad de ubicación es obligatoria.' });
      }
      if (!countryCode) {
        return res.status(400).json({ error: 'El país es obligatorio.' });
      }

      const listing = await MarketplaceRepo.createListing({
        sellerId: req.user.id,
        categoryId: categoryId ? Number(categoryId) : null,
        title,
        description,
        condition: condition || 'good',
        priceMinor: calculatedPriceMinor,
        currency: currency || (countryCode === 'GB' ? 'GBP' : 'EUR'),
        city,
        region,
        countryCode,
        postalCode,
        weightGrams: weightGrams ? Number(weightGrams) : 1000,
        lengthCm: lengthCm ? Number(lengthCm) : 20,
        widthCm: widthCm ? Number(widthCm) : 15,
        heightCm: heightCm ? Number(heightCm) : 10,
        quantity: quantity ? Number(quantity) : 1,
        negotiable: negotiable !== false,
        shippingAvailable: shippingAvailable !== false,
        pickupAvailable: Boolean(pickupAvailable),
        imageUrls: Array.isArray(imageUrls) ? imageUrls : []
      });

      res.json({ success: true, listing });
    } catch (error: any) {
      console.error('[Marketplace] Error al crear publicación:', error);
      res.status(500).json({ error: 'No se pudo crear la publicación.' });
    }
  });

  router.put('/seller/listings/:id', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const updates = { ...req.body };
      if (updates.price !== undefined) {
        updates.price_minor = Math.round(Number(updates.price) * 100);
        delete updates.price;
      }
      await MarketplaceRepo.updateListing(req.params.id, req.user.id, updates);
      const updated = await MarketplaceRepo.getListingById(req.params.id);
      res.json({ success: true, listing: updated });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo actualizar la publicación.' });
    }
  });

  router.patch('/seller/listings/:id/status', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const { status } = req.body;
      const validStatuses = ['active', 'paused', 'sold', 'archived', 'draft'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Estado no válido.' });
      }
      await MarketplaceRepo.updateListingStatus(req.params.id, req.user.id, status);
      res.json({ success: true, status });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo cambiar el estado de la publicación.' });
    }
  });

  router.delete('/seller/listings/:id', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      await MarketplaceRepo.deleteListing(req.params.id, req.user.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo eliminar la publicación.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Image Upload (Base64 or JSON payload)
  // ---------------------------------------------------------------------------
  router.post('/upload-image', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const { imageBase64, filename } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
      }

      // Match base64 data
      const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer: Buffer;
      let ext = 'jpg';

      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('webp')) ext = 'webp';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(imageBase64, 'base64');
      }

      if (!buffer.length) {
        return res.status(400).json({ error: 'La imagen está vacía o no es válida.' });
      }
      if (buffer.length > maxMarketplaceImageBytes) {
        return res.status(413).json({ error: 'La imagen no puede superar los 12 MB.' });
      }

      const randomName = `mp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const filePath = path.join(uploadsDir, randomName);
      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/uploads/marketplace/${randomName}`;
      res.json({ success: true, url: publicUrl });
    } catch (error: any) {
      console.error('[Marketplace] Error al subir imagen:', error);
      res.status(500).json({ error: 'No se pudo guardar la imagen.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 8. Favorites
  // ---------------------------------------------------------------------------
  router.post('/favorites/:listingId', authMiddleware, async (req: any, res: Response) => {
    try {
      const favorited = await MarketplaceRepo.toggleFavorite(req.user.id, req.params.listingId);
      res.json({ success: true, isFavorite: favorited });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo actualizar favoritos.' });
    }
  });

  router.get('/favorites/:listingId/status', authMiddleware, async (req: any, res: Response) => {
    try {
      const favorited = await MarketplaceRepo.isFavorite(req.user.id, req.params.listingId);
      res.json({ isFavorite: favorited });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo verificar favorito.' });
    }
  });

  router.get('/favorites', authMiddleware, async (req: any, res: Response) => {
    try {
      const favorites = await MarketplaceRepo.listFavorites(req.user.id);
      res.json({ favorites });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar tus favoritos.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 9. Chat & Conversations
  // ---------------------------------------------------------------------------
  router.post('/conversations', authMiddleware, async (req: any, res: Response) => {
    try {
      const { listingId } = req.body;
      const listing = await MarketplaceRepo.getListingById(listingId);
      if (!listing) return res.status(404).json({ error: 'Publicación no encontrada.' });
      if (listing.seller_id === req.user.id) {
        return res.status(400).json({ error: 'No puedes iniciar una conversación contigo mismo.' });
      }

      const conversation = await MarketplaceRepo.findOrCreateConversation(listingId, req.user.id, listing.seller_id);
      res.json({ conversation });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo iniciar la conversación.' });
    }
  });

  router.get('/conversations', authMiddleware, async (req: any, res: Response) => {
    try {
      const conversations = await MarketplaceRepo.listUserConversations(req.user.id);
      res.json({ conversations });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar las conversaciones.' });
    }
  });

  router.get('/conversations/:id/messages', authMiddleware, async (req: any, res: Response) => {
    try {
      const messages = await MarketplaceRepo.listMessages(req.params.id, req.user.id);
      res.json({ messages });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar los mensajes.' });
    }
  });

  router.post('/conversations/:id/messages', authMiddleware, async (req: any, res: Response) => {
    try {
      const { body, messageType } = req.body;
      if (!body || !body.trim()) {
        return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
      }
      const message = await MarketplaceRepo.sendMessage(req.params.id, req.user.id, body, messageType || 'text');
      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Offers
  // ---------------------------------------------------------------------------
  router.post('/offers', authMiddleware, async (req: any, res: Response) => {
    try {
      const { listingId, amount, message } = req.body;
      const amountMinor = Math.round(Number(amount) * 100);
      if (!amountMinor || amountMinor <= 0) {
        return res.status(400).json({ error: 'Indica un monto de oferta válido.' });
      }

      const offer = await MarketplaceRepo.createOffer({
        listingId,
        buyerId: req.user.id,
        amountMinor,
        message
      });

      const listing = await MarketplaceRepo.getListingById(listingId);
      const sellerUser = listing ? await UserRepo.getById(listing.seller_id).catch(() => null) : null;
      const buyerUser = await UserRepo.getById(req.user.id).catch(() => req.user);
      const offerUrl = `${(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '')}/panel/marketplace?tab=offers`;
      await sendNotificationEvent({
        eventCode: 'marketplace_offer_received',
        entityType: 'marketplace_offer',
        entityId: String(offer.id),
        userId: listing?.seller_id || null,
        audience: 'seller',
        toEmail: sellerUser?.email || '',
        recipientName: sellerUser?.name || '',
        language: sellerUser?.language || sellerUser?.country || 'es',
        variables: {
          userName: sellerUser?.name || sellerUser?.email || '',
          listingTitle: listing?.title || '',
          offerAmount: (Number(offer.amount_minor || amountMinor) / 100).toFixed(2),
          currency: offer.currency || listing?.currency || 'EUR',
          offerStatus: 'Pendiente',
          offerUrl,
          buyerName: buyerUser?.name || buyerUser?.email || ''
        }
      }).catch(() => null);

      res.json({ success: true, offer });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'No se pudo enviar la oferta.' });
    }
  });

  router.put('/offers/:id/respond', authMiddleware, async (req: any, res: Response) => {
    try {
      const { status, counterAmount } = req.body;
      const counterMinor = counterAmount ? Math.round(Number(counterAmount) * 100) : undefined;
      const previousOffer = (await MarketplaceRepo.listOffers(req.user.id)).find((item: any) => String(item.id) === String(req.params.id));
      await MarketplaceRepo.respondOffer(req.params.id, req.user.id, status, counterMinor);
      const buyerUser = previousOffer ? await UserRepo.getById(previousOffer.buyer_id).catch(() => null) : null;
      const offerUrl = `${(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '')}/panel/marketplace?tab=offers`;
      await sendNotificationEvent({
        eventCode: 'marketplace_offer_updated',
        entityType: 'marketplace_offer',
        entityId: String(req.params.id),
        userId: previousOffer?.buyer_id || null,
        audience: 'buyer',
        toEmail: buyerUser?.email || '',
        recipientName: buyerUser?.name || '',
        language: buyerUser?.language || buyerUser?.country || 'es',
        variables: {
          userName: buyerUser?.name || buyerUser?.email || '',
          listingTitle: previousOffer?.listing_title || '',
          offerAmount: (Number(counterMinor || previousOffer?.amount_minor || 0) / 100).toFixed(2),
          currency: previousOffer?.currency || 'EUR',
          offerStatus: status === 'accepted' ? 'Aceptada' : status === 'rejected' ? 'Rechazada' : 'Con contraoferta',
          offerUrl,
          buyerName: buyerUser?.name || buyerUser?.email || ''
        }
      }).catch(() => null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'No se pudo procesar la respuesta a la oferta.' });
    }
  });

  router.get('/offers', authMiddleware, async (req: any, res: Response) => {
    try {
      const offers = await MarketplaceRepo.listOffers(req.user.id);
      res.json({ offers });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar las ofertas.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 11. Orders & Checkout (Integrated with DoorDrop Wallet / PayPal)
  // ---------------------------------------------------------------------------
  router.post('/orders', authMiddleware, async (req: any, res: Response) => {
    try {
      const {
        listingId,
        shippingPrice,
        shippingServiceName,
        shippingProviderCode,
        quoteId,
        offerId,
        buyerAddress,
        paymentMethod = 'wallet'
      } = req.body;
      const normalizedPaymentMethod = String(paymentMethod || 'wallet').trim().toLowerCase();
      if (!['wallet', 'paypal'].includes(normalizedPaymentMethod)) {
        return res.status(400).json({ error: 'Método de pago no válido.' });
      }

      const listing = await MarketplaceRepo.getListingById(listingId);
      if (!listing) return res.status(404).json({ error: 'Publicación no encontrada.' });
      if (listing.status !== 'active') return res.status(400).json({ error: 'El producto ya no está disponible.' });
      if (listing.seller_id === req.user.id) return res.status(400).json({ error: 'No puedes comprar tu propio producto.' });

      const normalizedOfferId = String(offerId || '').trim() || null;
      const acceptedOffer = normalizedOfferId
        ? await MarketplaceRepo.getAcceptedOfferForBuyer(normalizedOfferId, String(listing.id), req.user.id)
        : null;
      if (normalizedOfferId && !acceptedOffer) {
        return res.status(400).json({ error: 'La oferta aceptada ya no está disponible para esta compra.' });
      }

      const productAmountMinor = acceptedOffer?.amount_minor || listing.price_minor;
      const shippingAmountMinor = Math.round(Number(shippingPrice || 0) * 100);
      
      // 5% DoorDrop protection / commission
      const commissionAmountMinor = Math.round(productAmountMinor * 0.05);
      const protectionAmountMinor = Math.round(productAmountMinor * 0.02); // 2% buyer protection
      const totalAmountMinor = productAmountMinor + shippingAmountMinor + protectionAmountMinor;

      const sourceCurrency = String(listing.currency || 'EUR').toUpperCase().slice(0, 3);
      let walletDebit: any = null;

      // Handle payment method: Wallet
      if (normalizedPaymentMethod === 'wallet') {
        if (!mutateWallet) {
          return res.status(503).json({ error: 'El cobro del Marketplace no está disponible temporalmente.' });
        }
        try {
          walletDebit = await mutateWallet({
            userId: req.user.id,
            type: 'debit',
            amount: totalAmountMinor / 100,
            currency: sourceCurrency,
            description: `Compra Marketplace: ${String(listing.title || listing.id).slice(0, 160)}`,
            referenceType: 'marketplace_checkout',
            referenceId: `marketplace:${listing.id}:${req.user.id}:${Date.now()}`
          });
        } catch (error: any) {
          if (error?.code === 'WALLET_INSUFFICIENT') {
            return res.status(400).json({
              error: 'Saldo insuficiente en tu billetera DoorDrop.',
              balance: Number(error.balance || 0),
              required: Number(error.required || 0)
            });
          }
          if (error?.code === 'FX_UNAVAILABLE') {
            return res.status(503).json({ error: 'No hay una tasa de cambio disponible para completar la compra.' });
          }
          throw error;
        }
      }

      const sellerProfile = await MarketplaceRepo.getSellerProfileByUserId(listing.seller_id);
      const sellerAddress = {
        name: sellerProfile?.display_name || 'Vendedor DoorDrop',
        email: (await UserRepo.getById(listing.seller_id).catch(() => null))?.email || '',
        address: sellerProfile?.address || '',
        city: listing.city,
        region: listing.region,
        country: listing.country_code,
        postalCode: listing.postal_code || sellerProfile?.zip_code || '',
        phone: sellerProfile?.phone || ''
      };

      if (normalizedPaymentMethod === 'paypal') {
        if (!paypalCreateOrder) {
          return res.status(503).json({ error: 'PayPal no está disponible temporalmente.' });
        }
        let pendingOrder: any = null;
        try {
          pendingOrder = await MarketplaceRepo.createOrder({
            listingId,
            buyerId: req.user.id,
            offerId: acceptedOffer?.id || null,
            productAmountMinor,
            shippingAmountMinor,
            commissionAmountMinor,
            protectionAmountMinor,
            totalAmountMinor,
            currency: sourceCurrency,
            buyerAddress,
            sellerAddress,
            shippingServiceName,
            shippingProviderCode,
            quoteId,
            paymentMethod: 'paypal',
            status: 'pending_payment',
            reserveListing: true
          });
          const appUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
          const checkout = await paypalCreateOrder({
            referenceId: pendingOrder.id,
            amount: totalAmountMinor / 100,
            currency: sourceCurrency,
            description: `Compra Marketplace DoorDrop: ${String(listing.title || listing.id).slice(0, 120)}`,
            returnUrl: `${appUrl}/marketplace?paypal_payment=success&order_id=${encodeURIComponent(pendingOrder.id)}`,
            cancelUrl: `${appUrl}/marketplace?paypal_payment=cancel&order_id=${encodeURIComponent(pendingOrder.id)}`
          });
          await pool.query(`UPDATE marketplace_orders SET payment_reference = ?, updated_at = NOW() WHERE id = ?`, [checkout.orderId, pendingOrder.id]);
          return res.status(201).json({
            success: true,
            pending: true,
            checkoutUrl: checkout.checkoutUrl,
            paypalOrderId: checkout.orderId,
            chargeAmount: checkout.chargeAmount,
            chargeCurrency: checkout.chargeCurrency,
            order: { ...pendingOrder, payment_reference: checkout.orderId }
          });
        } catch (error: any) {
          if (pendingOrder?.id) await MarketplaceRepo.cancelPendingOrder(pendingOrder.id, req.user.id).catch(() => null);
          console.error('[Marketplace] No se pudo crear checkout PayPal:', error?.code || error?.message || 'error');
          return res.status(400).json({ error: 'No se pudo abrir el pago seguro con PayPal.' });
        }
      }

      let order: any;
      try {
        order = await MarketplaceRepo.createOrder({
          listingId,
          buyerId: req.user.id,
          offerId: acceptedOffer?.id || null,
          productAmountMinor,
          shippingAmountMinor,
          commissionAmountMinor,
          protectionAmountMinor,
          totalAmountMinor,
          currency: sourceCurrency,
          buyerAddress,
          sellerAddress,
          shippingServiceName,
          shippingProviderCode,
          quoteId,
          paymentMethod: normalizedPaymentMethod
        });
      } catch (error) {
        if (walletDebit && mutateWallet) {
          try {
            await mutateWallet({
              userId: req.user.id,
              type: 'credit',
              amount: walletDebit.sourceAmount,
              currency: walletDebit.sourceCurrency,
              description: 'Reversión de cobro Marketplace no creado',
              referenceType: 'marketplace_checkout_reversal',
              referenceId: walletDebit.transactionId
            });
          } catch (reversalError: any) {
            console.error('[Marketplace] No se pudo revertir el cobro fallido:', reversalError?.code || reversalError?.message || 'error');
          }
        }
        throw error;
      }

      const shipmentPreparation = prepareOrderShipment
        ? await prepareOrderShipment(order.id).catch((error: any) => ({ success: false, pending: true, error: error?.message || 'Preparaci�n pendiente.' }))
        : null;

      // Notify seller via system message in conversation
      try {
        const conv = await MarketplaceRepo.findOrCreateConversation(listingId, req.user.id, listing.seller_id);
        await MarketplaceRepo.sendMessage(
          conv.id,
          req.user.id,
          `¡Compra confirmada! Pedido ${order.order_number} por ${(totalAmountMinor / 100).toFixed(2)} ${sourceCurrency}. El vendedor preparará el paquete con DoorDrop Envíos.`,
          'system'
        );
      } catch {}

      const buyerUser = await UserRepo.getById(req.user.id).catch(() => req.user);
      const sellerUser = await UserRepo.getById(listing.seller_id).catch(() => null);
      const appUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
      const orderUrl = `${appUrl}/panel/marketplace?tab=orders`;
      const orderTotal = (Number(order.total_amount_minor || totalAmountMinor) / 100).toFixed(2);
      const buyerName = buyerUser?.name || buyerAddress?.fullName || buyerUser?.email || '';
      const sellerName = sellerProfile?.display_name || sellerUser?.name || sellerUser?.email || '';

      await Promise.all([
        sendNotificationEvent({
          eventCode: 'marketplace_order_paid_buyer',
          entityType: 'marketplace_order',
          entityId: String(order.id),
          userId: req.user.id,
          audience: 'buyer',
          toEmail: buyerUser?.email || req.user.email || '',
          recipientName: buyerName,
          language: buyerUser?.language || buyerUser?.country || 'es',
          variables: {
            userName: buyerName,
            orderNumber: order.order_number,
            listingTitle: listing.title,
            totalAmount: orderTotal,
            currency: sourceCurrency,
            orderStatus: 'Pagado',
            orderUrl,
            sellerName
          }
        }).catch(() => null),
        sendNotificationEvent({
          eventCode: 'marketplace_sale_received',
          entityType: 'marketplace_order',
          entityId: String(order.id),
          userId: listing.seller_id,
          audience: 'seller',
          toEmail: sellerUser?.email || '',
          recipientName: sellerName,
          language: sellerUser?.language || sellerUser?.country || 'es',
          variables: {
            sellerName,
            orderNumber: order.order_number,
            listingTitle: listing.title,
            totalAmount: orderTotal,
            currency: sourceCurrency,
            buyerName,
            orderUrl,
            shippingAddressUrl: orderUrl
          }
        }).catch(() => null)
      ]);

      res.json({ success: true, order, shipment: shipmentPreparation });
    } catch (error: any) {
      console.error('[Marketplace] Error al crear pedido:', error);
      res.status(500).json({ error: error.message || 'No se pudo procesar la compra.' });
    }
  });

  router.post('/orders/:id/package', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      if (!prepareOrderShipment) return res.status(503).json({ error: 'La preparaci�n log�stica no est� disponible temporalmente.' });
      const order = await MarketplaceRepo.getOrderById(req.params.id, req.user.id);
      if (!order || order.seller_id !== req.user.id) return res.status(404).json({ error: 'Pedido no encontrado.' });
      if (!['paid', 'preparing'].includes(String(order.status))) return res.status(409).json({ error: 'El pedido a�n no est� listo para preparar el env�o.' });
      const weightKg = Number(req.body?.weightKg);
      const lengthCm = Number(req.body?.lengthCm);
      const widthCm = Number(req.body?.widthCm);
      const heightCm = Number(req.body?.heightCm);
      if (![weightKg, lengthCm, widthCm, heightCm].every(Number.isFinite) || weightKg <= 0 || lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) {
        return res.status(400).json({ error: 'Indica peso y medidas reales mayores que cero.' });
      }
      const result = await prepareOrderShipment(order.id, { weightKg, lengthCm, widthCm, heightCm, services: req.body?.services || null });
      res.status(result?.success === false ? 409 : 200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'No se pudo preparar el env�o.' });
    }
  });

  router.post('/orders/:id/payout-request', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      if (!requestSellerPayout) return res.status(503).json({ error: 'Los retiros no est�n disponibles temporalmente.' });
      const order = await MarketplaceRepo.getOrderById(req.params.id, req.user.id);
      if (!order || order.seller_id !== req.user.id) return res.status(404).json({ error: 'Pedido no encontrado.' });
      const result = await requestSellerPayout(order.id, req.user.id);
      res.status(result?.success === false ? 409 : 201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'No se pudo solicitar el retiro.' });
    }
  });

  router.get('/seller/payouts', authMiddleware, requireAcceptedSellerTerms, async (req: any, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT p.*, o.order_number, l.title AS listing_title
           FROM marketplace_payout_requests p
           JOIN marketplace_orders o ON o.id = p.order_id
           JOIN marketplace_listings l ON l.id = o.listing_id
          WHERE p.seller_id = ? ORDER BY p.requested_at DESC LIMIT 100`,
        [req.user.id]
      );
      res.json({ payouts: rows });
    } catch {
      res.status(500).json({ error: 'No se pudieron cargar los retiros.' });
    }
  });

  router.get('/orders', authMiddleware, async (req: any, res: Response) => {
    try {
      const role = req.query.role === 'seller' ? 'seller' : 'buyer';
      const orders = await MarketplaceRepo.listUserOrders(req.user.id, role);
      res.json({ orders });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
    }
  });

  router.get('/orders/:id', authMiddleware, async (req: any, res: Response) => {
    try {
      const order = await MarketplaceRepo.getOrderById(req.params.id, req.user.id);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
      res.json({ order });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo cargar el pedido.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 12. Admin Marketplace Management
  // ---------------------------------------------------------------------------
  router.get('/admin/stats', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [listingsCount]: any = await pool.query(
        `SELECT
          COUNT(*) AS total_listings,
          COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_listings,
          COUNT(CASE WHEN status = 'pending_review' THEN 1 END) AS pending_review_listings,
          COUNT(CASE WHEN status = 'sold' THEN 1 END) AS sold_listings
         FROM marketplace_listings`
      );
      const [sellersCount]: any = await pool.query(
        `SELECT
          COUNT(*) AS total_sellers,
          COUNT(CASE WHEN verification_level = 'verified' THEN 1 END) AS verified_sellers
         FROM marketplace_seller_profiles`
      );
      const [ordersCount]: any = await pool.query(
        `SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(total_amount_minor), 0) AS total_volume_minor,
          COALESCE(SUM(commission_amount_minor), 0) AS total_commission_minor
         FROM marketplace_orders WHERE status != 'cancelled'`
      );

      res.json({
        listings: listingsCount[0] || {},
        sellers: sellersCount[0] || {},
        orders: ordersCount[0] || {}
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al cargar estadísticas admin.' });
    }
  });

  router.get('/admin/listings', authMiddleware, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const status = req.query.status ? String(req.query.status) : '';
      const sql = status
        ? `SELECT l.*, p.display_name AS seller_name FROM marketplace_listings l LEFT JOIN marketplace_seller_profiles p ON p.user_id = l.seller_id WHERE l.status = ? ORDER BY l.created_at DESC LIMIT 100`
        : `SELECT l.*, p.display_name AS seller_name FROM marketplace_listings l LEFT JOIN marketplace_seller_profiles p ON p.user_id = l.seller_id ORDER BY l.created_at DESC LIMIT 100`;
      const [rows]: any = await pool.query(sql, status ? [status] : []);
      res.json({ listings: rows });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al cargar listado de publicaciones.' });
    }
  });

  router.post('/admin/listings/:id/moderate', authMiddleware, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const { status, notes } = req.body;
      await pool.query(
        `UPDATE marketplace_listings SET status = ?, moderation_notes = ?, moderated_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [status, notes || null, req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al moderar publicación.' });
    }
  });

  router.get('/admin/sellers', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT p.*, u.email, u.name AS user_name FROM marketplace_seller_profiles p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 100`
      );
      res.json({ sellers: rows });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al cargar vendedores.' });
    }
  });

  router.post('/admin/sellers/:id/verify', authMiddleware, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const { verificationLevel, isActive } = req.body;
      await pool.query(
        `UPDATE marketplace_seller_profiles SET
          verification_level = COALESCE(?, verification_level),
          is_active = COALESCE(?, is_active),
          verified_at = CASE WHEN ? = 'verified' THEN NOW() ELSE verified_at END,
          updated_at = NOW()
         WHERE id = ?`,
        [verificationLevel || null, isActive !== undefined ? (isActive ? 1 : 0) : null, verificationLevel, req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al actualizar verificación.' });
    }
  });

  // Mount router under app
  app.use('/api/marketplace', router);
  console.log('[Marketplace] Rutas de API montadas exitosamente en /api/marketplace');
}
