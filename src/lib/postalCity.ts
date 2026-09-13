/** Resolve city name from postal code using local shipping index */
export type PostalCity = { city: string; postalCode: string; region?: string };

export const CITY_POSTAL_INDEX: Record<string, PostalCity[]> = {
  ES: [
    { city: 'Madrid', postalCode: '28001' },
    { city: 'Madrid', postalCode: '28002' },
    { city: 'Madrid', postalCode: '28003' },
    { city: 'Madrid', postalCode: '28004' },
    { city: 'Madrid', postalCode: '28005' },
    { city: 'Barcelona', postalCode: '08001' },
    { city: 'Barcelona', postalCode: '08002' },
    { city: 'Barcelona', postalCode: '08003' },
    { city: 'Valencia', postalCode: '46001' },
    { city: 'Sevilla', postalCode: '41001' },
    { city: 'Zaragoza', postalCode: '50001' },
    { city: 'Málaga', postalCode: '29001' },
    { city: 'Alicante', postalCode: '03001' },
  ],
  IT: [
    { city: 'Roma', postalCode: '00118' },
    { city: 'Roma', postalCode: '00184' },
    { city: 'Milano', postalCode: '20121' },
    { city: 'Napoli', postalCode: '80121' },
    { city: 'Torino', postalCode: '10121' },
    { city: 'Firenze', postalCode: '50121' },
    { city: 'Bologna', postalCode: '40121' },
    { city: 'Palermo', postalCode: '90121' },
    { city: 'Venezia', postalCode: '30100' },
  ],
  FR: [
    { city: 'Paris', postalCode: '75001' },
    { city: 'Paris', postalCode: '75008' },
    { city: 'Paris', postalCode: '75015' },
    { city: 'Lyon', postalCode: '69001' },
    { city: 'Marseille', postalCode: '13001' },
    { city: 'Toulouse', postalCode: '31000' },
    { city: 'Nice', postalCode: '06000' },
    { city: 'Bordeaux', postalCode: '33000' },
  ],
  DE: [
    { city: 'Berlin', postalCode: '10115' },
    { city: 'Berlin', postalCode: '10117' },
    { city: 'Hamburg', postalCode: '20095' },
    { city: 'München', postalCode: '80331' },
    { city: 'Köln', postalCode: '50667' },
    { city: 'Frankfurt am Main', postalCode: '60311' },
    { city: 'Düsseldorf', postalCode: '40210' },
  ],
  PT: [
    { city: 'Lisboa', postalCode: '1100-001' },
    { city: 'Porto', postalCode: '4000-007' },
    { city: 'Braga', postalCode: '4700-001' },
    { city: 'Coimbra', postalCode: '3000-001' },
  ],
  GB: [
    { city: 'London', postalCode: 'E1W 1BD' },
    { city: 'London', postalCode: 'SW1A 1AA' },
    { city: 'Manchester', postalCode: 'M1 1AE' },
    { city: 'Birmingham', postalCode: 'B1 1AA' },
    { city: 'Liverpool', postalCode: 'L1 8JQ' },
  ],
  US: [
    { city: 'Miami', postalCode: '33101' },
    { city: 'New York', postalCode: '10001' },
    { city: 'Los Angeles', postalCode: '90001' },
    { city: 'Chicago', postalCode: '60601' },
    { city: 'Houston', postalCode: '77002' },
  ],
  DO: [
    { city: 'Santo Domingo', postalCode: '10100' },
    { city: 'Santiago', postalCode: '51000' },
    { city: 'Punta Cana', postalCode: '23000' },
    { city: 'Bávaro', postalCode: '23301' },
    { city: 'Baní', postalCode: '94000' },
    { city: 'La Romana', postalCode: '22000' },
  ],
  MX: [
    { city: 'Ciudad de México', postalCode: '06000' },
    { city: 'Guadalajara', postalCode: '44100' },
    { city: 'Monterrey', postalCode: '64000' },
    { city: 'Cancún', postalCode: '77500' },
  ],
  CO: [
    { city: 'Bogotá', postalCode: '110111' },
    { city: 'Medellín', postalCode: '050001' },
    { city: 'Cali', postalCode: '760001' },
    { city: 'Barranquilla', postalCode: '080001' },
  ],
  AR: [
    { city: 'Buenos Aires', postalCode: 'C1000' },
    { city: 'Córdoba', postalCode: 'X5000' },
    { city: 'Rosario', postalCode: 'S2000' },
  ],
  CL: [
    { city: 'Santiago', postalCode: '8320000' },
    { city: 'Valparaíso', postalCode: '2340000' },
    { city: 'Concepción', postalCode: '4030000' },
  ],
  BR: [
    { city: 'São Paulo', postalCode: '01000-000' },
    { city: 'Rio de Janeiro', postalCode: '20000-000' },
    { city: 'Brasília', postalCode: '70000-000' },
  ],
  NL: [
    { city: 'Amsterdam', postalCode: '1011' },
    { city: 'Rotterdam', postalCode: '3011' },
    { city: 'Utrecht', postalCode: '3511' },
  ],
  BE: [
    { city: 'Bruxelles', postalCode: '1000' },
    { city: 'Antwerpen', postalCode: '2000' },
    { city: 'Gent', postalCode: '9000' },
  ],
} as any;

