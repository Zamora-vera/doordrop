export interface MarketplaceSellerProfile {
  id: string;
  user_id: string;
  display_name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  phone: string | null;
  country: string;
  city: string | null;
  region: string | null;
  zip_code: string | null;
  address: string | null;
  seller_type: 'individual' | 'business';
  verification_level: 'unverified' | 'verified' | 'professional';
  verified_at: string | null;
  is_active: number;
  avg_response_time_minutes: number | null;
  total_sales: number;
  total_ratings: number;
  avg_rating: number;
  terms_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceCategory {
  id: number;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: number;
  parent_id: number | null;
  created_at: string;
  translated_name?: string;
}

export interface MarketplaceListing {
  id: string;
  seller_id: string;
  category_id: number | null;
  title: string;
  slug: string;
  description: string;
  condition: 'new' | 'like_new' | 'excellent' | 'good' | 'used' | 'repair';
  price_minor: number;
  currency: string;
  city: string;
  region: string | null;
  country_code: string;
  postal_code: string | null;
  original_language: string;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  quantity: number;
  negotiable: number;
  shipping_available: number;
  pickup_available: number;
  shipping_from_minor: number | null;
  status: 'draft' | 'pending_review' | 'active' | 'rejected' | 'reserved' | 'sold' | 'paused' | 'archived';
  risk_score: number;
  moderation_notes: string | null;
  moderated_at: string | null;
  view_count: number;
  favorite_count: number;
  created_at: string;
  updated_at: string;
  images?: MarketplaceListingImage[];
  seller?: {
    id: string;
    display_name: string;
    slug: string;
    avatar_url: string | null;
    city: string | null;
    country: string;
    verification_level: string;
    avg_rating: number;
    total_sales: number;
    created_at: string;
  };
  category?: {
    id: number;
    slug: string;
    name: string;
    icon: string | null;
  };
}

export interface MarketplaceListingImage {
  id: string;
  listing_id: string;
  file_key: string | null;
  url: string;
  sort_order: number;
  is_cover: number;
  created_at: string;
}

export interface MarketplaceConversation {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string | null;
  is_archived: number;
  created_at: string;
  listing_title?: string;
  listing_slug?: string;
  listing_price_minor?: number;
  listing_currency?: string;
  listing_image_url?: string;
  buyer_name?: string;
  seller_name?: string;
  last_message?: string;
}

export interface MarketplaceMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: 'text' | 'image' | 'offer' | 'system';
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  sender_name?: string;
}

export interface MarketplaceOffer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_minor: number;
  currency: string;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled' | 'expired';
  counter_of_id: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
  listing_title?: string;
  listing_price_minor?: number;
  buyer_name?: string;
  seller_name?: string;
}

export interface MarketplaceOrder {
  id: string;
  order_number: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  shipment_id: string | null;
  quote_id: string | null;
  product_amount_minor: number;
  shipping_amount_minor: number;
  commission_amount_minor: number;
  protection_amount_minor: number;
  total_amount_minor: number;
  currency: string;
  status: 'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'in_transit' | 'delivered' | 'protection_period' | 'completed' | 'dispute' | 'refunded' | 'cancelled';
  payment_method: string | null;
  payment_reference: string | null;
  buyer_address_json: any;
  seller_address_json: any;
  shipping_service_name: string | null;
  shipping_provider_code: string | null;
  tracking_code: string | null;
  label_url: string | null;
  protection_ends_at: string | null;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  listing_title?: string;
  buyer_name?: string;
  seller_name?: string;
}
