import { getAuthToken } from '../lib/api';

const API_BASE = '/api';

async function request(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: token } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!response.ok) throw new Error('Error de conexión con el servidor.');
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Error en la solicitud.');
  }
  return data;
}

export const omnichannelApi = {
  // Client Dashboard & Channels
  getDashboard: () => request('/omnichannel/dashboard'),
  getChannels: () => request('/omnichannel/channels'),
  getConnectUrl: (platform: string) => request('/omnichannel/channels/connect-url', {
    method: 'POST',
    body: JSON.stringify({ platform })
  }),
  disconnectChannel: (accountId: number) => request(`/omnichannel/channels/${accountId}`, {
    method: 'DELETE'
  }),

  // Conversations & Inbox
  getConversations: (params?: { channel?: string; status?: string; search?: string }) => {
    const sp = new URLSearchParams();
    if (params?.channel) sp.append('channel', params.channel);
    if (params?.status) sp.append('status', params.status);
    if (params?.search) sp.append('search', params.search);
    const q = sp.toString();
    return request(`/omnichannel/conversations${q ? '?' + q : ''}`);
  },
  createConversation: (data: { contact_name: string; contact_phone?: string; platform?: string; initial_message?: string }) => request('/omnichannel/conversations', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMessages: (conversationId: number) => request(`/omnichannel/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, text: string, media_url?: string) => request(`/omnichannel/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, media_url })
  }),
  toggleAi: (conversationId: number, ai_active: boolean) => request(`/omnichannel/conversations/${conversationId}/toggle-ai`, {
    method: 'POST',
    body: JSON.stringify({ ai_active })
  }),
  transferConversation: (conversationId: number, target_agent_id: string, target_agent_name?: string, target_agent_type?: 'ai' | 'human') => request(`/omnichannel/conversations/${conversationId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ target_agent_id, target_agent_name, target_agent_type })
  }),
  getTeam: () => request('/omnichannel/team'),
  addTeamMember: (data: { name: string; role?: string; email?: string; phone?: string; type?: 'ai' | 'human'; status?: string }) => request('/omnichannel/team', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateTeamMember: (id: string | number, data: any) => request(`/omnichannel/team/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteTeamMember: (id: string | number) => request(`/omnichannel/team/${id}`, {
    method: 'DELETE'
  }),
  

  // Comments & Automations
  getComments: () => request('/omnichannel/comments'),
  replyComment: (commentId: number, reply_text: string) => request(`/omnichannel/comments/${commentId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ reply_text })
  }),
  createCommentRule: (data: { name: string; platform: string; keywords: string[]; public_reply_text?: string; dm_reply_text?: string }) => request('/omnichannel/comments/rules', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // AI Employee & Knowledge
  getAiSettings: () => request('/omnichannel/ai-employee'),
  autofillAiSettings: () => request('/omnichannel/ai-employee/autofill', { method: 'POST' }),
  saveAiSettings: (data: any) => request('/omnichannel/ai-employee', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  testAiTool: (tool: string, args: any) => request('/omnichannel/ai-employee/test-tool', {
    method: 'POST',
    body: JSON.stringify({ tool, args })
  }),

  // Auto-Publishing
  getPosts: () => request('/omnichannel/posts'),
  createPost: (data: { caption: string; media_urls?: string[]; target_platforms?: string[]; scheduled_at?: string }) => request('/omnichannel/posts', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Plans & Subscriptions
  getPlans: (currency?: string) => request(`/omnichannel/plans${currency ? `?currency=${encodeURIComponent(currency)}` : ''}`),
  createPolarCheckout: (planId: string, addOns?: string[]) => request('/subscriptions/polar/plan-checkout', {
    method: 'POST',
    body: JSON.stringify({ planId, addOns })
  }),
  subscribePlan: (plan_code: string, add_ons?: string[], extra_channels?: number) => request('/omnichannel/subscribe', {
    method: 'POST',
    body: JSON.stringify({ plan_code, add_ons, extra_channels })
  }),

  // Super Admin
  getAdminSettings: () => request('/admin/omnichannel/settings'),
  saveAdminSettings: (data: any) => request('/admin/omnichannel/settings', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getAdminClients: () => request('/admin/omnichannel/clients'),
  getAdminPlans: () => request('/admin/omnichannel/plans'),
  updateAdminPlan: (id: string, data: any) => request(`/admin/omnichannel/plans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  updateAdminAddon: (id: string, data: any) => request(`/admin/omnichannel/addons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  testProviderConnection: () => request('/admin/omnichannel/test-connection', { method: 'POST' })
};
