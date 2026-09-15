export type SupportLanguage = 'es' | 'it' | 'en' | 'fr';

/** Official DoorDrop assistance number in display and WhatsApp formats. */
export const SUPPORT_WHATSAPP_NUMBER = '+39 352 076 4335';
export const SUPPORT_WHATSAPP_E164 = '393520764335';

const SUPPORT_WHATSAPP_MESSAGES: Record<SupportLanguage, string> = {
  es: 'Hola DoorDrop, necesito asistencia.',
  it: 'Ciao DoorDrop, ho bisogno di assistenza.',
  en: 'Hello DoorDrop, I need assistance.',
  fr: 'Bonjour DoorDrop, j’ai besoin d’assistance.'
};

/** Keep customer support communication limited to the languages the team handles. */
export const normalizeSupportLanguage = (value: string | null | undefined): SupportLanguage => {
  const short = String(value || '').trim().toLowerCase().slice(0, 2);
  return short === 'it' || short === 'en' || short === 'fr' || short === 'es' ? short : 'es';
};

export const getSupportWhatsAppMessage = (language: string | null | undefined): string =>
  SUPPORT_WHATSAPP_MESSAGES[normalizeSupportLanguage(language)];

export const getSupportWhatsAppUrl = (language: string | null | undefined): string =>
  `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(getSupportWhatsAppMessage(language))}`;