export function resolveCityFromPostal(countryCode?: string | null, postalCode?: string | null): string {
  const country = String(countryCode || '').toUpperCase().slice(0, 2);
  const zip = String(postalCode || '').replace(/\s+/g, '').trim();
  if (!country || !zip) return '';
  const rows = CITY_POSTAL_INDEX[country] || [];
  const exact = rows.find((r) => String(r.postalCode || '').replace(/\s+/g, '') === zip);
  if (exact?.city) return exact.city;
  if (country === 'IT') {
    const z5 = zip.padStart(5, '0').slice(0, 5);
    const by5 = rows.find((r) => String(r.postalCode || '').replace(/\s+/g, '').padStart(5, '0').slice(0, 5) === z5);
    if (by5?.city) return by5.city;
    const pref = z5.slice(0, 2);
    const byPref = rows.find((r) => String(r.postalCode || '').replace(/\s+/g, '').startsWith(pref));
    if (byPref?.city) return byPref.city;
  }
  const partial = rows.find((r) => {
    const pc = String(r.postalCode || '').replace(/\s+/g, '');
    return pc.startsWith(zip) || zip.startsWith(pc);
  });
  return partial?.city || '';
}

/** Infer Italian city from CAP ranges (first 3 digits / known prefixes). */
export function inferItalianCityFromCap(postalCode?: string | null): string {
  const zip = String(postalCode || '').replace(/\s+/g, '').replace(/\D/g, '');
  if (!zip) return '';
  const z = zip.padStart(5, '0').slice(0, 5);
  const exact: Record<string, string> = {
    '00118': 'Roma', '00137': 'Roma', '00172': 'Roma', '00177': 'Roma', '00184': 'Roma',
    '00185': 'Roma', '00186': 'Roma', '00187': 'Roma', '00192': 'Roma',
    '20121': 'Milano', '20122': 'Milano', '20123': 'Milano', '20124': 'Milano', '20125': 'Milano',
    '10121': 'Torino', '10122': 'Torino', '80121': 'Napoli', '80122': 'Napoli',
    '50121': 'Firenze', '50122': 'Firenze', '40121': 'Bologna', '40122': 'Bologna',
    '30100': 'Venezia', '30121': 'Venezia', '16121': 'Genova', '90121': 'Palermo',
    '09124': 'Cagliari', '70121': 'Bari', '35121': 'Padova', '37121': 'Verona',
    '41121': 'Modena', '42121': 'Reggio Emilia', '43121': 'Parma', '47921': 'Rimini',
    '60121': 'Ancona', '65121': 'Pescara', '71121': 'Foggia', '72100': 'Brindisi',
    '73100': 'Lecce', '74121': 'Taranto', '89100': 'Reggio Calabria', '95121': 'Catania',
    '98121': 'Messina', '06121': 'Perugia', '07100': 'Sassari', '08100': 'Nuoro',
  };
  if (exact[z]) return exact[z];
  const p3 = z.slice(0, 3);
  const by3: Record<string, string> = {
    '001': 'Roma', '000': 'Roma', '201': 'Milano', '200': 'Milano',
    '101': 'Torino', '100': 'Torino', '801': 'Napoli', '800': 'Napoli',
    '501': 'Firenze', '500': 'Firenze', '401': 'Bologna', '400': 'Bologna',
    '301': 'Venezia', '300': 'Venezia', '161': 'Genova', '160': 'Genova',
    '901': 'Palermo', '900': 'Palermo', '091': 'Cagliari', '090': 'Cagliari',
    '701': 'Bari', '700': 'Bari', '351': 'Padova', '350': 'Padova',
    '371': 'Verona', '370': 'Verona', '411': 'Modena', '421': 'Reggio Emilia',
    '431': 'Parma', '479': 'Rimini', '601': 'Ancona', '651': 'Pescara',
    '711': 'Foggia', '721': 'Brindisi', '731': 'Lecce', '741': 'Taranto',
    '891': 'Reggio Calabria', '951': 'Catania', '981': 'Messina',
    '061': 'Perugia', '071': 'Sassari', '081': 'Nuoro',
    '341': 'Trieste', '331': 'Udine', '311': 'Treviso', '241': 'Bergamo',
    '251': 'Brescia', '221': 'Como', '271': 'Pavia', '291': 'Piacenza',
    '531': 'Siena', '521': 'Arezzo', '551': 'Lucca', '561': 'Pisa', '571': 'Livorno',
    '611': 'Pesaro', '621': 'Macerata', '631': 'Ascoli Piceno',
    '641': 'Teramo', '841': 'Salerno', '811': 'Caserta', '831': 'Avellino',
    '821': 'Benevento', '871': 'Cosenza', '881': 'Catanzaro',
    '911': 'Trapani', '921': 'Agrigento', '941': 'Enna', '971': 'Ragusa',
  };
  if (by3[p3]) return by3[p3];
  const p2 = z.slice(0, 2);
  const by2: Record<string, string> = {
    '00': 'Roma', '20': 'Milano', '10': 'Torino', '80': 'Napoli', '50': 'Firenze',
    '40': 'Bologna', '30': 'Venezia', '16': 'Genova', '90': 'Palermo', '09': 'Cagliari', '70': 'Bari',
  };
  return by2[p2] || '';
}

export function resolveItalianCity(postalCode?: string | null, cityHint?: string | null): string {
  const hint = String(cityHint || '').trim();
  if (hint) return hint;
  const zip = String(postalCode || '').replace(/\s+/g, '').trim();
  if (!zip) return '';
  const fromIndex = resolveCityFromPostal('IT', zip);
  if (fromIndex) return fromIndex;
  return inferItalianCityFromCap(zip);
}

export function resolveCityForCountry(countryCode?: string | null, postalCode?: string | null, cityHint?: string | null): string {
  const hint = String(cityHint || '').trim();
  if (hint) return hint;
  const country = String(countryCode || '').toUpperCase().slice(0, 2);
  const zip = String(postalCode || '').replace(/\s+/g, '').trim();
  if (!country || !zip) return '';
  if (country === 'IT') return resolveItalianCity(zip, '');
  return resolveCityFromPostal(country, zip);
}
