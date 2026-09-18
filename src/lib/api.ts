const API_BASE = '/api';

export const getAuthToken = () => localStorage.getItem('spedire_token');
export const setAuthToken = (token: string) => localStorage.setItem('spedire_token', token);
export const removeAuthToken = () => localStorage.removeItem('spedire_token');

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: token } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers, credentials: 'same-origin' });
  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!response.ok) {
      throw new Error('No se pudo completar la operación. Intenta nuevamente más tarde.');
    }
    throw new Error('Respuesta inválida del servidor.');
  }

  if (!response.ok) {
    const error: any = new Error(data.error || data.message || 'No se pudo completar la operación. Intenta nuevamente más tarde.');
    error.code = data.code;
    error.status = response.status;
    error.email = data.email;
    error.requiresEmailVerification = Boolean(data.requiresEmailVerification);
    throw error;
  }
  return data;
}

export const api = {
  getAdminSmtpConfig: () => fetchAPI('/admin/smtp/config'),
  testAdminSmtp: (data: any) => fetchAPI('/admin/smtp/test', { method: 'POST', body: JSON.stringify(data) }),
  getAdminEmailTemplates: () => fetchAPI('/admin/smtp/templates'),
  getAdminEmailTemplate: (id: string) => fetchAPI(`/admin/smtp/templates/${id}`),
  updateAdminEmailTemplate: (id: string, data: any) => fetchAPI(`/admin/smtp/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  sendAdminTemplateTest: (id: string, data: any) => fetchAPI(`/admin/smtp/templates/${id}/send-test`, { method: 'POST', body: JSON.stringify(data) }),
  getAdminEmailNotificationEvents: () => fetchAPI('/admin/smtp/events'),
  updateAdminEmailNotificationEvent: (eventCode: string, data: any) => fetchAPI(`/admin/smtp/events/${encodeURIComponent(eventCode)}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminWebmailStatus: () => fetchAPI('/admin/webmail/status'),
  verifyAdminWebmail: () => fetchAPI('/admin/webmail/verify', { method: 'POST' }),
  getAdminWebmailFolders: () => fetchAPI('/admin/webmail/folders'),
  getAdminWebmailMessages: (params: { folder?: string; page?: number; pageSize?: number; search?: string } = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    return fetchAPI(`/admin/webmail/messages${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getAdminWebmailMessage: (uid: string | number, mailbox: string) => fetchAPI(`/admin/webmail/messages/${encodeURIComponent(String(uid))}?mailbox=${encodeURIComponent(mailbox)}`),
  downloadAdminWebmailAttachment: async (uid: string | number, mailbox: string, index: number) => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/admin/webmail/messages/${encodeURIComponent(String(uid))}/attachments/${encodeURIComponent(String(index))}?mailbox=${encodeURIComponent(mailbox)}`, {
      headers: token ? { Authorization: token } : {}
    });
    if (!response.ok) {
      throw new Error('El archivo adjunto no está disponible.');
    }
    return response.blob();
  },
  adminWebmailMessageAction: (uid: string | number, data: any) => fetchAPI(`/admin/webmail/messages/${encodeURIComponent(String(uid))}/action`, { method: 'POST', body: JSON.stringify(data) }),
  sendAdminWebmail: (data: any) => fetchAPI('/admin/webmail/send', { method: 'POST', body: JSON.stringify(data) }),
  saveAdminWebmailDraft: (data: any) => fetchAPI('/admin/webmail/drafts', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  getPaypalAuthConfig: () => fetchAPI('/auth/paypal/config'),
  startPaypalAuth: (mode: 'login' | 'register') => fetchAPI(`/auth/paypal/start?mode=${encodeURIComponent(mode)}`),
  completePaypalAuth: () => fetchAPI('/auth/paypal/complete', { method: 'POST' }),
  resendEmailVerification: (data: { email: string }) => fetchAPI('/auth/verify-email/resend', { method: 'POST', body: JSON.stringify(data) }),
  completeEmailVerification: (data: { token: string }) => fetchAPI('/auth/verify-email/complete', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (data: { email: string }) => fetchAPI('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (data: { token: string; newPassword: string }) => fetchAPI('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  register: (data: any) => fetchAPI('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => fetchAPI('/user/profile'),
  getUserBilling: (params: any = {}) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    return fetchAPI(`/user/billing${query.toString() ? `?${query.toString()}` : ''}`);
  },
  downloadUserBillingExport: async (format: 'csv' | 'pdf', lang: string, params: any = {}) => {
    const query = new URLSearchParams({ format, lang });
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/user/billing/export?${query.toString()}`, {
      headers: token ? { Authorization: token } : {},
      credentials: 'same-origin'
    });
    if (!response.ok) {
      let message = 'No se pudo generar el documento.';
      try {
        const data = await response.json();
        message = data.error || data.message || message;
      } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `doordrop-estado-cuenta.${format}`;
    return { blob, filename };
  },
  updateUserSettings: (data: any) => fetchAPI('/user/settings', { method: 'POST', body: JSON.stringify(data) }),
  getStores: () => fetchAPI('/stores'),
  getEcartConnectUrl: () => fetchAPI('/integrations/ecart/connect-url'),
  saveEcartCallback: (data: any) => fetchAPI('/integrations/ecart/callback', { method: 'POST', body: JSON.stringify(data) }),
  syncStoreOrders: (storeId: string, limit = 100) => fetchAPI(`/stores/${storeId}/sync`, { method: 'POST', body: JSON.stringify({ limit }) }),
  getStoreOrders: (storeId: string, status = '') => fetchAPI(`/stores/${storeId}/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateStoreOrderAddress: (orderId: string, data: any) => fetchAPI(`/store-orders/${orderId}/address`, { method: 'POST', body: JSON.stringify(data) }),
  getStoreOrderPrefill: (orderId: string) => fetchAPI(`/store-orders/${orderId}/prefill`),
  linkStoreOrderShipment: (orderId: string, shipmentId: string) => fetchAPI(`/store-orders/${orderId}/link-shipment`, { method: 'POST', body: JSON.stringify({ shipmentId }) }),
  pushStoreOrderFulfillment: (orderId: string) => fetchAPI(`/store-orders/${orderId}/push-fulfillment`, { method: 'POST' }),
  disconnectStore: (storeId: string) => fetchAPI(`/stores/${storeId}/disconnect`, { method: 'POST' }),
  getGlobalTerms: () => fetchAPI('/global/terms'),
  acceptGlobalTerms: (data: any) => fetchAPI('/global/terms/accept', { method: 'POST', body: JSON.stringify(data) }),
  getShippingTerms: () => fetchAPI('/shipping/terms'),
  acceptShippingTerms: (data: any) => fetchAPI('/shipping/terms/accept', { method: 'POST', body: JSON.stringify(data) }),
  quoteShipment: (data: any) => fetchAPI('/shipments/quote', { method: 'POST', body: JSON.stringify(data) }),
  createShipment: (data: any) => fetchAPI('/shipments', { method: 'POST', body: JSON.stringify(data) }),
  getSpedireProDropOffPoints: (data: any) => fetchAPI('/spedirepro/drop-off-points', { method: 'POST', body: JSON.stringify(data) }),
  getDropOffPoints: (data: any) => fetchAPI('/spedirepro/drop-off-points', { method: 'POST', body: JSON.stringify(data) }),
  getShipments: () => fetchAPI('/shipments'),
  updateShipment: (id: string, data: any) => fetchAPI(`/shipments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  finalizeShipment: (id: string) => fetchAPI(`/shipments/${id}/finalize`, { method: 'POST' }),
  retryShipmentLabel: (id: string) => fetchAPI(`/shipments/${id}/retry-label`, { method: 'POST' }),
  requestShipmentCancellation: (id: string, data: any = {}) => fetchAPI(`/shipments/${id}/cancel-request`, { method: 'POST', body: JSON.stringify(data) }),
  suggestShipmentCancellationReason: (id: string, data: any = {}) => fetchAPI(`/shipments/${id}/cancellation-reason/suggest`, { method: 'POST', body: JSON.stringify(data) }),
  trackShipment: (code: string) => fetchAPI(`/tracking/${code}`),
  getAdminStats: () => fetchAPI('/admin/stats'),
  getAdminStaff: () => fetchAPI('/admin/staff'),
  createAdminStaff: (data: any) => fetchAPI('/admin/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminStaff: (id: string, data: any) => fetchAPI(`/admin/staff/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminAssistanceOverview: () => fetchAPI('/admin/assistance/overview'),
  getAdminAssistanceSettings: () => fetchAPI('/admin/assistance/settings'),
  saveAdminAssistanceSettings: (data: any) => fetchAPI('/admin/assistance/settings', { method: 'POST', body: JSON.stringify(data) }),
  getAdminAssistanceChannels: () => fetchAPI('/admin/assistance/channels'),
  connectAdminAssistanceChannel: (platform: string, language: string) => fetchAPI(`/admin/assistance/channels/${encodeURIComponent(platform)}/connect-url`, { method: 'POST', body: JSON.stringify({ language }) }),
  getAdminAssistanceWhatsappStatus: () => fetchAPI('/admin/assistance/channels/whatsapp/status'),
  logoutAdminAssistanceWhatsapp: () => fetchAPI('/admin/assistance/channels/whatsapp/logout', { method: 'POST' }),
  getAdminAssistanceConversations: () => fetchAPI('/admin/assistance/conversations'),
  getAdminAssistanceMessages: (id: string) => fetchAPI(`/admin/assistance/conversations/${encodeURIComponent(id)}/messages`),
  sendAdminAssistanceMessage: (id: string, message: string) => fetchAPI(`/admin/assistance/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  adminAssistanceChat: (message: string, language: string, conversationId?: string) => fetchAPI('/admin/assistance/chat', { method: 'POST', body: JSON.stringify({ message, language, conversationId }) }),
  identifyAdminAssistanceConversation: (id: string, identifier: string) => fetchAPI(`/admin/assistance/conversations/${encodeURIComponent(id)}/identify`, { method: 'POST', body: JSON.stringify({ identifier }) }),
  handoffAdminAssistanceConversation: (id: string) => fetchAPI(`/admin/assistance/conversations/${encodeURIComponent(id)}/handoff`, { method: 'POST' }),
  getAdminAssistanceCustomers: () => fetchAPI('/admin/assistance/customers'),
  getAdminAssistanceTickets: () => fetchAPI('/admin/assistance/tickets'),
  getAdminAssistanceTeam: () => fetchAPI('/admin/assistance/team'),
  getAdminAssistanceKnowledge: () => fetchAPI('/admin/assistance/knowledge'),
  createAdminAssistanceKnowledge: (data: any) => fetchAPI('/admin/assistance/knowledge', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminAssistanceKnowledge: (id: string, data: any) => fetchAPI(`/admin/assistance/knowledge/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminClients: () => fetchAPI('/admin/clients'),
  getAdminClient: (id: string) => fetchAPI(`/admin/clients/${id}`),
  adminRechargeClient: (id: string, data: any) => fetchAPI(`/admin/clients/${id}/recharge`, { method: 'POST', body: JSON.stringify(data) }),
  adminClearClientDebt: (id: string, data: any = {}) => fetchAPI(`/admin/clients/${id}/clear-debt`, { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateClientStatus: (id: string, status: string) => fetchAPI(`/admin/clients/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  adminRemoveClientCard: (id: string) => fetchAPI(`/admin/clients/${id}/remove-card`, { method: 'POST' }),
  adminImpersonateClient: (id: string) => fetchAPI(`/admin/clients/${id}/impersonate`, { method: 'POST' }),
  getAdminShipments: () => fetchAPI('/admin/shipments'),
  updateAdminShipmentStatus: (id: string, status: string) => fetchAPI(`/admin/shipments/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  getAdminProviders: () => fetchAPI('/admin/providers'),
  updateAdminProviders: (providers: any) => fetchAPI('/admin/providers', { method: 'POST', body: JSON.stringify({ providers }) }),
  testAdminProvider: (providerCode: string) => fetchAPI('/admin/providers/test', { method: 'POST', body: JSON.stringify({ providerCode }) }),
  createEasyPostWebhook: (data: any = {}) => fetchAPI('/admin/easypost/webhook/create', { method: 'POST', body: JSON.stringify(data) }),
  polarCreateWebhook: () => fetchAPI('/admin/polar/webhook/create', { method: 'POST' }),
  polarListWebhooks: () => fetchAPI('/admin/polar/webhooks'),
  getAdminSettings: () => fetchAPI('/admin/settings'),
  getAdminEcartStatus: () => fetchAPI('/admin/integrations/ecartapi/status'),
  getAdminPodStatus: () => fetchAPI('/pod/admin/status'),
  triggerAdminPodSync: (data: any = {}) => fetchAPI('/pod/admin/sync', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminPodSettings: (data: any) => fetchAPI('/pod/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
  testAdminEcart: () => fetchAPI('/admin/integrations/ecartapi/test', { method: 'POST' }),
  getSpedireProIntegration: () => fetchAPI('/admin/spedirepro/integration'),
  getSpedireProWallet: (params: any = {}) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    return fetchAPI(`/admin/spedirepro/wallet${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getSpedireProWebhookHistory: (params: any = {}) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    return fetchAPI(`/admin/spedirepro/webhook-history${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getSpedireProLocalWebhooks: () => fetchAPI('/admin/spedirepro/local-webhooks'),
  getAdminLabelCronStatus: () => fetchAPI('/admin/label-cron/status'),
  runAdminLabelCron: (limit = 10) => fetchAPI('/admin/label-cron/run', { method: 'POST', body: JSON.stringify({ limit }) }),
  getAdminStatusCronStatus: () => fetchAPI('/admin/status-cron/status'),
  runAdminStatusCron: (limit = 25) => fetchAPI('/admin/status-cron/run', { method: 'POST', body: JSON.stringify({ limit }) }),
  getAdminEmailLogs: () => fetchAPI('/admin/email/logs'),
  sendAdminTestEmail: (data: any) => fetchAPI('/admin/email/test', { method: 'POST', body: JSON.stringify(data) }),
  getPublicBrand: () => fetchAPI('/public/brand'),
  updateAdminSettings: (data: any) => fetchAPI('/admin/settings', { method: 'POST', body: JSON.stringify(data?.apiKeys || data?.brand ? data : { apiKeys: data }) }),
  getAdminPlans: () => fetchAPI('/admin/plans'),
  updateAdminPlans: (plans: any) => fetchAPI('/admin/plans', { method: 'POST', body: JSON.stringify({ plans }) }),
  getPolarStatus: () => fetchAPI('/admin/polar/status'),
  createPolarWebhook: () => fetchAPI('/admin/polar/webhook/create', { method: 'POST' }),
  createPayPalWebhook: () => fetchAPI('/admin/paypal/webhook/create', { method: 'POST' }),
  syncPayPalProducts: () => fetchAPI('/admin/paypal/products/sync', { method: 'POST' }),
  getPaymentIntegration: (provider: string) => fetchAPI(`/admin/payment-integrations/${encodeURIComponent(provider)}`),
  savePaymentIntegration: (provider: string, settings: any) => fetchAPI(`/admin/payment-integrations/${encodeURIComponent(provider)}/settings`, { method: 'POST', body: JSON.stringify(settings) }),
  getApiDocsContent: (lang = 'en') => fetchAPI(`/docs/content?lang=${encodeURIComponent(lang)}`),
  getApiDocsOpenApi: () => fetch('/api/docs/openapi.json').then(r => r.json()),
  getApiDocsOpenAiTools: () => fetch('/api/docs/openai-tools.json').then(r => r.json()),
  getSubscriptionPlans: () => fetchAPI('/subscription-plans'),
  subscribeWithWallet: (planId: string) => fetchAPI('/subscriptions/wallet/activate', { method: 'POST', body: JSON.stringify({ planId }) }),
  paypalSubscriptionCheckout: (planId: string) => fetchAPI('/subscriptions/paypal/create-checkout', { method: 'POST', body: JSON.stringify({ planId }) }),
  polarSubscriptionCheckout: (planId: string) => fetchAPI('/subscriptions/polar/plan-checkout', { method: 'POST', body: JSON.stringify({ planId }) }),
  syncPolarProducts: () => fetchAPI('/admin/polar/products/sync', { method: 'POST' }),
  getAdminReports: (params: any = {}) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    return fetchAPI(`/admin/reports${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getUserReports: () => fetchAPI('/user/reports'),
  paypalGetConfig: () => fetchAPI('/payments/paypal/config'),
  paypalCreateOrder: (amount: number) => fetchAPI('/payments/paypal/create-order', { method: 'POST', body: JSON.stringify({ amount }) }),
  paypalCaptureOrder: (orderId: string) => fetchAPI('/payments/paypal/capture-order', { method: 'POST', body: JSON.stringify({ orderId }) }),
  polarCreateCheckout: () => fetchAPI('/subscriptions/polar/create-checkout', { method: 'POST' }),
  getTickets: () => fetchAPI('/tickets'),
  createTicket: (data: any) => fetchAPI('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  replyTicket: (id: string, data: any) => fetchAPI(`/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(data) }),
  aiSuggestReply: (id: string, lang: string) => fetchAPI(`/tickets/${id}/ai-suggest`, { method: 'POST', body: JSON.stringify({ lang }) }),
  resolveTicket: (id: string) => fetchAPI(`/tickets/${id}/resolve`, { method: 'POST' }),
  adminApproveCancellation: (id: string, data: any = {}) => fetchAPI(`/admin/cancellation-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  adminRejectCancellation: (id: string, data: any = {}) => fetchAPI(`/admin/cancellation-requests/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  aiChat: (message: string, history: any[], lang: string) => fetchAPI('/ai/chat', { method: 'POST', body: JSON.stringify({ message, history, lang }) }),
  copilotMessage: (message: string, history: any[], lang: string, conversationId?: string) => fetchAPI('/copilot/message', { method: 'POST', body: JSON.stringify({ message, history, lang, conversationId }) }),
  getAdminAISettings: () => fetchAPI('/admin/ai-settings'),
  updateAdminAISettings: (ai: any) => fetchAPI('/admin/ai-settings', { method: 'PUT', body: JSON.stringify(ai) }),
  getCurrencies: () => fetchAPI('/currencies'),
  connectCard: (data: any) => fetchAPI('/user/connect-card', { method: 'POST', body: JSON.stringify(data) }),
  startPaypalLink: () => fetchAPI('/user/paypal/connect'),
  rechargeWallet: (amount: number, paymentProvider: 'polar' | 'paypal' = 'polar') => fetchAPI('/user/recharge', { method: 'POST', body: JSON.stringify({ amount, paymentProvider }) }),
  getAddressBook: (type?: string) => fetchAPI('/address-book' + (type ? `?type=${type}` : '')),
  saveAddressBook: (data: any) => fetchAPI('/address-book', { method: 'POST', body: JSON.stringify(data) }),
  deleteAddressBook: (id: string) => fetchAPI(`/address-book/${id}`, { method: 'DELETE' }),

  getBankAccounts: (params: any = {}) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
    });
    return fetchAPI(`/bank-accounts${query.toString() ? `?${query.toString()}` : ''}`);
  },
  submitWalletTransferProof: (data: any) => fetchAPI('/user/wallet/transfer-proof', { method: 'POST', body: JSON.stringify(data) }),
  getAdminBankAccounts: () => fetchAPI('/admin/bank-accounts'),
  saveAdminBankAccount: (data: any) => fetchAPI('/admin/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),
  getAdminPaymentReceipts: (status: string = 'all') => fetchAPI(`/admin/payment-receipts?status=${encodeURIComponent(status)}`),
  approveAdminPaymentReceipt: (id: string, data: any = {}) => fetchAPI(`/admin/payment-receipts/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  rejectAdminPaymentReceipt: (id: string, data: any = {}) => fetchAPI(`/admin/payment-receipts/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  adminAdjustClientBalance: (id: string, data: any) => fetchAPI(`/admin/clients/${id}/adjust-balance`, { method: 'POST', body: JSON.stringify(data) }),

  // --- MARKETPLACE INTEGRATION ---
  getMarketplaceCategories: (locale = 'es') => fetchAPI(`/marketplace/categories?locale=${encodeURIComponent(locale)}`),
  getMarketplaceListings: (params: any = {}) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') query.set(k, String(v));
    });
    return fetchAPI(`/marketplace/listings${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getMarketplaceListing: (idOrSlug: string) => fetchAPI(`/marketplace/listings/${encodeURIComponent(idOrSlug)}`),
  quoteMarketplaceShipping: (idOrSlug: string, data: any) => fetchAPI(`/marketplace/listings/${encodeURIComponent(idOrSlug)}/quote`, { method: 'POST', body: JSON.stringify(data) }),
  getMarketplaceSeller: (slug: string) => fetchAPI(`/marketplace/sellers/${encodeURIComponent(slug)}`),
  becomeMarketplaceSeller: (data: any) => fetchAPI('/marketplace/become-seller', { method: 'POST', body: JSON.stringify(data) }),
  getMarketplaceSellerProfile: () => fetchAPI('/marketplace/seller/profile'),
  acceptMarketplaceSellerTerms: (data: { accepted: boolean; termsLanguage: 'es' | 'it' | 'en' }) => fetchAPI('/marketplace/seller/terms/accept', { method: 'POST', body: JSON.stringify(data) }),
  updateMarketplaceSellerProfile: (data: any) => fetchAPI('/marketplace/seller/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getMarketplaceSellerDashboard: () => fetchAPI('/marketplace/seller/dashboard'),
  getMarketplaceSellerListings: () => fetchAPI('/marketplace/seller/listings'),
  createMarketplaceListing: (data: any) => fetchAPI('/marketplace/seller/listings', { method: 'POST', body: JSON.stringify(data) }),
  updateMarketplaceListing: (id: string, data: any) => fetchAPI(`/marketplace/seller/listings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMarketplaceListingStatus: (id: string, status: string) => fetchAPI(`/marketplace/seller/listings/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteMarketplaceListing: (id: string) => fetchAPI(`/marketplace/seller/listings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadMarketplaceImage: (data: { imageBase64: string; filename?: string }) => fetchAPI('/marketplace/upload-image', { method: 'POST', body: JSON.stringify(data) }),
  toggleMarketplaceFavorite: (listingId: string) => fetchAPI(`/marketplace/favorites/${encodeURIComponent(listingId)}`, { method: 'POST' }),
  getMarketplaceFavorites: () => fetchAPI('/marketplace/favorites'),
  getMarketplaceFavoriteStatus: (listingId: string) => fetchAPI(`/marketplace/favorites/${encodeURIComponent(listingId)}/status`),
  startMarketplaceConversation: (listingId: string) => fetchAPI('/marketplace/conversations', { method: 'POST', body: JSON.stringify({ listingId }) }),
  getMarketplaceConversations: () => fetchAPI('/marketplace/conversations'),
  getMarketplaceMessages: (conversationId: string) => fetchAPI(`/marketplace/conversations/${encodeURIComponent(conversationId)}/messages`),
  sendMarketplaceMessage: (conversationId: string, data: { body: string; messageType?: string }) => fetchAPI(`/marketplace/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify(data) }),
  getMarketplaceOffers: () => fetchAPI('/marketplace/offers'),
  createMarketplaceOffer: (data: { listingId: string; amount: number; message?: string }) => fetchAPI('/marketplace/offers', { method: 'POST', body: JSON.stringify(data) }),
  respondMarketplaceOffer: (offerId: string, data: { status: string; counterAmount?: number }) => fetchAPI(`/marketplace/offers/${encodeURIComponent(offerId)}/respond`, { method: 'PUT', body: JSON.stringify(data) }),
  createMarketplaceOrder: (data: any) => fetchAPI('/marketplace/orders', { method: 'POST', body: JSON.stringify(data) }),
  getMarketplaceOrders: (role: 'buyer' | 'seller' = 'buyer') => fetchAPI(`/marketplace/orders?role=${role}`),
  getMarketplaceOrder: (id: string) => fetchAPI(`/marketplace/orders/${encodeURIComponent(id)}`),
  getAdminMarketplaceStats: () => fetchAPI('/marketplace/admin/stats'),
  getAdminMarketplaceListings: (status = '') => fetchAPI(`/marketplace/admin/listings${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  moderateAdminMarketplaceListing: (id: string, data: { status: string; notes?: string }) => fetchAPI(`/marketplace/admin/listings/${encodeURIComponent(id)}/moderate`, { method: 'POST', body: JSON.stringify(data) }),
  getAdminMarketplaceSellers: () => fetchAPI('/marketplace/admin/sellers'),
  verifyAdminMarketplaceSeller: (id: string, data: { verificationLevel?: string; isActive?: boolean }) => fetchAPI(`/marketplace/admin/sellers/${encodeURIComponent(id)}/verify`, { method: 'POST', body: JSON.stringify(data) }),
};
