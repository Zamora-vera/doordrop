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
}) {
  const router = Router();
  const { authMiddleware, requireSuperAdmin, UserRepo, pool, walletMutation: mutateWallet } = options;

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'marketplace');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

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
  router.post('/listings/:idOrSlug/quote', async (req: Request, res: Response) => {
    try {
      const { destCountry, destZip, destCity } = req.body;
      if (!destCountry || !destZip) {
        return res.status(400).json({ error: 'Por favor indica el país y código postal de destino.' });
      }

      const listing = await MarketplaceRepo.getListingById(req.params.idOrSlug);
      if (!listing) {
        return res.status(404).json({ error: 'Publicación no encontrada.' });
      }

      // Convert weight and dimensions for DoorDrop quote
      const weightKg = Math.max(0.2, (listing.weight_grams || 1000) / 1000);
      const lengthCm = listing.length_cm || 20;
      const widthCm = listing.width_cm || 15;
      const heightCm = listing.height_cm || 10;

      // Real quote request payload
      const originCountry = listing.country_code || 'IT';
      const originZip = listing.postal_code || '20121';
      const originCity = listing.city || 'Milano';

      // Check if product is direct from Matterhorn (via MH- tag in description)
      const isMatterhorn = listing.description && listing.description.includes('MH-');
      let quotes: any[] = [];

      if (isMatterhorn) {
        // Direct Supplier Delivery via Matterhorn API (/DICTIONARIES/DELIVERY/{country_code})
        let matterhornDeliveries: any[] = [];
        try {
          const destCode = String(destCountry || 'IT').toUpperCase().slice(0, 2);
          const mhRes = await fetch(`https://matterhorn-wholesale.com/B2BAPI/DICTIONARIES/DELIVERY/${destCode}`, {
            headers: { 'Authorization': '8c6d9d74ee', 'Accept': 'application/json' }
          });
          if (mhRes.ok) {
            matterhornDeliveries = await mhRes.json();
          }
        } catch (e) {
          console.warn('[Marketplace] Error consultando delivery API Matterhorn:', e);
        }

        if (Array.isArray(matterhornDeliveries) && matterhornDeliveries.length > 0) {
          quotes = matterhornDeliveries.slice(0, 3).map((d: any, idx: number) => ({
            id: `quote_mh_${d.delivery_id || idx}_${listing.id}`,
            carrier: `Spedizione Diretta (${d.shipping_method || 'Corriere Internazionale'})`,
            serviceName: `Consegna Diretta Fornitore (${d.shipping_method || 'Standard'})`,
            deliveryTime: `${d.delivery_time_days || '3-4'} giorni lavorativi`,
            price: Number(d.price || 7.90),
            currency: 'EUR',
            badge: idx === 0 ? 'Miglior tariffa' : 'Espresso',
            trackingIncluded: true,
            isDirectSupplier: true
          }));
        } else {
          // Fallback direct supplier quote
          quotes = [
            {
              id: `quote_mh_global_${listing.id}`,
              carrier: 'Spedizione Diretta (GLOBAL Express)',
              serviceName: 'Consegna Diretta Fornitore',
              deliveryTime: '3-4 giorni lavorativi',
              price: 7.90,
              currency: 'EUR',
              badge: 'Miglior tariffa',
              trackingIncluded: true,
              isDirectSupplier: true
            },
            {
              id: `quote_mh_dpd_${listing.id}`,
              carrier: 'Spedizione Diretta (DPD Europa)',
              serviceName: 'Consegna Diretta Fornitore DPD',
              deliveryTime: '4 giorni lavorativi',
              price: 9.90,
              currency: 'EUR',
              badge: 'Espresso',
              trackingIncluded: true,
              isDirectSupplier: true
            }
          ];
        }
      } else {
        // Standard marketplace item
        const isDomestic = originCountry.toUpperCase() === String(destCountry).toUpperCase();
        const baseFee = isDomestic ? 4.90 : 9.90;
        const weightExtra = (weightKg - 1) > 0 ? (weightKg - 1) * 1.50 : 0;

        quotes = [
          {
            id: `quote_standard_${listing.id}`,
            carrier: isDomestic ? (originCountry === 'IT' ? 'Poste Italiane / SDA' : 'Correos') : 'UPS Standard',
            serviceName: 'Spedizione Standard (Punto / Domicilio)',
            deliveryTime: isDomestic ? '48-72h' : '3-5 giorni lavorativi',
            price: Number((baseFee + weightExtra).toFixed(2)),
            currency: listing.currency || 'EUR',
            badge: 'Più economico',
            trackingIncluded: true
          },
          {
            id: `quote_express_${listing.id}`,
            carrier: isDomestic ? (originCountry === 'IT' ? 'BRT / Bartolini' : 'SEUR Express') : 'DHL Express',
            serviceName: 'Spedizione Express 24-48h',
            deliveryTime: isDomestic ? '24-48h' : '48-72h',
            price: Number(((baseFee * 1.5) + weightExtra).toFixed(2)),
            currency: listing.currency || 'EUR',
            badge: 'Più rapido',
            trackingIncluded: true
          }
        ];
      }

      res.json({
        quotes,
        product: {
          id: listing.id,
          title: listing.title,
          priceMinor: listing.price_minor,
          currency: listing.currency,
          originCountry,
          originCity
        }
      });
    } catch (error: any) {
      console.error('[Marketplace] Error al cotizar envío:', error);
      res.status(500).json({ error: 'No se pudo cotizar el envío para este producto.' });
    }
  });

  // ---------------------------------------------------------------------------
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
      const { displayName, description, phone, country, city, region, zipCode, address, sellerType } = req.body;

      if (!displayName || !displayName.trim()) {
        return res.status(400).json({ error: 'El nombre público del vendedor es obligatorio.' });
      }
      if (!country) {
        return res.status(400).json({ error: 'El país del vendedor es obligatorio.' });
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
        sellerType: sellerType || 'individual'
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
      res.json({ profile });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudo obtener el perfil de vendedor.' });
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

  router.get('/seller/dashboard', authMiddleware, async (req: any, res: Response) => {
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
  router.get('/seller/listings', authMiddleware, async (req: any, res: Response) => {
    try {
      const listings = await MarketplaceRepo.listSellerListings(req.user.id);
      res.json({ listings });
    } catch (error: any) {
      res.status(500).json({ error: 'No se pudieron cargar tus publicaciones.' });
    }
  });

  router.post('/seller/listings', authMiddleware, async (req: any, res: Response) => {
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

      // Auto ensure seller profile exists
      let profile = await MarketplaceRepo.getSellerProfileByUserId(req.user.id);
      if (!profile) {
        profile = await MarketplaceRepo.createSellerProfile({
          userId: req.user.id,
          displayName: req.user.name || 'Vendedor DoorDrop',
          country: countryCode.toUpperCase().slice(0, 2),
          city
        });
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

  router.put('/seller/listings/:id', authMiddleware, async (req: any, res: Response) => {
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

  router.patch('/seller/listings/:id/status', authMiddleware, async (req: any, res: Response) => {
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

  router.delete('/seller/listings/:id', authMiddleware, async (req: any, res: Response) => {
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
  router.post('/upload-image', authMiddleware, async (req: any, res: Response) => {
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
        buyerAddress,
        paymentMethod = 'wallet'
      } = req.body;

      const listing = await MarketplaceRepo.getListingById(listingId);
      if (!listing) return res.status(404).json({ error: 'Publicación no encontrada.' });
      if (listing.status !== 'active') return res.status(400).json({ error: 'El producto ya no está disponible.' });
      if (listing.seller_id === req.user.id) return res.status(400).json({ error: 'No puedes comprar tu propio producto.' });

      const productAmountMinor = listing.price_minor;
      const shippingAmountMinor = Math.round(Number(shippingPrice || 0) * 100);
      
      // 5% DoorDrop protection / commission
      const commissionAmountMinor = Math.round(productAmountMinor * 0.05);
      const protectionAmountMinor = Math.round(productAmountMinor * 0.02); // 2% buyer protection
      const totalAmountMinor = productAmountMinor + shippingAmountMinor + protectionAmountMinor;

      const sourceCurrency = String(listing.currency || 'EUR').toUpperCase().slice(0, 3);
      let walletDebit: any = null;

      // Handle payment method: Wallet
      if (paymentMethod === 'wallet') {
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
        city: listing.city,
        region: listing.region,
        country: listing.country_code,
        postalCode: listing.postal_code,
        phone: sellerProfile?.phone || ''
      };

      let order: any;
      try {
        order = await MarketplaceRepo.createOrder({
          listingId,
          buyerId: req.user.id,
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
          paymentMethod
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

      res.json({ success: true, order });
    } catch (error: any) {
      console.error('[Marketplace] Error al crear pedido:', error);
      res.status(500).json({ error: error.message || 'No se pudo procesar la compra.' });
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
