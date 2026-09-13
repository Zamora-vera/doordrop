/** World countries + flagsapi.com — DoorDrop full seed */
export type WorldCountry = {
  code: string;
  nameEn: string;
  nameEs: string;
  language: string;
  languageName: string;
  currency: string;
  flag: string;
  flagSm: string;
};

export const FLAG_API = {
  base: 'https://flagsapi.com',
  url: (countryCode: string, style: 'flat' | 'shiny' = 'flat', size: 16 | 24 | 32 | 48 | 64 = 32) =>
    `https://flagsapi.com/${String(countryCode || '').toUpperCase()}/${style}/${size}.png`,
};

export const PRIORITY_COUNTRY_CODES = ["ES", "IT", "DO", "CO", "MX", "US", "GB", "DE", "FR", "PT", "BR", "AR", "CL", "PE", "EC", "PA", "CR", "GT", "HN", "SV", "NI", "UY", "PY", "BO", "VE", "CA", "NL", "BE", "CH", "AT", "PL", "SE", "NO", "DK", "IE", "CN", "JP", "KR", "AU", "NZ", "IN", "AE", "SA", "TR", "MA", "ZA"] as const;

export const WORLD_COUNTRIES: WorldCountry[] = [
  { code: 'AD', nameEn: 'Andorra', nameEs: 'Andorra', language: 'ca', languageName: 'Catalán', currency: 'EUR', flag: 'https://flagsapi.com/AD/flat/64.png', flagSm: 'https://flagsapi.com/AD/flat/32.png' },
  { code: 'AE', nameEn: 'United Arab Emirates', nameEs: 'Emiratos Árabes Unidos', language: 'ar', languageName: 'Árabe', currency: 'AED', flag: 'https://flagsapi.com/AE/flat/64.png', flagSm: 'https://flagsapi.com/AE/flat/32.png' },
  { code: 'AF', nameEn: 'Afghanistan', nameEs: 'Afganistán', language: 'ps', languageName: 'Pastún', currency: 'AFN', flag: 'https://flagsapi.com/AF/flat/64.png', flagSm: 'https://flagsapi.com/AF/flat/32.png' },
  { code: 'AG', nameEn: 'Antigua and Barbuda', nameEs: 'Antigua y Barbuda', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/AG/flat/64.png', flagSm: 'https://flagsapi.com/AG/flat/32.png' },
  { code: 'AI', nameEn: 'Anguilla', nameEs: 'Anguila', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/AI/flat/64.png', flagSm: 'https://flagsapi.com/AI/flat/32.png' },
  { code: 'AL', nameEn: 'Albania', nameEs: 'Albania', language: 'sq', languageName: 'Albanés', currency: 'ALL', flag: 'https://flagsapi.com/AL/flat/64.png', flagSm: 'https://flagsapi.com/AL/flat/32.png' },
  { code: 'AM', nameEn: 'Armenia', nameEs: 'Armenia', language: 'hy', languageName: 'Armenio', currency: 'AMD', flag: 'https://flagsapi.com/AM/flat/64.png', flagSm: 'https://flagsapi.com/AM/flat/32.png' },
  { code: 'AO', nameEn: 'Angola', nameEs: 'Angola', language: 'pt', languageName: 'Português', currency: 'AOA', flag: 'https://flagsapi.com/AO/flat/64.png', flagSm: 'https://flagsapi.com/AO/flat/32.png' },
  { code: 'AQ', nameEn: 'Antarctica', nameEs: 'Antártida', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/AQ/flat/64.png', flagSm: 'https://flagsapi.com/AQ/flat/32.png' },
  { code: 'AR', nameEn: 'Argentina', nameEs: 'Argentina', language: 'es', languageName: 'Español', currency: 'ARS', flag: 'https://flagsapi.com/AR/flat/64.png', flagSm: 'https://flagsapi.com/AR/flat/32.png' },
  { code: 'AS', nameEn: 'American Samoa', nameEs: 'Samoa Americana', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/AS/flat/64.png', flagSm: 'https://flagsapi.com/AS/flat/32.png' },
  { code: 'AT', nameEn: 'Austria', nameEs: 'Austria', language: 'de', languageName: 'Deutsch', currency: 'EUR', flag: 'https://flagsapi.com/AT/flat/64.png', flagSm: 'https://flagsapi.com/AT/flat/32.png' },
  { code: 'AU', nameEn: 'Australia', nameEs: 'Australia', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/AU/flat/64.png', flagSm: 'https://flagsapi.com/AU/flat/32.png' },
  { code: 'AW', nameEn: 'Aruba', nameEs: 'Aruba', language: 'nl', languageName: 'Nederlands', currency: 'AWG', flag: 'https://flagsapi.com/AW/flat/64.png', flagSm: 'https://flagsapi.com/AW/flat/32.png' },
  { code: 'AX', nameEn: 'Åland Islands', nameEs: 'Islas Åland', language: 'sv', languageName: 'Svenska', currency: 'EUR', flag: 'https://flagsapi.com/AX/flat/64.png', flagSm: 'https://flagsapi.com/AX/flat/32.png' },
  { code: 'AZ', nameEn: 'Azerbaijan', nameEs: 'Azerbaiyán', language: 'az', languageName: 'Azerí', currency: 'AZN', flag: 'https://flagsapi.com/AZ/flat/64.png', flagSm: 'https://flagsapi.com/AZ/flat/32.png' },
  { code: 'BA', nameEn: 'Bosnia and Herzegovina', nameEs: 'Bosnia y Herzegovina', language: 'bs', languageName: 'Bosnio', currency: 'BAM', flag: 'https://flagsapi.com/BA/flat/64.png', flagSm: 'https://flagsapi.com/BA/flat/32.png' },
  { code: 'BB', nameEn: 'Barbados', nameEs: 'Barbados', language: 'en', languageName: 'English', currency: 'BBD', flag: 'https://flagsapi.com/BB/flat/64.png', flagSm: 'https://flagsapi.com/BB/flat/32.png' },
  { code: 'BD', nameEn: 'Bangladesh', nameEs: 'Bangladés', language: 'bn', languageName: 'Bengalí', currency: 'BDT', flag: 'https://flagsapi.com/BD/flat/64.png', flagSm: 'https://flagsapi.com/BD/flat/32.png' },
  { code: 'BE', nameEn: 'Belgium', nameEs: 'Bélgica', language: 'nl', languageName: 'Nederlands', currency: 'EUR', flag: 'https://flagsapi.com/BE/flat/64.png', flagSm: 'https://flagsapi.com/BE/flat/32.png' },
  { code: 'BF', nameEn: 'Burkina Faso', nameEs: 'Burkina Faso', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/BF/flat/64.png', flagSm: 'https://flagsapi.com/BF/flat/32.png' },
  { code: 'BG', nameEn: 'Bulgaria', nameEs: 'Bulgaria', language: 'bg', languageName: 'Búlgaro', currency: 'BGN', flag: 'https://flagsapi.com/BG/flat/64.png', flagSm: 'https://flagsapi.com/BG/flat/32.png' },
  { code: 'BH', nameEn: 'Bahrain', nameEs: 'Baréin', language: 'ar', languageName: 'Árabe', currency: 'BHD', flag: 'https://flagsapi.com/BH/flat/64.png', flagSm: 'https://flagsapi.com/BH/flat/32.png' },
  { code: 'BI', nameEn: 'Burundi', nameEs: 'Burundi', language: 'fr', languageName: 'Français', currency: 'BIF', flag: 'https://flagsapi.com/BI/flat/64.png', flagSm: 'https://flagsapi.com/BI/flat/32.png' },
  { code: 'BJ', nameEn: 'Benin', nameEs: 'Benín', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/BJ/flat/64.png', flagSm: 'https://flagsapi.com/BJ/flat/32.png' },
  { code: 'BL', nameEn: 'Saint Barthélemy', nameEs: 'San Bartolomé', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/BL/flat/64.png', flagSm: 'https://flagsapi.com/BL/flat/32.png' },
  { code: 'BM', nameEn: 'Bermuda', nameEs: 'Bermudas', language: 'en', languageName: 'English', currency: 'BMD', flag: 'https://flagsapi.com/BM/flat/64.png', flagSm: 'https://flagsapi.com/BM/flat/32.png' },
  { code: 'BN', nameEn: 'Brunei', nameEs: 'Brunéi', language: 'ms', languageName: 'Malayo', currency: 'BND', flag: 'https://flagsapi.com/BN/flat/64.png', flagSm: 'https://flagsapi.com/BN/flat/32.png' },
  { code: 'BO', nameEn: 'Bolivia', nameEs: 'Bolivia', language: 'es', languageName: 'Español', currency: 'BOB', flag: 'https://flagsapi.com/BO/flat/64.png', flagSm: 'https://flagsapi.com/BO/flat/32.png' },
  { code: 'BQ', nameEn: 'Caribbean Netherlands', nameEs: 'Caribe Neerlandés', language: 'nl', languageName: 'Nederlands', currency: 'USD', flag: 'https://flagsapi.com/BQ/flat/64.png', flagSm: 'https://flagsapi.com/BQ/flat/32.png' },
  { code: 'BR', nameEn: 'Brazil', nameEs: 'Brasil', language: 'pt', languageName: 'Português', currency: 'BRL', flag: 'https://flagsapi.com/BR/flat/64.png', flagSm: 'https://flagsapi.com/BR/flat/32.png' },
  { code: 'BS', nameEn: 'Bahamas', nameEs: 'Bahamas', language: 'en', languageName: 'English', currency: 'BSD', flag: 'https://flagsapi.com/BS/flat/64.png', flagSm: 'https://flagsapi.com/BS/flat/32.png' },
  { code: 'BT', nameEn: 'Bhutan', nameEs: 'Bután', language: 'dz', languageName: 'Dzongkha', currency: 'BTN', flag: 'https://flagsapi.com/BT/flat/64.png', flagSm: 'https://flagsapi.com/BT/flat/32.png' },
  { code: 'BV', nameEn: 'Bouvet Island', nameEs: 'Isla Bouvet', language: 'no', languageName: 'Norsk', currency: 'NOK', flag: 'https://flagsapi.com/BV/flat/64.png', flagSm: 'https://flagsapi.com/BV/flat/32.png' },
  { code: 'BW', nameEn: 'Botswana', nameEs: 'Botsuana', language: 'en', languageName: 'English', currency: 'BWP', flag: 'https://flagsapi.com/BW/flat/64.png', flagSm: 'https://flagsapi.com/BW/flat/32.png' },
  { code: 'BY', nameEn: 'Belarus', nameEs: 'Bielorrusia', language: 'be', languageName: 'Bielorruso', currency: 'BYN', flag: 'https://flagsapi.com/BY/flat/64.png', flagSm: 'https://flagsapi.com/BY/flat/32.png' },
  { code: 'BZ', nameEn: 'Belize', nameEs: 'Belice', language: 'en', languageName: 'English', currency: 'BZD', flag: 'https://flagsapi.com/BZ/flat/64.png', flagSm: 'https://flagsapi.com/BZ/flat/32.png' },
  { code: 'CA', nameEn: 'Canada', nameEs: 'Canadá', language: 'en', languageName: 'English', currency: 'CAD', flag: 'https://flagsapi.com/CA/flat/64.png', flagSm: 'https://flagsapi.com/CA/flat/32.png' },
  { code: 'CC', nameEn: 'Cocos Islands', nameEs: 'Islas Cocos', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/CC/flat/64.png', flagSm: 'https://flagsapi.com/CC/flat/32.png' },
  { code: 'CD', nameEn: 'DR Congo', nameEs: 'Rep. Dem. del Congo', language: 'fr', languageName: 'Français', currency: 'CDF', flag: 'https://flagsapi.com/CD/flat/64.png', flagSm: 'https://flagsapi.com/CD/flat/32.png' },
  { code: 'CF', nameEn: 'Central African Republic', nameEs: 'República Centroafricana', language: 'fr', languageName: 'Français', currency: 'XAF', flag: 'https://flagsapi.com/CF/flat/64.png', flagSm: 'https://flagsapi.com/CF/flat/32.png' },
  { code: 'CG', nameEn: 'Congo', nameEs: 'Congo', language: 'fr', languageName: 'Français', currency: 'XAF', flag: 'https://flagsapi.com/CG/flat/64.png', flagSm: 'https://flagsapi.com/CG/flat/32.png' },
  { code: 'CH', nameEn: 'Switzerland', nameEs: 'Suiza', language: 'de', languageName: 'Deutsch', currency: 'CHF', flag: 'https://flagsapi.com/CH/flat/64.png', flagSm: 'https://flagsapi.com/CH/flat/32.png' },
  { code: 'CI', nameEn: 'Côte d\'Ivoire', nameEs: 'Costa de Marfil', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/CI/flat/64.png', flagSm: 'https://flagsapi.com/CI/flat/32.png' },
  { code: 'CK', nameEn: 'Cook Islands', nameEs: 'Islas Cook', language: 'en', languageName: 'English', currency: 'NZD', flag: 'https://flagsapi.com/CK/flat/64.png', flagSm: 'https://flagsapi.com/CK/flat/32.png' },
  { code: 'CL', nameEn: 'Chile', nameEs: 'Chile', language: 'es', languageName: 'Español', currency: 'CLP', flag: 'https://flagsapi.com/CL/flat/64.png', flagSm: 'https://flagsapi.com/CL/flat/32.png' },
  { code: 'CM', nameEn: 'Cameroon', nameEs: 'Camerún', language: 'fr', languageName: 'Français', currency: 'XAF', flag: 'https://flagsapi.com/CM/flat/64.png', flagSm: 'https://flagsapi.com/CM/flat/32.png' },
  { code: 'CN', nameEn: 'China', nameEs: 'China', language: 'zh', languageName: '中文', currency: 'CNY', flag: 'https://flagsapi.com/CN/flat/64.png', flagSm: 'https://flagsapi.com/CN/flat/32.png' },
  { code: 'CO', nameEn: 'Colombia', nameEs: 'Colombia', language: 'es', languageName: 'Español', currency: 'COP', flag: 'https://flagsapi.com/CO/flat/64.png', flagSm: 'https://flagsapi.com/CO/flat/32.png' },
  { code: 'CR', nameEn: 'Costa Rica', nameEs: 'Costa Rica', language: 'es', languageName: 'Español', currency: 'CRC', flag: 'https://flagsapi.com/CR/flat/64.png', flagSm: 'https://flagsapi.com/CR/flat/32.png' },
  { code: 'CU', nameEn: 'Cuba', nameEs: 'Cuba', language: 'es', languageName: 'Español', currency: 'CUP', flag: 'https://flagsapi.com/CU/flat/64.png', flagSm: 'https://flagsapi.com/CU/flat/32.png' },
  { code: 'CV', nameEn: 'Cabo Verde', nameEs: 'Cabo Verde', language: 'pt', languageName: 'Português', currency: 'CVE', flag: 'https://flagsapi.com/CV/flat/64.png', flagSm: 'https://flagsapi.com/CV/flat/32.png' },
  { code: 'CW', nameEn: 'Curaçao', nameEs: 'Curazao', language: 'nl', languageName: 'Nederlands', currency: 'ANG', flag: 'https://flagsapi.com/CW/flat/64.png', flagSm: 'https://flagsapi.com/CW/flat/32.png' },
  { code: 'CX', nameEn: 'Christmas Island', nameEs: 'Isla de Navidad', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/CX/flat/64.png', flagSm: 'https://flagsapi.com/CX/flat/32.png' },
  { code: 'CY', nameEn: 'Cyprus', nameEs: 'Chipre', language: 'el', languageName: 'Ελληνικά', currency: 'EUR', flag: 'https://flagsapi.com/CY/flat/64.png', flagSm: 'https://flagsapi.com/CY/flat/32.png' },
  { code: 'CZ', nameEn: 'Czechia', nameEs: 'Chequia', language: 'cs', languageName: 'Čeština', currency: 'CZK', flag: 'https://flagsapi.com/CZ/flat/64.png', flagSm: 'https://flagsapi.com/CZ/flat/32.png' },
  { code: 'DE', nameEn: 'Germany', nameEs: 'Alemania', language: 'de', languageName: 'Deutsch', currency: 'EUR', flag: 'https://flagsapi.com/DE/flat/64.png', flagSm: 'https://flagsapi.com/DE/flat/32.png' },
  { code: 'DJ', nameEn: 'Djibouti', nameEs: 'Yibuti', language: 'fr', languageName: 'Français', currency: 'DJF', flag: 'https://flagsapi.com/DJ/flat/64.png', flagSm: 'https://flagsapi.com/DJ/flat/32.png' },
  { code: 'DK', nameEn: 'Denmark', nameEs: 'Dinamarca', language: 'da', languageName: 'Dansk', currency: 'DKK', flag: 'https://flagsapi.com/DK/flat/64.png', flagSm: 'https://flagsapi.com/DK/flat/32.png' },
  { code: 'DM', nameEn: 'Dominica', nameEs: 'Dominica', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/DM/flat/64.png', flagSm: 'https://flagsapi.com/DM/flat/32.png' },
  { code: 'DO', nameEn: 'Dominican Republic', nameEs: 'República Dominicana', language: 'es', languageName: 'Español', currency: 'DOP', flag: 'https://flagsapi.com/DO/flat/64.png', flagSm: 'https://flagsapi.com/DO/flat/32.png' },
  { code: 'DZ', nameEn: 'Algeria', nameEs: 'Argelia', language: 'ar', languageName: 'Árabe', currency: 'DZD', flag: 'https://flagsapi.com/DZ/flat/64.png', flagSm: 'https://flagsapi.com/DZ/flat/32.png' },
  { code: 'EC', nameEn: 'Ecuador', nameEs: 'Ecuador', language: 'es', languageName: 'Español', currency: 'USD', flag: 'https://flagsapi.com/EC/flat/64.png', flagSm: 'https://flagsapi.com/EC/flat/32.png' },
  { code: 'EE', nameEn: 'Estonia', nameEs: 'Estonia', language: 'et', languageName: 'Eesti', currency: 'EUR', flag: 'https://flagsapi.com/EE/flat/64.png', flagSm: 'https://flagsapi.com/EE/flat/32.png' },
  { code: 'EG', nameEn: 'Egypt', nameEs: 'Egipto', language: 'ar', languageName: 'Árabe', currency: 'EGP', flag: 'https://flagsapi.com/EG/flat/64.png', flagSm: 'https://flagsapi.com/EG/flat/32.png' },
  { code: 'EH', nameEn: 'Western Sahara', nameEs: 'Sáhara Occidental', language: 'ar', languageName: 'Árabe', currency: 'MAD', flag: 'https://flagsapi.com/EH/flat/64.png', flagSm: 'https://flagsapi.com/EH/flat/32.png' },
  { code: 'ER', nameEn: 'Eritrea', nameEs: 'Eritrea', language: 'ti', languageName: 'Tigriña', currency: 'ERN', flag: 'https://flagsapi.com/ER/flat/64.png', flagSm: 'https://flagsapi.com/ER/flat/32.png' },
  { code: 'ES', nameEn: 'Spain', nameEs: 'España', language: 'es', languageName: 'Español', currency: 'EUR', flag: 'https://flagsapi.com/ES/flat/64.png', flagSm: 'https://flagsapi.com/ES/flat/32.png' },
  { code: 'ET', nameEn: 'Ethiopia', nameEs: 'Etiopía', language: 'am', languageName: 'Amárico', currency: 'ETB', flag: 'https://flagsapi.com/ET/flat/64.png', flagSm: 'https://flagsapi.com/ET/flat/32.png' },
  { code: 'FI', nameEn: 'Finland', nameEs: 'Finlandia', language: 'fi', languageName: 'Suomi', currency: 'EUR', flag: 'https://flagsapi.com/FI/flat/64.png', flagSm: 'https://flagsapi.com/FI/flat/32.png' },
  { code: 'FJ', nameEn: 'Fiji', nameEs: 'Fiyi', language: 'en', languageName: 'English', currency: 'FJD', flag: 'https://flagsapi.com/FJ/flat/64.png', flagSm: 'https://flagsapi.com/FJ/flat/32.png' },
  { code: 'FK', nameEn: 'Falkland Islands', nameEs: 'Islas Malvinas', language: 'en', languageName: 'English', currency: 'FKP', flag: 'https://flagsapi.com/FK/flat/64.png', flagSm: 'https://flagsapi.com/FK/flat/32.png' },
  { code: 'FM', nameEn: 'Micronesia', nameEs: 'Micronesia', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/FM/flat/64.png', flagSm: 'https://flagsapi.com/FM/flat/32.png' },
  { code: 'FO', nameEn: 'Faroe Islands', nameEs: 'Islas Feroe', language: 'fo', languageName: 'Feroés', currency: 'DKK', flag: 'https://flagsapi.com/FO/flat/64.png', flagSm: 'https://flagsapi.com/FO/flat/32.png' },
  { code: 'FR', nameEn: 'France', nameEs: 'Francia', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/FR/flat/64.png', flagSm: 'https://flagsapi.com/FR/flat/32.png' },
  { code: 'GA', nameEn: 'Gabon', nameEs: 'Gabón', language: 'fr', languageName: 'Français', currency: 'XAF', flag: 'https://flagsapi.com/GA/flat/64.png', flagSm: 'https://flagsapi.com/GA/flat/32.png' },
  { code: 'GB', nameEn: 'United Kingdom', nameEs: 'Reino Unido', language: 'en', languageName: 'English', currency: 'GBP', flag: 'https://flagsapi.com/GB/flat/64.png', flagSm: 'https://flagsapi.com/GB/flat/32.png' },
  { code: 'GD', nameEn: 'Grenada', nameEs: 'Granada', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/GD/flat/64.png', flagSm: 'https://flagsapi.com/GD/flat/32.png' },
  { code: 'GE', nameEn: 'Georgia', nameEs: 'Georgia', language: 'ka', languageName: 'Georgiano', currency: 'GEL', flag: 'https://flagsapi.com/GE/flat/64.png', flagSm: 'https://flagsapi.com/GE/flat/32.png' },
  { code: 'GF', nameEn: 'French Guiana', nameEs: 'Guayana Francesa', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/GF/flat/64.png', flagSm: 'https://flagsapi.com/GF/flat/32.png' },
  { code: 'GG', nameEn: 'Guernsey', nameEs: 'Guernsey', language: 'en', languageName: 'English', currency: 'GBP', flag: 'https://flagsapi.com/GG/flat/64.png', flagSm: 'https://flagsapi.com/GG/flat/32.png' },
  { code: 'GH', nameEn: 'Ghana', nameEs: 'Ghana', language: 'en', languageName: 'English', currency: 'GHS', flag: 'https://flagsapi.com/GH/flat/64.png', flagSm: 'https://flagsapi.com/GH/flat/32.png' },
  { code: 'GI', nameEn: 'Gibraltar', nameEs: 'Gibraltar', language: 'en', languageName: 'English', currency: 'GIP', flag: 'https://flagsapi.com/GI/flat/64.png', flagSm: 'https://flagsapi.com/GI/flat/32.png' },
  { code: 'GL', nameEn: 'Greenland', nameEs: 'Groenlandia', language: 'kl', languageName: 'Kalaallisut', currency: 'DKK', flag: 'https://flagsapi.com/GL/flat/64.png', flagSm: 'https://flagsapi.com/GL/flat/32.png' },
  { code: 'GM', nameEn: 'Gambia', nameEs: 'Gambia', language: 'en', languageName: 'English', currency: 'GMD', flag: 'https://flagsapi.com/GM/flat/64.png', flagSm: 'https://flagsapi.com/GM/flat/32.png' },
  { code: 'GN', nameEn: 'Guinea', nameEs: 'Guinea', language: 'fr', languageName: 'Français', currency: 'GNF', flag: 'https://flagsapi.com/GN/flat/64.png', flagSm: 'https://flagsapi.com/GN/flat/32.png' },
  { code: 'GP', nameEn: 'Guadeloupe', nameEs: 'Guadalupe', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/GP/flat/64.png', flagSm: 'https://flagsapi.com/GP/flat/32.png' },
  { code: 'GQ', nameEn: 'Equatorial Guinea', nameEs: 'Guinea Ecuatorial', language: 'es', languageName: 'Español', currency: 'XAF', flag: 'https://flagsapi.com/GQ/flat/64.png', flagSm: 'https://flagsapi.com/GQ/flat/32.png' },
  { code: 'GR', nameEn: 'Greece', nameEs: 'Grecia', language: 'el', languageName: 'Ελληνικά', currency: 'EUR', flag: 'https://flagsapi.com/GR/flat/64.png', flagSm: 'https://flagsapi.com/GR/flat/32.png' },
  { code: 'GS', nameEn: 'South Georgia', nameEs: 'Georgia del Sur', language: 'en', languageName: 'English', currency: 'GBP', flag: 'https://flagsapi.com/GS/flat/64.png', flagSm: 'https://flagsapi.com/GS/flat/32.png' },
  { code: 'GT', nameEn: 'Guatemala', nameEs: 'Guatemala', language: 'es', languageName: 'Español', currency: 'GTQ', flag: 'https://flagsapi.com/GT/flat/64.png', flagSm: 'https://flagsapi.com/GT/flat/32.png' },
  { code: 'GU', nameEn: 'Guam', nameEs: 'Guam', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/GU/flat/64.png', flagSm: 'https://flagsapi.com/GU/flat/32.png' },
  { code: 'GW', nameEn: 'Guinea-Bissau', nameEs: 'Guinea-Bisáu', language: 'pt', languageName: 'Português', currency: 'XOF', flag: 'https://flagsapi.com/GW/flat/64.png', flagSm: 'https://flagsapi.com/GW/flat/32.png' },
  { code: 'GY', nameEn: 'Guyana', nameEs: 'Guyana', language: 'en', languageName: 'English', currency: 'GYD', flag: 'https://flagsapi.com/GY/flat/64.png', flagSm: 'https://flagsapi.com/GY/flat/32.png' },
  { code: 'HK', nameEn: 'Hong Kong', nameEs: 'Hong Kong', language: 'zh', languageName: '中文', currency: 'HKD', flag: 'https://flagsapi.com/HK/flat/64.png', flagSm: 'https://flagsapi.com/HK/flat/32.png' },
  { code: 'HM', nameEn: 'Heard Island', nameEs: 'Islas Heard y McDonald', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/HM/flat/64.png', flagSm: 'https://flagsapi.com/HM/flat/32.png' },
  { code: 'HN', nameEn: 'Honduras', nameEs: 'Honduras', language: 'es', languageName: 'Español', currency: 'HNL', flag: 'https://flagsapi.com/HN/flat/64.png', flagSm: 'https://flagsapi.com/HN/flat/32.png' },
  { code: 'HR', nameEn: 'Croatia', nameEs: 'Croacia', language: 'hr', languageName: 'Hrvatski', currency: 'EUR', flag: 'https://flagsapi.com/HR/flat/64.png', flagSm: 'https://flagsapi.com/HR/flat/32.png' },
  { code: 'HT', nameEn: 'Haiti', nameEs: 'Haití', language: 'ht', languageName: 'Kreyòl', currency: 'HTG', flag: 'https://flagsapi.com/HT/flat/64.png', flagSm: 'https://flagsapi.com/HT/flat/32.png' },
  { code: 'HU', nameEn: 'Hungary', nameEs: 'Hungría', language: 'hu', languageName: 'Magyar', currency: 'HUF', flag: 'https://flagsapi.com/HU/flat/64.png', flagSm: 'https://flagsapi.com/HU/flat/32.png' },
  { code: 'ID', nameEn: 'Indonesia', nameEs: 'Indonesia', language: 'id', languageName: 'Bahasa Indonesia', currency: 'IDR', flag: 'https://flagsapi.com/ID/flat/64.png', flagSm: 'https://flagsapi.com/ID/flat/32.png' },
  { code: 'IE', nameEn: 'Ireland', nameEs: 'Irlanda', language: 'en', languageName: 'English', currency: 'EUR', flag: 'https://flagsapi.com/IE/flat/64.png', flagSm: 'https://flagsapi.com/IE/flat/32.png' },
  { code: 'IL', nameEn: 'Israel', nameEs: 'Israel', language: 'he', languageName: 'עברית', currency: 'ILS', flag: 'https://flagsapi.com/IL/flat/64.png', flagSm: 'https://flagsapi.com/IL/flat/32.png' },
  { code: 'IM', nameEn: 'Isle of Man', nameEs: 'Isla de Man', language: 'en', languageName: 'English', currency: 'GBP', flag: 'https://flagsapi.com/IM/flat/64.png', flagSm: 'https://flagsapi.com/IM/flat/32.png' },
  { code: 'IN', nameEn: 'India', nameEs: 'India', language: 'hi', languageName: 'हिन्दी', currency: 'INR', flag: 'https://flagsapi.com/IN/flat/64.png', flagSm: 'https://flagsapi.com/IN/flat/32.png' },
  { code: 'IO', nameEn: 'British Indian Ocean Territory', nameEs: 'Territorio Británico del Océano Índico', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/IO/flat/64.png', flagSm: 'https://flagsapi.com/IO/flat/32.png' },
  { code: 'IQ', nameEn: 'Iraq', nameEs: 'Irak', language: 'ar', languageName: 'Árabe', currency: 'IQD', flag: 'https://flagsapi.com/IQ/flat/64.png', flagSm: 'https://flagsapi.com/IQ/flat/32.png' },
  { code: 'IR', nameEn: 'Iran', nameEs: 'Irán', language: 'fa', languageName: 'فارسی', currency: 'IRR', flag: 'https://flagsapi.com/IR/flat/64.png', flagSm: 'https://flagsapi.com/IR/flat/32.png' },
  { code: 'IS', nameEn: 'Iceland', nameEs: 'Islandia', language: 'is', languageName: 'Íslenska', currency: 'ISK', flag: 'https://flagsapi.com/IS/flat/64.png', flagSm: 'https://flagsapi.com/IS/flat/32.png' },
  { code: 'IT', nameEn: 'Italy', nameEs: 'Italia', language: 'it', languageName: 'Italiano', currency: 'EUR', flag: 'https://flagsapi.com/IT/flat/64.png', flagSm: 'https://flagsapi.com/IT/flat/32.png' },
  { code: 'JE', nameEn: 'Jersey', nameEs: 'Jersey', language: 'en', languageName: 'English', currency: 'GBP', flag: 'https://flagsapi.com/JE/flat/64.png', flagSm: 'https://flagsapi.com/JE/flat/32.png' },
  { code: 'JM', nameEn: 'Jamaica', nameEs: 'Jamaica', language: 'en', languageName: 'English', currency: 'JMD', flag: 'https://flagsapi.com/JM/flat/64.png', flagSm: 'https://flagsapi.com/JM/flat/32.png' },
  { code: 'JO', nameEn: 'Jordan', nameEs: 'Jordania', language: 'ar', languageName: 'Árabe', currency: 'JOD', flag: 'https://flagsapi.com/JO/flat/64.png', flagSm: 'https://flagsapi.com/JO/flat/32.png' },
  { code: 'JP', nameEn: 'Japan', nameEs: 'Japón', language: 'ja', languageName: '日本語', currency: 'JPY', flag: 'https://flagsapi.com/JP/flat/64.png', flagSm: 'https://flagsapi.com/JP/flat/32.png' },
  { code: 'KE', nameEn: 'Kenya', nameEs: 'Kenia', language: 'en', languageName: 'English', currency: 'KES', flag: 'https://flagsapi.com/KE/flat/64.png', flagSm: 'https://flagsapi.com/KE/flat/32.png' },
  { code: 'KG', nameEn: 'Kyrgyzstan', nameEs: 'Kirguistán', language: 'ky', languageName: 'Kirguís', currency: 'KGS', flag: 'https://flagsapi.com/KG/flat/64.png', flagSm: 'https://flagsapi.com/KG/flat/32.png' },
  { code: 'KH', nameEn: 'Cambodia', nameEs: 'Camboya', language: 'km', languageName: 'Jemer', currency: 'KHR', flag: 'https://flagsapi.com/KH/flat/64.png', flagSm: 'https://flagsapi.com/KH/flat/32.png' },
  { code: 'KI', nameEn: 'Kiribati', nameEs: 'Kiribati', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/KI/flat/64.png', flagSm: 'https://flagsapi.com/KI/flat/32.png' },
  { code: 'KM', nameEn: 'Comoros', nameEs: 'Comoras', language: 'ar', languageName: 'Árabe', currency: 'KMF', flag: 'https://flagsapi.com/KM/flat/64.png', flagSm: 'https://flagsapi.com/KM/flat/32.png' },
  { code: 'KN', nameEn: 'Saint Kitts and Nevis', nameEs: 'San Cristóbal y Nieves', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/KN/flat/64.png', flagSm: 'https://flagsapi.com/KN/flat/32.png' },
  { code: 'KP', nameEn: 'North Korea', nameEs: 'Corea del Norte', language: 'ko', languageName: '한국어', currency: 'KPW', flag: 'https://flagsapi.com/KP/flat/64.png', flagSm: 'https://flagsapi.com/KP/flat/32.png' },
  { code: 'KR', nameEn: 'South Korea', nameEs: 'Corea del Sur', language: 'ko', languageName: '한국어', currency: 'KRW', flag: 'https://flagsapi.com/KR/flat/64.png', flagSm: 'https://flagsapi.com/KR/flat/32.png' },
  { code: 'KW', nameEn: 'Kuwait', nameEs: 'Kuwait', language: 'ar', languageName: 'Árabe', currency: 'KWD', flag: 'https://flagsapi.com/KW/flat/64.png', flagSm: 'https://flagsapi.com/KW/flat/32.png' },
  { code: 'KY', nameEn: 'Cayman Islands', nameEs: 'Islas Caimán', language: 'en', languageName: 'English', currency: 'KYD', flag: 'https://flagsapi.com/KY/flat/64.png', flagSm: 'https://flagsapi.com/KY/flat/32.png' },
  { code: 'KZ', nameEn: 'Kazakhstan', nameEs: 'Kazajistán', language: 'kk', languageName: 'Kazajo', currency: 'KZT', flag: 'https://flagsapi.com/KZ/flat/64.png', flagSm: 'https://flagsapi.com/KZ/flat/32.png' },
  { code: 'LA', nameEn: 'Laos', nameEs: 'Laos', language: 'lo', languageName: 'Lao', currency: 'LAK', flag: 'https://flagsapi.com/LA/flat/64.png', flagSm: 'https://flagsapi.com/LA/flat/32.png' },
  { code: 'LB', nameEn: 'Lebanon', nameEs: 'Líbano', language: 'ar', languageName: 'Árabe', currency: 'LBP', flag: 'https://flagsapi.com/LB/flat/64.png', flagSm: 'https://flagsapi.com/LB/flat/32.png' },
  { code: 'LC', nameEn: 'Saint Lucia', nameEs: 'Santa Lucía', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/LC/flat/64.png', flagSm: 'https://flagsapi.com/LC/flat/32.png' },
  { code: 'LI', nameEn: 'Liechtenstein', nameEs: 'Liechtenstein', language: 'de', languageName: 'Deutsch', currency: 'CHF', flag: 'https://flagsapi.com/LI/flat/64.png', flagSm: 'https://flagsapi.com/LI/flat/32.png' },
  { code: 'LK', nameEn: 'Sri Lanka', nameEs: 'Sri Lanka', language: 'si', languageName: 'Cingalés', currency: 'LKR', flag: 'https://flagsapi.com/LK/flat/64.png', flagSm: 'https://flagsapi.com/LK/flat/32.png' },
  { code: 'LR', nameEn: 'Liberia', nameEs: 'Liberia', language: 'en', languageName: 'English', currency: 'LRD', flag: 'https://flagsapi.com/LR/flat/64.png', flagSm: 'https://flagsapi.com/LR/flat/32.png' },
  { code: 'LS', nameEn: 'Lesotho', nameEs: 'Lesoto', language: 'en', languageName: 'English', currency: 'LSL', flag: 'https://flagsapi.com/LS/flat/64.png', flagSm: 'https://flagsapi.com/LS/flat/32.png' },
  { code: 'LT', nameEn: 'Lithuania', nameEs: 'Lituania', language: 'lt', languageName: 'Lietuvių', currency: 'EUR', flag: 'https://flagsapi.com/LT/flat/64.png', flagSm: 'https://flagsapi.com/LT/flat/32.png' },
  { code: 'LU', nameEn: 'Luxembourg', nameEs: 'Luxemburgo', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/LU/flat/64.png', flagSm: 'https://flagsapi.com/LU/flat/32.png' },
  { code: 'LV', nameEn: 'Latvia', nameEs: 'Letonia', language: 'lv', languageName: 'Latviešu', currency: 'EUR', flag: 'https://flagsapi.com/LV/flat/64.png', flagSm: 'https://flagsapi.com/LV/flat/32.png' },
  { code: 'LY', nameEn: 'Libya', nameEs: 'Libia', language: 'ar', languageName: 'Árabe', currency: 'LYD', flag: 'https://flagsapi.com/LY/flat/64.png', flagSm: 'https://flagsapi.com/LY/flat/32.png' },
  { code: 'MA', nameEn: 'Morocco', nameEs: 'Marruecos', language: 'ar', languageName: 'Árabe', currency: 'MAD', flag: 'https://flagsapi.com/MA/flat/64.png', flagSm: 'https://flagsapi.com/MA/flat/32.png' },
  { code: 'MC', nameEn: 'Monaco', nameEs: 'Mónaco', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/MC/flat/64.png', flagSm: 'https://flagsapi.com/MC/flat/32.png' },
  { code: 'MD', nameEn: 'Moldova', nameEs: 'Moldavia', language: 'ro', languageName: 'Română', currency: 'MDL', flag: 'https://flagsapi.com/MD/flat/64.png', flagSm: 'https://flagsapi.com/MD/flat/32.png' },
  { code: 'ME', nameEn: 'Montenegro', nameEs: 'Montenegro', language: 'sr', languageName: 'Српски', currency: 'EUR', flag: 'https://flagsapi.com/ME/flat/64.png', flagSm: 'https://flagsapi.com/ME/flat/32.png' },
  { code: 'MF', nameEn: 'Saint Martin', nameEs: 'San Martín', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/MF/flat/64.png', flagSm: 'https://flagsapi.com/MF/flat/32.png' },
  { code: 'MG', nameEn: 'Madagascar', nameEs: 'Madagascar', language: 'fr', languageName: 'Français', currency: 'MGA', flag: 'https://flagsapi.com/MG/flat/64.png', flagSm: 'https://flagsapi.com/MG/flat/32.png' },
  { code: 'MH', nameEn: 'Marshall Islands', nameEs: 'Islas Marshall', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/MH/flat/64.png', flagSm: 'https://flagsapi.com/MH/flat/32.png' },
  { code: 'MK', nameEn: 'North Macedonia', nameEs: 'Macedonia del Norte', language: 'mk', languageName: 'Macedonio', currency: 'MKD', flag: 'https://flagsapi.com/MK/flat/64.png', flagSm: 'https://flagsapi.com/MK/flat/32.png' },
  { code: 'ML', nameEn: 'Mali', nameEs: 'Malí', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/ML/flat/64.png', flagSm: 'https://flagsapi.com/ML/flat/32.png' },
  { code: 'MM', nameEn: 'Myanmar', nameEs: 'Myanmar', language: 'my', languageName: 'Birmano', currency: 'MMK', flag: 'https://flagsapi.com/MM/flat/64.png', flagSm: 'https://flagsapi.com/MM/flat/32.png' },
  { code: 'MN', nameEn: 'Mongolia', nameEs: 'Mongolia', language: 'mn', languageName: 'Mongol', currency: 'MNT', flag: 'https://flagsapi.com/MN/flat/64.png', flagSm: 'https://flagsapi.com/MN/flat/32.png' },
  { code: 'MO', nameEn: 'Macao', nameEs: 'Macao', language: 'zh', languageName: '中文', currency: 'MOP', flag: 'https://flagsapi.com/MO/flat/64.png', flagSm: 'https://flagsapi.com/MO/flat/32.png' },
  { code: 'MP', nameEn: 'Northern Mariana Islands', nameEs: 'Islas Marianas del Norte', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/MP/flat/64.png', flagSm: 'https://flagsapi.com/MP/flat/32.png' },
  { code: 'MQ', nameEn: 'Martinique', nameEs: 'Martinica', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/MQ/flat/64.png', flagSm: 'https://flagsapi.com/MQ/flat/32.png' },
  { code: 'MR', nameEn: 'Mauritania', nameEs: 'Mauritania', language: 'ar', languageName: 'Árabe', currency: 'MRU', flag: 'https://flagsapi.com/MR/flat/64.png', flagSm: 'https://flagsapi.com/MR/flat/32.png' },
  { code: 'MS', nameEn: 'Montserrat', nameEs: 'Montserrat', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/MS/flat/64.png', flagSm: 'https://flagsapi.com/MS/flat/32.png' },
  { code: 'MT', nameEn: 'Malta', nameEs: 'Malta', language: 'en', languageName: 'English', currency: 'EUR', flag: 'https://flagsapi.com/MT/flat/64.png', flagSm: 'https://flagsapi.com/MT/flat/32.png' },
  { code: 'MU', nameEn: 'Mauritius', nameEs: 'Mauricio', language: 'en', languageName: 'English', currency: 'MUR', flag: 'https://flagsapi.com/MU/flat/64.png', flagSm: 'https://flagsapi.com/MU/flat/32.png' },
  { code: 'MV', nameEn: 'Maldives', nameEs: 'Maldivas', language: 'dv', languageName: 'Divehi', currency: 'MVR', flag: 'https://flagsapi.com/MV/flat/64.png', flagSm: 'https://flagsapi.com/MV/flat/32.png' },
  { code: 'MW', nameEn: 'Malawi', nameEs: 'Malaui', language: 'en', languageName: 'English', currency: 'MWK', flag: 'https://flagsapi.com/MW/flat/64.png', flagSm: 'https://flagsapi.com/MW/flat/32.png' },
  { code: 'MX', nameEn: 'Mexico', nameEs: 'México', language: 'es', languageName: 'Español', currency: 'MXN', flag: 'https://flagsapi.com/MX/flat/64.png', flagSm: 'https://flagsapi.com/MX/flat/32.png' },
  { code: 'MY', nameEn: 'Malaysia', nameEs: 'Malasia', language: 'ms', languageName: 'Malayo', currency: 'MYR', flag: 'https://flagsapi.com/MY/flat/64.png', flagSm: 'https://flagsapi.com/MY/flat/32.png' },
  { code: 'MZ', nameEn: 'Mozambique', nameEs: 'Mozambique', language: 'pt', languageName: 'Português', currency: 'MZN', flag: 'https://flagsapi.com/MZ/flat/64.png', flagSm: 'https://flagsapi.com/MZ/flat/32.png' },
  { code: 'NA', nameEn: 'Namibia', nameEs: 'Namibia', language: 'en', languageName: 'English', currency: 'NAD', flag: 'https://flagsapi.com/NA/flat/64.png', flagSm: 'https://flagsapi.com/NA/flat/32.png' },
  { code: 'NC', nameEn: 'New Caledonia', nameEs: 'Nueva Caledonia', language: 'fr', languageName: 'Français', currency: 'XPF', flag: 'https://flagsapi.com/NC/flat/64.png', flagSm: 'https://flagsapi.com/NC/flat/32.png' },
  { code: 'NE', nameEn: 'Niger', nameEs: 'Níger', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/NE/flat/64.png', flagSm: 'https://flagsapi.com/NE/flat/32.png' },
  { code: 'NF', nameEn: 'Norfolk Island', nameEs: 'Isla Norfolk', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/NF/flat/64.png', flagSm: 'https://flagsapi.com/NF/flat/32.png' },
  { code: 'NG', nameEn: 'Nigeria', nameEs: 'Nigeria', language: 'en', languageName: 'English', currency: 'NGN', flag: 'https://flagsapi.com/NG/flat/64.png', flagSm: 'https://flagsapi.com/NG/flat/32.png' },
  { code: 'NI', nameEn: 'Nicaragua', nameEs: 'Nicaragua', language: 'es', languageName: 'Español', currency: 'NIO', flag: 'https://flagsapi.com/NI/flat/64.png', flagSm: 'https://flagsapi.com/NI/flat/32.png' },
  { code: 'NL', nameEn: 'Netherlands', nameEs: 'Países Bajos', language: 'nl', languageName: 'Nederlands', currency: 'EUR', flag: 'https://flagsapi.com/NL/flat/64.png', flagSm: 'https://flagsapi.com/NL/flat/32.png' },
  { code: 'NO', nameEn: 'Norway', nameEs: 'Noruega', language: 'no', languageName: 'Norsk', currency: 'NOK', flag: 'https://flagsapi.com/NO/flat/64.png', flagSm: 'https://flagsapi.com/NO/flat/32.png' },
  { code: 'NP', nameEn: 'Nepal', nameEs: 'Nepal', language: 'ne', languageName: 'Nepalí', currency: 'NPR', flag: 'https://flagsapi.com/NP/flat/64.png', flagSm: 'https://flagsapi.com/NP/flat/32.png' },
  { code: 'NR', nameEn: 'Nauru', nameEs: 'Nauru', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/NR/flat/64.png', flagSm: 'https://flagsapi.com/NR/flat/32.png' },
  { code: 'NU', nameEn: 'Niue', nameEs: 'Niue', language: 'en', languageName: 'English', currency: 'NZD', flag: 'https://flagsapi.com/NU/flat/64.png', flagSm: 'https://flagsapi.com/NU/flat/32.png' },
  { code: 'NZ', nameEn: 'New Zealand', nameEs: 'Nueva Zelanda', language: 'en', languageName: 'English', currency: 'NZD', flag: 'https://flagsapi.com/NZ/flat/64.png', flagSm: 'https://flagsapi.com/NZ/flat/32.png' },
  { code: 'OM', nameEn: 'Oman', nameEs: 'Omán', language: 'ar', languageName: 'Árabe', currency: 'OMR', flag: 'https://flagsapi.com/OM/flat/64.png', flagSm: 'https://flagsapi.com/OM/flat/32.png' },
  { code: 'PA', nameEn: 'Panama', nameEs: 'Panamá', language: 'es', languageName: 'Español', currency: 'PAB', flag: 'https://flagsapi.com/PA/flat/64.png', flagSm: 'https://flagsapi.com/PA/flat/32.png' },
  { code: 'PE', nameEn: 'Peru', nameEs: 'Perú', language: 'es', languageName: 'Español', currency: 'PEN', flag: 'https://flagsapi.com/PE/flat/64.png', flagSm: 'https://flagsapi.com/PE/flat/32.png' },
  { code: 'PF', nameEn: 'French Polynesia', nameEs: 'Polinesia Francesa', language: 'fr', languageName: 'Français', currency: 'XPF', flag: 'https://flagsapi.com/PF/flat/64.png', flagSm: 'https://flagsapi.com/PF/flat/32.png' },
  { code: 'PG', nameEn: 'Papua New Guinea', nameEs: 'Papúa Nueva Guinea', language: 'en', languageName: 'English', currency: 'PGK', flag: 'https://flagsapi.com/PG/flat/64.png', flagSm: 'https://flagsapi.com/PG/flat/32.png' },
  { code: 'PH', nameEn: 'Philippines', nameEs: 'Filipinas', language: 'en', languageName: 'English', currency: 'PHP', flag: 'https://flagsapi.com/PH/flat/64.png', flagSm: 'https://flagsapi.com/PH/flat/32.png' },
  { code: 'PK', nameEn: 'Pakistan', nameEs: 'Pakistán', language: 'ur', languageName: 'Urdu', currency: 'PKR', flag: 'https://flagsapi.com/PK/flat/64.png', flagSm: 'https://flagsapi.com/PK/flat/32.png' },
  { code: 'PL', nameEn: 'Poland', nameEs: 'Polonia', language: 'pl', languageName: 'Polski', currency: 'PLN', flag: 'https://flagsapi.com/PL/flat/64.png', flagSm: 'https://flagsapi.com/PL/flat/32.png' },
  { code: 'PM', nameEn: 'Saint Pierre and Miquelon', nameEs: 'San Pedro y Miquelón', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/PM/flat/64.png', flagSm: 'https://flagsapi.com/PM/flat/32.png' },
  { code: 'PN', nameEn: 'Pitcairn', nameEs: 'Pitcairn', language: 'en', languageName: 'English', currency: 'NZD', flag: 'https://flagsapi.com/PN/flat/64.png', flagSm: 'https://flagsapi.com/PN/flat/32.png' },
  { code: 'PR', nameEn: 'Puerto Rico', nameEs: 'Puerto Rico', language: 'es', languageName: 'Español', currency: 'USD', flag: 'https://flagsapi.com/PR/flat/64.png', flagSm: 'https://flagsapi.com/PR/flat/32.png' },
  { code: 'PS', nameEn: 'Palestine', nameEs: 'Palestina', language: 'ar', languageName: 'Árabe', currency: 'ILS', flag: 'https://flagsapi.com/PS/flat/64.png', flagSm: 'https://flagsapi.com/PS/flat/32.png' },
  { code: 'PT', nameEn: 'Portugal', nameEs: 'Portugal', language: 'pt', languageName: 'Português', currency: 'EUR', flag: 'https://flagsapi.com/PT/flat/64.png', flagSm: 'https://flagsapi.com/PT/flat/32.png' },
  { code: 'PW', nameEn: 'Palau', nameEs: 'Palaos', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/PW/flat/64.png', flagSm: 'https://flagsapi.com/PW/flat/32.png' },
  { code: 'PY', nameEn: 'Paraguay', nameEs: 'Paraguay', language: 'es', languageName: 'Español', currency: 'PYG', flag: 'https://flagsapi.com/PY/flat/64.png', flagSm: 'https://flagsapi.com/PY/flat/32.png' },
  { code: 'QA', nameEn: 'Qatar', nameEs: 'Catar', language: 'ar', languageName: 'Árabe', currency: 'QAR', flag: 'https://flagsapi.com/QA/flat/64.png', flagSm: 'https://flagsapi.com/QA/flat/32.png' },
  { code: 'RE', nameEn: 'Réunion', nameEs: 'Reunión', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/RE/flat/64.png', flagSm: 'https://flagsapi.com/RE/flat/32.png' },
  { code: 'RO', nameEn: 'Romania', nameEs: 'Rumanía', language: 'ro', languageName: 'Română', currency: 'RON', flag: 'https://flagsapi.com/RO/flat/64.png', flagSm: 'https://flagsapi.com/RO/flat/32.png' },
  { code: 'RS', nameEn: 'Serbia', nameEs: 'Serbia', language: 'sr', languageName: 'Српски', currency: 'RSD', flag: 'https://flagsapi.com/RS/flat/64.png', flagSm: 'https://flagsapi.com/RS/flat/32.png' },
  { code: 'RU', nameEn: 'Russia', nameEs: 'Rusia', language: 'ru', languageName: 'Русский', currency: 'RUB', flag: 'https://flagsapi.com/RU/flat/64.png', flagSm: 'https://flagsapi.com/RU/flat/32.png' },
  { code: 'RW', nameEn: 'Rwanda', nameEs: 'Ruanda', language: 'rw', languageName: 'Kinyarwanda', currency: 'RWF', flag: 'https://flagsapi.com/RW/flat/64.png', flagSm: 'https://flagsapi.com/RW/flat/32.png' },
  { code: 'SA', nameEn: 'Saudi Arabia', nameEs: 'Arabia Saudita', language: 'ar', languageName: 'Árabe', currency: 'SAR', flag: 'https://flagsapi.com/SA/flat/64.png', flagSm: 'https://flagsapi.com/SA/flat/32.png' },
  { code: 'SB', nameEn: 'Solomon Islands', nameEs: 'Islas Salomón', language: 'en', languageName: 'English', currency: 'SBD', flag: 'https://flagsapi.com/SB/flat/64.png', flagSm: 'https://flagsapi.com/SB/flat/32.png' },
  { code: 'SC', nameEn: 'Seychelles', nameEs: 'Seychelles', language: 'en', languageName: 'English', currency: 'SCR', flag: 'https://flagsapi.com/SC/flat/64.png', flagSm: 'https://flagsapi.com/SC/flat/32.png' },
  { code: 'SD', nameEn: 'Sudan', nameEs: 'Sudán', language: 'ar', languageName: 'Árabe', currency: 'SDG', flag: 'https://flagsapi.com/SD/flat/64.png', flagSm: 'https://flagsapi.com/SD/flat/32.png' },
  { code: 'SE', nameEn: 'Sweden', nameEs: 'Suecia', language: 'sv', languageName: 'Svenska', currency: 'SEK', flag: 'https://flagsapi.com/SE/flat/64.png', flagSm: 'https://flagsapi.com/SE/flat/32.png' },
  { code: 'SG', nameEn: 'Singapore', nameEs: 'Singapur', language: 'en', languageName: 'English', currency: 'SGD', flag: 'https://flagsapi.com/SG/flat/64.png', flagSm: 'https://flagsapi.com/SG/flat/32.png' },
  { code: 'SH', nameEn: 'Saint Helena', nameEs: 'Santa Elena', language: 'en', languageName: 'English', currency: 'SHP', flag: 'https://flagsapi.com/SH/flat/64.png', flagSm: 'https://flagsapi.com/SH/flat/32.png' },
  { code: 'SI', nameEn: 'Slovenia', nameEs: 'Eslovenia', language: 'sl', languageName: 'Slovenščina', currency: 'EUR', flag: 'https://flagsapi.com/SI/flat/64.png', flagSm: 'https://flagsapi.com/SI/flat/32.png' },
  { code: 'SJ', nameEn: 'Svalbard and Jan Mayen', nameEs: 'Svalbard y Jan Mayen', language: 'no', languageName: 'Norsk', currency: 'NOK', flag: 'https://flagsapi.com/SJ/flat/64.png', flagSm: 'https://flagsapi.com/SJ/flat/32.png' },
  { code: 'SK', nameEn: 'Slovakia', nameEs: 'Eslovaquia', language: 'sk', languageName: 'Slovenčina', currency: 'EUR', flag: 'https://flagsapi.com/SK/flat/64.png', flagSm: 'https://flagsapi.com/SK/flat/32.png' },
  { code: 'SL', nameEn: 'Sierra Leone', nameEs: 'Sierra Leona', language: 'en', languageName: 'English', currency: 'SLE', flag: 'https://flagsapi.com/SL/flat/64.png', flagSm: 'https://flagsapi.com/SL/flat/32.png' },
  { code: 'SM', nameEn: 'San Marino', nameEs: 'San Marino', language: 'it', languageName: 'Italiano', currency: 'EUR', flag: 'https://flagsapi.com/SM/flat/64.png', flagSm: 'https://flagsapi.com/SM/flat/32.png' },
  { code: 'SN', nameEn: 'Senegal', nameEs: 'Senegal', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/SN/flat/64.png', flagSm: 'https://flagsapi.com/SN/flat/32.png' },
  { code: 'SO', nameEn: 'Somalia', nameEs: 'Somalia', language: 'so', languageName: 'Somalí', currency: 'SOS', flag: 'https://flagsapi.com/SO/flat/64.png', flagSm: 'https://flagsapi.com/SO/flat/32.png' },
  { code: 'SR', nameEn: 'Suriname', nameEs: 'Surinam', language: 'nl', languageName: 'Nederlands', currency: 'SRD', flag: 'https://flagsapi.com/SR/flat/64.png', flagSm: 'https://flagsapi.com/SR/flat/32.png' },
  { code: 'SS', nameEn: 'South Sudan', nameEs: 'Sudán del Sur', language: 'en', languageName: 'English', currency: 'SSP', flag: 'https://flagsapi.com/SS/flat/64.png', flagSm: 'https://flagsapi.com/SS/flat/32.png' },
  { code: 'ST', nameEn: 'São Tomé and Príncipe', nameEs: 'Santo Tomé y Príncipe', language: 'pt', languageName: 'Português', currency: 'STN', flag: 'https://flagsapi.com/ST/flat/64.png', flagSm: 'https://flagsapi.com/ST/flat/32.png' },
  { code: 'SV', nameEn: 'El Salvador', nameEs: 'El Salvador', language: 'es', languageName: 'Español', currency: 'USD', flag: 'https://flagsapi.com/SV/flat/64.png', flagSm: 'https://flagsapi.com/SV/flat/32.png' },
  { code: 'SX', nameEn: 'Sint Maarten', nameEs: 'Sint Maarten', language: 'nl', languageName: 'Nederlands', currency: 'ANG', flag: 'https://flagsapi.com/SX/flat/64.png', flagSm: 'https://flagsapi.com/SX/flat/32.png' },
  { code: 'SY', nameEn: 'Syria', nameEs: 'Siria', language: 'ar', languageName: 'Árabe', currency: 'SYP', flag: 'https://flagsapi.com/SY/flat/64.png', flagSm: 'https://flagsapi.com/SY/flat/32.png' },
  { code: 'SZ', nameEn: 'Eswatini', nameEs: 'Esuatini', language: 'en', languageName: 'English', currency: 'SZL', flag: 'https://flagsapi.com/SZ/flat/64.png', flagSm: 'https://flagsapi.com/SZ/flat/32.png' },
  { code: 'TC', nameEn: 'Turks and Caicos Islands', nameEs: 'Islas Turcas y Caicos', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/TC/flat/64.png', flagSm: 'https://flagsapi.com/TC/flat/32.png' },
  { code: 'TD', nameEn: 'Chad', nameEs: 'Chad', language: 'fr', languageName: 'Français', currency: 'XAF', flag: 'https://flagsapi.com/TD/flat/64.png', flagSm: 'https://flagsapi.com/TD/flat/32.png' },
  { code: 'TF', nameEn: 'French Southern Territories', nameEs: 'Territorios Australes Franceses', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/TF/flat/64.png', flagSm: 'https://flagsapi.com/TF/flat/32.png' },
  { code: 'TG', nameEn: 'Togo', nameEs: 'Togo', language: 'fr', languageName: 'Français', currency: 'XOF', flag: 'https://flagsapi.com/TG/flat/64.png', flagSm: 'https://flagsapi.com/TG/flat/32.png' },
  { code: 'TH', nameEn: 'Thailand', nameEs: 'Tailandia', language: 'th', languageName: 'ไทย', currency: 'THB', flag: 'https://flagsapi.com/TH/flat/64.png', flagSm: 'https://flagsapi.com/TH/flat/32.png' },
  { code: 'TJ', nameEn: 'Tajikistan', nameEs: 'Tayikistán', language: 'tg', languageName: 'Tayiko', currency: 'TJS', flag: 'https://flagsapi.com/TJ/flat/64.png', flagSm: 'https://flagsapi.com/TJ/flat/32.png' },
  { code: 'TK', nameEn: 'Tokelau', nameEs: 'Tokelau', language: 'en', languageName: 'English', currency: 'NZD', flag: 'https://flagsapi.com/TK/flat/64.png', flagSm: 'https://flagsapi.com/TK/flat/32.png' },
  { code: 'TL', nameEn: 'Timor-Leste', nameEs: 'Timor Oriental', language: 'pt', languageName: 'Português', currency: 'USD', flag: 'https://flagsapi.com/TL/flat/64.png', flagSm: 'https://flagsapi.com/TL/flat/32.png' },
  { code: 'TM', nameEn: 'Turkmenistan', nameEs: 'Turkmenistán', language: 'tk', languageName: 'Turcomano', currency: 'TMT', flag: 'https://flagsapi.com/TM/flat/64.png', flagSm: 'https://flagsapi.com/TM/flat/32.png' },
  { code: 'TN', nameEn: 'Tunisia', nameEs: 'Túnez', language: 'ar', languageName: 'Árabe', currency: 'TND', flag: 'https://flagsapi.com/TN/flat/64.png', flagSm: 'https://flagsapi.com/TN/flat/32.png' },
  { code: 'TO', nameEn: 'Tonga', nameEs: 'Tonga', language: 'en', languageName: 'English', currency: 'TOP', flag: 'https://flagsapi.com/TO/flat/64.png', flagSm: 'https://flagsapi.com/TO/flat/32.png' },
  { code: 'TR', nameEn: 'Turkey', nameEs: 'Turquía', language: 'tr', languageName: 'Türkçe', currency: 'TRY', flag: 'https://flagsapi.com/TR/flat/64.png', flagSm: 'https://flagsapi.com/TR/flat/32.png' },
  { code: 'TT', nameEn: 'Trinidad and Tobago', nameEs: 'Trinidad y Tobago', language: 'en', languageName: 'English', currency: 'TTD', flag: 'https://flagsapi.com/TT/flat/64.png', flagSm: 'https://flagsapi.com/TT/flat/32.png' },
  { code: 'TV', nameEn: 'Tuvalu', nameEs: 'Tuvalu', language: 'en', languageName: 'English', currency: 'AUD', flag: 'https://flagsapi.com/TV/flat/64.png', flagSm: 'https://flagsapi.com/TV/flat/32.png' },
  { code: 'TW', nameEn: 'Taiwan', nameEs: 'Taiwán', language: 'zh', languageName: '中文', currency: 'TWD', flag: 'https://flagsapi.com/TW/flat/64.png', flagSm: 'https://flagsapi.com/TW/flat/32.png' },
  { code: 'TZ', nameEn: 'Tanzania', nameEs: 'Tanzania', language: 'sw', languageName: 'Swahili', currency: 'TZS', flag: 'https://flagsapi.com/TZ/flat/64.png', flagSm: 'https://flagsapi.com/TZ/flat/32.png' },
  { code: 'UA', nameEn: 'Ukraine', nameEs: 'Ucrania', language: 'uk', languageName: 'Українська', currency: 'UAH', flag: 'https://flagsapi.com/UA/flat/64.png', flagSm: 'https://flagsapi.com/UA/flat/32.png' },
  { code: 'UG', nameEn: 'Uganda', nameEs: 'Uganda', language: 'en', languageName: 'English', currency: 'UGX', flag: 'https://flagsapi.com/UG/flat/64.png', flagSm: 'https://flagsapi.com/UG/flat/32.png' },
  { code: 'UM', nameEn: 'U.S. Outlying Islands', nameEs: 'Islas Ultramarinas de EE.UU.', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/UM/flat/64.png', flagSm: 'https://flagsapi.com/UM/flat/32.png' },
  { code: 'US', nameEn: 'United States', nameEs: 'Estados Unidos', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/US/flat/64.png', flagSm: 'https://flagsapi.com/US/flat/32.png' },
  { code: 'UY', nameEn: 'Uruguay', nameEs: 'Uruguay', language: 'es', languageName: 'Español', currency: 'UYU', flag: 'https://flagsapi.com/UY/flat/64.png', flagSm: 'https://flagsapi.com/UY/flat/32.png' },
  { code: 'UZ', nameEn: 'Uzbekistan', nameEs: 'Uzbekistán', language: 'uz', languageName: 'Uzbeko', currency: 'UZS', flag: 'https://flagsapi.com/UZ/flat/64.png', flagSm: 'https://flagsapi.com/UZ/flat/32.png' },
  { code: 'VA', nameEn: 'Vatican City', nameEs: 'Ciudad del Vaticano', language: 'it', languageName: 'Italiano', currency: 'EUR', flag: 'https://flagsapi.com/VA/flat/64.png', flagSm: 'https://flagsapi.com/VA/flat/32.png' },
  { code: 'VC', nameEn: 'Saint Vincent and the Grenadines', nameEs: 'San Vicente y las Granadinas', language: 'en', languageName: 'English', currency: 'XCD', flag: 'https://flagsapi.com/VC/flat/64.png', flagSm: 'https://flagsapi.com/VC/flat/32.png' },
  { code: 'VE', nameEn: 'Venezuela', nameEs: 'Venezuela', language: 'es', languageName: 'Español', currency: 'VES', flag: 'https://flagsapi.com/VE/flat/64.png', flagSm: 'https://flagsapi.com/VE/flat/32.png' },
  { code: 'VG', nameEn: 'British Virgin Islands', nameEs: 'Islas Vírgenes Británicas', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/VG/flat/64.png', flagSm: 'https://flagsapi.com/VG/flat/32.png' },
  { code: 'VI', nameEn: 'U.S. Virgin Islands', nameEs: 'Islas Vírgenes de EE.UU.', language: 'en', languageName: 'English', currency: 'USD', flag: 'https://flagsapi.com/VI/flat/64.png', flagSm: 'https://flagsapi.com/VI/flat/32.png' },
  { code: 'VN', nameEn: 'Vietnam', nameEs: 'Vietnam', language: 'vi', languageName: 'Tiếng Việt', currency: 'VND', flag: 'https://flagsapi.com/VN/flat/64.png', flagSm: 'https://flagsapi.com/VN/flat/32.png' },
  { code: 'VU', nameEn: 'Vanuatu', nameEs: 'Vanuatu', language: 'bi', languageName: 'Bislama', currency: 'VUV', flag: 'https://flagsapi.com/VU/flat/64.png', flagSm: 'https://flagsapi.com/VU/flat/32.png' },
  { code: 'WF', nameEn: 'Wallis and Futuna', nameEs: 'Wallis y Futuna', language: 'fr', languageName: 'Français', currency: 'XPF', flag: 'https://flagsapi.com/WF/flat/64.png', flagSm: 'https://flagsapi.com/WF/flat/32.png' },
  { code: 'WS', nameEn: 'Samoa', nameEs: 'Samoa', language: 'sm', languageName: 'Samoano', currency: 'WST', flag: 'https://flagsapi.com/WS/flat/64.png', flagSm: 'https://flagsapi.com/WS/flat/32.png' },
  { code: 'XK', nameEn: 'Kosovo', nameEs: 'Kosovo', language: 'sq', languageName: 'Albanés', currency: 'EUR', flag: 'https://flagsapi.com/XK/flat/64.png', flagSm: 'https://flagsapi.com/XK/flat/32.png' },
  { code: 'YE', nameEn: 'Yemen', nameEs: 'Yemen', language: 'ar', languageName: 'Árabe', currency: 'YER', flag: 'https://flagsapi.com/YE/flat/64.png', flagSm: 'https://flagsapi.com/YE/flat/32.png' },
  { code: 'YT', nameEn: 'Mayotte', nameEs: 'Mayotte', language: 'fr', languageName: 'Français', currency: 'EUR', flag: 'https://flagsapi.com/YT/flat/64.png', flagSm: 'https://flagsapi.com/YT/flat/32.png' },
  { code: 'ZA', nameEn: 'South Africa', nameEs: 'Sudáfrica', language: 'en', languageName: 'English', currency: 'ZAR', flag: 'https://flagsapi.com/ZA/flat/64.png', flagSm: 'https://flagsapi.com/ZA/flat/32.png' },
  { code: 'ZM', nameEn: 'Zambia', nameEs: 'Zambia', language: 'en', languageName: 'English', currency: 'ZMW', flag: 'https://flagsapi.com/ZM/flat/64.png', flagSm: 'https://flagsapi.com/ZM/flat/32.png' },
  { code: 'ZW', nameEn: 'Zimbabwe', nameEs: 'Zimbabue', language: 'en', languageName: 'English', currency: 'ZWL', flag: 'https://flagsapi.com/ZW/flat/64.png', flagSm: 'https://flagsapi.com/ZW/flat/32.png' }
];

const byCode = new Map(WORLD_COUNTRIES.map((c) => [c.code, c]));


/** Map country ISO2 -> primary language code for Google Maps / UI helpers */
export const COUNTRY_LANGUAGE: Record<string, string> = Object.fromEntries(
  WORLD_COUNTRIES.map((c) => [c.code, c.language || 'en'])
);

export function getCountry(code?: string | null): WorldCountry | undefined {
  if (!code) return undefined;
  return byCode.get(String(code).toUpperCase());
}

export function getCountryFlag(code?: string | null, style: 'flat' | 'shiny' = 'flat', size: 16 | 24 | 32 | 48 | 64 = 32): string {
  const cc = String(code || '').toUpperCase();
  if (!cc || cc.length !== 2) return FLAG_API.url('UN', style, size);
  return FLAG_API.url(cc, style, size);
}

export function getCountryName(code?: string | null, lang: 'es' | 'en' = 'es'): string {
  const c = getCountry(code);
  if (!c) return String(code || '');
  return lang === 'en' ? c.nameEn : c.nameEs;
}

export function getCountriesSorted(lang: 'es' | 'en' = 'es'): WorldCountry[] {
  const pri = new Set(PRIORITY_COUNTRY_CODES as readonly string[]);
  const name = (c: WorldCountry) => (lang === 'en' ? c.nameEn : c.nameEs);
  const priority = WORLD_COUNTRIES.filter((c) => pri.has(c.code)).sort(
    (a, b) => (PRIORITY_COUNTRY_CODES as readonly string[]).indexOf(a.code) - (PRIORITY_COUNTRY_CODES as readonly string[]).indexOf(b.code)
  );
  const rest = WORLD_COUNTRIES.filter((c) => !pri.has(c.code)).sort((a, b) => name(a).localeCompare(name(b), lang));
  return [...priority, ...rest];
}

export const LANGUAGE_FLAG_COUNTRY: Record<string, string> = {
  es: 'ES', 'es-ES': 'ES', 'es-DO': 'DO', 'es-CO': 'CO', 'es-EC': 'EC', 'es-MX': 'MX', 'es-AR': 'AR', 'es-CL': 'CL', 'es-PE': 'PE',
  en: 'GB', 'en-US': 'US', 'en-GB': 'GB',
  it: 'IT', fr: 'FR', de: 'DE', zh: 'CN', ht: 'HT', pt: 'PT', 'pt-BR': 'BR', nl: 'NL', ar: 'SA', ja: 'JP', ko: 'KR', ru: 'RU', pl: 'PL', tr: 'TR', hi: 'IN',
};

export function languageFlagUrl(langCode: string, style: 'flat' | 'shiny' = 'flat', size: 16 | 24 | 32 | 48 | 64 = 24): string {
  const key = String(langCode || '').trim();
  const country = LANGUAGE_FLAG_COUNTRY[key] || LANGUAGE_FLAG_COUNTRY[key.slice(0, 2)] || 'UN';
  return FLAG_API.url(country, style, size);
}
