import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Globe2,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  Truck,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBrand } from '../lib/brand';
import { useI18n } from '../lib/i18n';
import { getCountryName, WORLD_COUNTRIES } from '../lib/countries';
import { resolveCityForCountry, resolveCityFromPostal, resolveItalianCity } from '../lib/postalCity';
import { useCurrency } from '../lib/currency';

type Coverage = 'nacional' | 'internacional';
type WeightStop = 1 | 2 | 5 | 10 | 20;
type PackageLine = { width: number; height: number; length: number; weight: number };
type PackageDimensions = { width: number; height: number; length: number };
type TariffForm = { originCountry: string; originZip: string; originCity: string; destCountry: string; destZip: string; destCity: string; currency: string };
type PlanOption = {
  planId: string;
  planName: string;
  planPrice: number;
  planCurrency: string;
  discountPercent: number;
};
type MatrixRow = {
  key: string;
  originCountry: string;
  destCountry: string;
  courier: string;
  service: string;
  mode: string;
  modeKey: string;
  serviceKey: string;
  quotes: Partial<Record<WeightStop, any>>;
};

const WEIGHT_STOPS: WeightStop[] = [1, 2, 5, 10, 20];
const COUNTRY_PRIORITY = ['ES', 'IT', 'DO', 'DE', 'FR', 'PT', 'US', 'GB', 'CO', 'MX'];
const KNOWN_COURIERS = [
  ['correos express', 'Correos Express'], ['correos', 'Correos'], ['poste italiane', 'Poste Italiane'],
  ['poste delivery', 'Poste Italiane'], ['sda', 'SDA'], ['bartolini', 'BRT'], ['brt', 'BRT'],
  ['inpost', 'InPost'], ['dhl', 'DHL'], ['fedex', 'FedEx'], ['federal express', 'FedEx'],
  ['gls', 'GLS'], ['seur', 'SEUR'], ['nacex', 'NACEX'], ['ups', 'UPS'], ['tnt', 'TNT'],
  ['dpd', 'DPD'], ['mrw', 'MRW'], ['mondial relay', 'Mondial Relay'], ['chronopost', 'Chronopost'],
  ['colissimo', 'Colissimo'], ['evri', 'Evri'], ['hermes', 'Hermes'],
] as const;
// The API keeps the real active/connected check on the server. These are only
// the supported quote connectors used to render results progressively.
const PROGRESSIVE_QUOTE_PROVIDER_CODES = ['parcelabc', 'genei', 'paccofacile', 'spedirepro', 'spediamopro', 'easypost', 'logihub_intl'];

const COPY: Record<string, Record<string, string>> = {
  es: {
    title: 'Tarifas de envío', subtitle: 'Consulta precios reales por ruta, courier, servicio, peso y plan.', national: 'Nacional', international: 'Internacional', from: 'Desde', to: 'Hasta', country: 'País', postal: 'Código postal', city: 'Ciudad (opcional)', courier: 'Courier', allCouriers: 'Todos los couriers', service: 'Servicio', allServices: 'Todos los servicios', plan: 'Plan aplicado', routeHelp: 'Las tarifas se cargan automáticamente al completar la ruta.', search: 'Actualizar tarifas', loading: 'Cargando tarifas reales…', noRoute: 'Configura una ruta para ver tarifas', noRouteHelp: 'Escribe ambos códigos postales y las tarifas se cargarán automáticamente.', noResults: 'No hay tarifas para esta selección.', results: 'tarifas', origin: 'Origen', destination: 'Destino', mode: 'Modalidad', weight: 'Peso', additional: '+ kg adicional', live: 'Datos reales', lastQuery: 'Cargado', export: 'Descargar', csv: 'CSV', print: 'Imprimir / PDF', quote: 'Cotizar y generar etiqueta', activePlan: 'Plan activo', noIncrement: 'La API no devolvió recargo incremental', planHint: 'El precio mostrado incluye el descuento del plan seleccionado cuando la API lo proporciona.', error: 'No se pudieron cargar las tarifas.', partial: 'Algunas columnas de peso no respondieron y se muestran como no disponibles.', required: 'Completa ambos códigos postales.', standard: 'Servicio estándar', home: 'A domicilio', dropoff: 'Punto / oficina', economy: 'Económico', fast: 'Rápido', unknown: 'No disponible', currency: 'Moneda', route: 'Ruta', dataSource: 'Precios finales devueltos por los transportistas conectados.',
  },
  it: {
    title: 'Tariffe di spedizione', subtitle: 'Consulta prezzi reali per tratta, corriere, servizio, peso e piano.', national: 'Nazionale', international: 'Internazionale', from: 'Da', to: 'A', country: 'Paese', postal: 'CAP', city: 'Città (opzionale)', courier: 'Corriere', allCouriers: 'Tutti i corrieri', service: 'Servizio', allServices: 'Tutti i servizi', plan: 'Piano applicato', routeHelp: 'Le tariffe si caricano automaticamente quando la tratta è completa.', search: 'Aggiorna tariffe', loading: 'Caricamento delle tariffe reali…', noRoute: 'Configura una tratta per vedere le tariffe', noRouteHelp: 'Inserisci entrambi i CAP e le tariffe si caricheranno automaticamente.', noResults: 'Nessuna tariffa per questa selezione.', results: 'tariffe', origin: 'Origine', destination: 'Destinazione', mode: 'Modalità', weight: 'Peso', additional: '+ kg aggiuntivo', live: 'Dati reali', lastQuery: 'Caricato', export: 'Scarica', csv: 'CSV', print: 'Stampa / PDF', quote: 'Fai un preventivo e genera etichetta', activePlan: 'Piano attivo', noIncrement: 'L’API non ha restituito un supplemento incrementale', planHint: 'Il prezzo mostra lo sconto del piano selezionato quando restituito dall’API.', error: 'Impossibile caricare le tariffe.', partial: 'Alcune colonne di peso non hanno risposto e risultano non disponibili.', required: 'Completa entrambi i CAP.', standard: 'Servizio standard', home: 'A domicilio', dropoff: 'Punto / ufficio', economy: 'Economico', fast: 'Veloce', unknown: 'Non disponibile', currency: 'Valuta', route: 'Tratta', dataSource: 'Prezzi finali restituiti dai corrieri collegati.',
  },
  en: {
    title: 'Shipping rates', subtitle: 'Check real prices by route, courier, service, weight and plan.', national: 'Domestic', international: 'International', from: 'From', to: 'To', country: 'Country', postal: 'Postal code', city: 'City (optional)', courier: 'Courier', allCouriers: 'All couriers', service: 'Service', allServices: 'All services', plan: 'Applied plan', routeHelp: 'Rates load automatically when the route is complete.', search: 'Refresh rates', loading: 'Loading real rates…', noRoute: 'Configure a route to see rates', noRouteHelp: 'Enter both postal codes and the rates will load automatically.', noResults: 'No rates for this selection.', results: 'rates', origin: 'Origin', destination: 'Destination', mode: 'Mode', weight: 'Weight', additional: '+ additional kg', live: 'Real data', lastQuery: 'Loaded', export: 'Download', csv: 'CSV', print: 'Print / PDF', quote: 'Get a quote and generate label', activePlan: 'Active plan', noIncrement: 'The API did not return an incremental surcharge', planHint: 'The displayed price includes the selected plan discount when returned by the API.', error: 'Rates could not be loaded.', partial: 'Some weight columns did not respond and are shown as unavailable.', required: 'Complete both postal codes.', standard: 'Standard service', home: 'Door delivery', dropoff: 'Point / office', economy: 'Economy', fast: 'Fast', unknown: 'Unavailable', currency: 'Currency', route: 'Route', dataSource: 'Final prices returned by connected couriers.',
  },
  fr: {
    title: 'Tarifs d’expédition', subtitle: 'Consultez les prix réels par itinéraire, coursier, service, poids et plan.', national: 'Nationale', international: 'Internationale', from: 'De', to: 'Vers', country: 'Pays', postal: 'Code postal', city: 'Ville (facultatif)', courier: 'Coursier', allCouriers: 'Tous les coursiers', service: 'Service', allServices: 'Tous les services', plan: 'Plan appliqué', routeHelp: 'Sélectionnez l’origine, la destination et les codes postaux pour consulter les tarifs réels.', search: 'Consulter les tarifs', loading: 'Consultation des tarifs réels…', noRoute: 'Configurez un itinéraire pour voir les tarifs', noRouteHelp: 'Les codes postaux sont nécessaires pour calculer le prix selon la route et les dimensions.', noResults: 'Aucun tarif pour cette sélection.', results: 'tarifs', origin: 'Origine', destination: 'Destination', mode: 'Mode', weight: 'Poids', additional: '+ kg supplémentaire', live: 'Données réelles', lastQuery: 'Consulté', export: 'Télécharger', csv: 'CSV', print: 'Imprimer / PDF', quote: 'Obtenir un devis et générer l’étiquette', activePlan: 'Plan actif', noIncrement: 'L’API n’a pas renvoyé de supplément incrémental', planHint: 'Le prix inclut la remise du plan sélectionné lorsqu’elle est fournie par l’API.', error: 'Impossible de charger les tarifs.', partial: 'Certaines colonnes de poids n’ont pas répondu et sont indisponibles.', required: 'Complétez les deux codes postaux.', standard: 'Service standard', home: 'À domicile', dropoff: 'Point / bureau', economy: 'Économique', fast: 'Rapide', unknown: 'Indisponible', currency: 'Devise', route: 'Itinéraire', dataSource: 'Prix finaux renvoyés par les coursiers connectés.',
  },
  de: {
    title: 'Versandtarife', subtitle: 'Echte Preise nach Route, Kurier, Service, Gewicht und Tarifplan.', national: 'National', international: 'International', from: 'Von', to: 'Nach', country: 'Land', postal: 'Postleitzahl', city: 'Stadt (optional)', courier: 'Kurier', allCouriers: 'Alle Kuriere', service: 'Service', allServices: 'Alle Services', plan: 'Angewendeter Plan', routeHelp: 'Wählen Sie Absender, Empfänger und Postleitzahlen für echte Tarife.', search: 'Tarife abfragen', loading: 'Echte Tarife werden abgefragt…', noRoute: 'Konfigurieren Sie eine Route', noRouteHelp: 'Postleitzahlen sind nötig, weil Kuriere den Preis anhand von Route und Maßen berechnen.', noResults: 'Keine Tarife für diese Auswahl.', results: 'Tarife', origin: 'Absender', destination: 'Empfänger', mode: 'Art', weight: 'Gewicht', additional: '+ zusätzliches kg', live: 'Echte Daten', lastQuery: 'Abgefragt', export: 'Download', csv: 'CSV', print: 'Drucken / PDF', quote: 'Tarif berechnen und Label erstellen', activePlan: 'Aktiver Plan', noIncrement: 'Die API lieferte keinen Aufschlag pro zusätzlichem kg', planHint: 'Der angezeigte Preis enthält den Rabatt des ausgewählten Plans, sofern die API ihn liefert.', error: 'Tarife konnten nicht geladen werden.', partial: 'Einige Gewichtsspalten antworteten nicht und sind nicht verfügbar.', required: 'Beide Postleitzahlen eingeben.', standard: 'Standardservice', home: 'Türzustellung', dropoff: 'Punkt / Büro', economy: 'Economy', fast: 'Schnell', unknown: 'Nicht verfügbar', currency: 'Währung', route: 'Route', dataSource: 'Endpreise der verbundenen Kuriere.',
  },
  zh: {
    title: '运费', subtitle: '按路线、快递、服务、重量和套餐查看真实价格。', national: '国内', international: '国际', from: '始发地', to: '目的地', country: '国家', postal: '邮政编码', city: '城市（可选）', courier: '快递', allCouriers: '全部快递', service: '服务', allServices: '全部服务', plan: '应用套餐', routeHelp: '选择始发地、目的地和邮政编码以查询真实费率。', search: '查询费率', loading: '正在查询真实费率…', noRoute: '配置路线后查看费率', noRouteHelp: '快递根据路线和尺寸计算价格，因此需要邮政编码。', noResults: '没有符合条件的费率。', results: '费率', origin: '始发地', destination: '目的地', mode: '方式', weight: '重量', additional: '+ 额外公斤', live: '真实数据', lastQuery: '查询时间', export: '下载', csv: 'CSV', print: '打印 / PDF', quote: '报价并生成标签', activePlan: '当前套餐', noIncrement: 'API 未返回额外公斤附加费', planHint: '如果 API 返回套餐折扣，显示价格将包含所选套餐折扣。', error: '无法加载费率。', partial: '部分重量列没有响应，显示为不可用。', required: '请填写两个邮政编码。', standard: '标准服务', home: '送货上门', dropoff: '网点 / 办公室', economy: '经济', fast: '快速', unknown: '不可用', currency: '货币', route: '路线', dataSource: '连接快递返回的最终价格。',
  },
  ht: {
    title: 'Tarif livrezon', subtitle: 'Tcheke pri reyèl selon wout, courier, sèvis, pwa ak plan.', national: 'Nasyonal', international: 'Entènasyonal', from: 'Soti', to: 'Ale', country: 'Peyi', postal: 'Kòd postal', city: 'Vil (opsyonèl)', courier: 'Courier', allCouriers: 'Tout courier yo', service: 'Sèvis', allServices: 'Tout sèvis yo', plan: 'Plan aplike', routeHelp: 'Chwazi orijin, destinasyon ak kòd postal pou tcheke tarif reyèl yo.', search: 'Tcheke tarif yo', loading: 'N ap tcheke tarif reyèl yo…', noRoute: 'Konfigire yon wout pou wè tarif yo', noRouteHelp: 'Kòd postal yo nesesè paske courier yo kalkile pri a selon wout ak dimansyon.', noResults: 'Pa gen tarif pou seleksyon sa a.', results: 'tarif', origin: 'Orijin', destination: 'Destinasyon', mode: 'Mòd', weight: 'Pwa', additional: '+ kg anplis', live: 'Done reyèl', lastQuery: 'Tcheke', export: 'Telechaje', csv: 'CSV', print: 'Enprime / PDF', quote: 'Kalkile epi jenere etikèt', activePlan: 'Plan aktif', noIncrement: 'API a pa retounen yon sipleman pou kg anplis', planHint: 'Pri a gen rabè plan chwazi a lè API a retounen li.', error: 'Tarif yo pa t kapab chaje.', partial: 'Kèk kolòn pwa pa reponn epi yo pa disponib.', required: 'Ranpli de kòd postal yo.', standard: 'Sèvis estanda', home: 'Livrezon lakay', dropoff: 'Pwen / biwo', economy: 'Ekonomik', fast: 'Rapid', unknown: 'Pa disponib', currency: 'Lajan', route: 'Wout', dataSource: 'Pri final courier ki konekte yo retounen.',
  },
};

const PAGINATION_COPY: Record<string, Record<string, string>> = {
  es: { previous: 'Anterior', next: 'Siguiente', page: 'Página', perPage: 'Por página', showing: 'Mostrando' },
  it: { previous: 'Precedente', next: 'Successiva', page: 'Pagina', perPage: 'Per pagina', showing: 'Visualizzati' },
  en: { previous: 'Previous', next: 'Next', page: 'Page', perPage: 'Per page', showing: 'Showing' },
  fr: { previous: 'Précédente', next: 'Suivante', page: 'Page', perPage: 'Par page', showing: 'Affichage' },
  de: { previous: 'Zurück', next: 'Weiter', page: 'Seite', perPage: 'Pro Seite', showing: 'Angezeigt' },
  zh: { previous: '上一页', next: '下一页', page: '页', perPage: '每页', showing: '显示' },
  ht: { previous: 'Anvan', next: 'Apre', page: 'Paj', perPage: 'Pa paj', showing: 'Ap montre' },
};

const PACKAGE_COPY: Record<string, Record<string, string>> = {
  es: { allPlanPrices: 'Precios finales por plan', activePlan: 'Tu plan activo', selectedWeight: 'Peso del envío', changeDimensions: 'Cambiar dimensiones', hideDimensions: 'Ocultar dimensiones', dimensions: 'Dimensiones opcionales', length: 'Largo', width: 'Ancho', height: 'Alto', applyDimensions: 'Aplicar dimensiones', standardPackage: 'Las dimensiones se mantienen ocultas hasta que decidas modificarlas.' },
  it: { allPlanPrices: 'Prezzi finali per piano', activePlan: 'Il tuo piano attivo', selectedWeight: 'Peso della spedizione', changeDimensions: 'Modifica dimensioni', hideDimensions: 'Nascondi dimensioni', dimensions: 'Dimensioni opzionali', length: 'Lunghezza', width: 'Larghezza', height: 'Altezza', applyDimensions: 'Applica dimensioni', standardPackage: 'Le dimensioni restano nascoste finché non decidi di modificarle.' },
  en: { allPlanPrices: 'Final prices by plan', activePlan: 'Your active plan', selectedWeight: 'Shipment weight', changeDimensions: 'Change dimensions', hideDimensions: 'Hide dimensions', dimensions: 'Optional dimensions', length: 'Length', width: 'Width', height: 'Height', applyDimensions: 'Apply dimensions', standardPackage: 'Dimensions stay hidden until you decide to change them.' },
  fr: { allPlanPrices: 'Prix finaux par plan', activePlan: 'Votre plan actif', selectedWeight: 'Poids de l’envoi', changeDimensions: 'Modifier les dimensions', hideDimensions: 'Masquer les dimensions', dimensions: 'Dimensions facultatives', length: 'Longueur', width: 'Largeur', height: 'Hauteur', applyDimensions: 'Appliquer les dimensions', standardPackage: 'Les dimensions restent masquées jusqu’à ce que vous décidiez de les modifier.' },
  de: { allPlanPrices: 'Endpreise nach Tarifplan', activePlan: 'Ihr aktiver Tarifplan', selectedWeight: 'Sendungsgewicht', changeDimensions: 'Maße ändern', hideDimensions: 'Maße ausblenden', dimensions: 'Optionale Maße', length: 'Länge', width: 'Breite', height: 'Höhe', applyDimensions: 'Maße anwenden', standardPackage: 'Die Maße bleiben verborgen, bis Sie sie ändern möchten.' },
  zh: { allPlanPrices: '按套餐显示最终价格', activePlan: '您的当前套餐', selectedWeight: '货物重量', changeDimensions: '修改尺寸', hideDimensions: '隐藏尺寸', dimensions: '可选尺寸', length: '长度', width: '宽度', height: '高度', applyDimensions: '应用尺寸', standardPackage: '尺寸会保持隐藏，直到您决定修改它们。' },
  ht: { allPlanPrices: 'Pri final pa plan', activePlan: 'Plan aktif ou', selectedWeight: 'Pwa voye a', changeDimensions: 'Chanje dimansyon', hideDimensions: 'Kache dimansyon yo', dimensions: 'Dimansyon opsyonèl', length: 'Longè', width: 'Lajè', height: 'Wotè', applyDimensions: 'Aplike dimansyon', standardPackage: 'Dimansyon yo rete kache jiskaske ou deside chanje yo.' },
};

const normalize = (value: any) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const numeric = (value: any, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};
const copyFor = (language: string) => COPY[language] || COPY[language.split('-')[0]] || COPY.es;
const paginationFor = (language: string) => PAGINATION_COPY[language] || PAGINATION_COPY[language.split('-')[0]] || PAGINATION_COPY.es;
const packageCopyFor = (language: string) => PACKAGE_COPY[language] || PACKAGE_COPY[language.split('-')[0]] || PACKAGE_COPY.es;
const PRINT_COPY: Record<string, Record<string, string>> = {
  es: { title: 'Preventivo de envío', issuedBy: 'Emitido por', client: 'Cliente', route: 'Ruta', package: 'Paquete', weight: 'Peso', dimensions: 'Dimensiones', standardPackage: 'Paquete estándar', options: 'Opciones destacadas', carrier: 'Courier', service: 'Servicio', mode: 'Modalidad', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: 'N.º de preventivo', date: 'Fecha', valid: 'Validez', validValue: 'Sujeto a disponibilidad y confirmación antes de comprar', reference: 'Referencia', moreOptions: 'Se muestran las opciones más competitivas de la consulta actual.', footer: 'Este documento es informativo. El precio final se confirma al generar el envío.', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'Cliente DoorDrop' },
  it: { title: 'Preventivo di spedizione', issuedBy: 'Emesso da', client: 'Cliente', route: 'Tratta', package: 'Pacco', weight: 'Peso', dimensions: 'Dimensioni', standardPackage: 'Pacco standard', options: 'Opzioni in evidenza', carrier: 'Corriere', service: 'Servizio', mode: 'Modalità', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: 'N. preventivo', date: 'Data', valid: 'Validità', validValue: 'Soggetto a disponibilità e conferma prima dell’acquisto', reference: 'Riferimento', moreOptions: 'Sono mostrate le opzioni più competitive della consultazione attuale.', footer: 'Documento informativo. Il prezzo finale viene confermato al momento della creazione della spedizione.', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'Cliente DoorDrop' },
  en: { title: 'Shipping estimate', issuedBy: 'Issued by', client: 'Customer', route: 'Route', package: 'Package', weight: 'Weight', dimensions: 'Dimensions', standardPackage: 'Standard package', options: 'Featured options', carrier: 'Courier', service: 'Service', mode: 'Mode', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: 'Estimate no.', date: 'Date', valid: 'Validity', validValue: 'Subject to availability and confirmation before purchase', reference: 'Reference', moreOptions: 'The most competitive options from the current quote are shown.', footer: 'Informational document. The final price is confirmed when the shipment is created.', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'DoorDrop customer' },
  fr: { title: 'Devis d’expédition', issuedBy: 'Émis par', client: 'Client', route: 'Itinéraire', package: 'Colis', weight: 'Poids', dimensions: 'Dimensions', standardPackage: 'Colis standard', options: 'Options recommandées', carrier: 'Coursier', service: 'Service', mode: 'Mode', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: 'N° de devis', date: 'Date', valid: 'Validité', validValue: 'Sous réserve de disponibilité et de confirmation avant achat', reference: 'Référence', moreOptions: 'Les options les plus compétitives de la consultation actuelle sont affichées.', footer: 'Document informatif. Le prix final est confirmé lors de la création de l’expédition.', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'Client DoorDrop' },
  de: { title: 'Versandangebot', issuedBy: 'Ausgestellt von', client: 'Kunde', route: 'Route', package: 'Paket', weight: 'Gewicht', dimensions: 'Maße', standardPackage: 'Standardpaket', options: 'Empfohlene Optionen', carrier: 'Kurier', service: 'Service', mode: 'Art', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: 'Angebotsnummer', date: 'Datum', valid: 'Gültigkeit', validValue: 'Vorbehaltlich Verfügbarkeit und Bestätigung vor dem Kauf', reference: 'Referenz', moreOptions: 'Die wettbewerbsfähigsten Optionen der aktuellen Abfrage werden angezeigt.', footer: 'Informationsdokument. Der Endpreis wird bei der Erstellung der Sendung bestätigt.', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'DoorDrop-Kunde' },
  zh: { title: '运费报价', issuedBy: '出具方', client: '客户', route: '路线', package: '包裹', weight: '重量', dimensions: '尺寸', standardPackage: '标准包裹', options: '推荐选项', carrier: '快递', service: '服务', mode: '方式', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: '报价编号', date: '日期', valid: '有效性', validValue: '以购买前的可用性和确认结果为准', reference: '参考', moreOptions: '显示当前查询中最具竞争力的选项。', footer: '信息文件。最终价格将在创建运输时确认。', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'DoorDrop 客户' },
  ht: { title: 'Estimasyon livrezon', issuedBy: 'Emèt pa', client: 'Kliyan', route: 'Wout', package: 'Pake', weight: 'Pwa', dimensions: 'Dimansyon', standardPackage: 'Pake estanda', options: 'Opsyon rekòmande', carrier: 'Courier', service: 'Sèvis', mode: 'Mòd', basic: 'DoorDrop Básico', pro: 'DoorDrop Pro', enterprise: 'DoorDrop Enterprise', quoteNumber: 'Nimewo estimasyon', date: 'Dat', valid: 'Validite', validValue: 'Li depann de disponiblite ak konfimasyon anvan acha', reference: 'Referans', moreOptions: 'Opsyon ki pi konpetitif nan rechèch aktyèl la parèt.', footer: 'Dokiman enfòmasyon. Pri final la konfime lè yo kreye livrezon an.', support: 'soporte@doordrop.lat', website: 'doordrop.lat', noClient: 'Kliyan DoorDrop' },
};
const printCopyFor = (language: string) => PRINT_COPY[language] || PRINT_COPY[language.split('-')[0]] || PRINT_COPY.es;
const countryOrder = [...COUNTRY_PRIORITY, ...WORLD_COUNTRIES.map((country) => country.code).filter((code) => !COUNTRY_PRIORITY.includes(code))];
const countryList = countryOrder.map((code) => WORLD_COUNTRIES.find((country) => country.code === code)).filter(Boolean) as typeof WORLD_COUNTRIES;

const courierFromQuote = (quote: any): string => {
  const candidates = [
    quote?.carrierName, quote?.courierName, quote?.providerPayload?.carrier_name, quote?.providerPayload?.carrierName,
    quote?.providerPayload?.carrier, quote?.providerPayload?.courier_name, quote?.providerPayload?.courier,
    quote?.providerPayload?.vendor, quote?.providerPayload?.nombre_agencia, quote?.providerPayload?.nombre_completo_agencia,
    quote?.service,
  ];
  for (const candidate of candidates) {
    const value = normalize(candidate);
    if (!value) continue;
    const known = KNOWN_COURIERS.find(([needle]) => value.includes(needle));
    if (known) return known[1];
  }
  return '';
};

const serviceKind = (quote: any): 'fast' | 'dropoff' | 'door' | 'economy' | 'other' => {
  const text = normalize(`${quote?.serviceType || ''} ${quote?.serviceTypeLabel || ''} ${quote?.service || ''} ${quote?.collectionTypeName || ''}`);
  if (text.includes('express') || text.includes('priority') || text.includes('rapido') || text.includes('fast')) return 'fast';
  if (text.includes('drop') || text.includes('punto') || text.includes('office') || text.includes('pickup point')) return 'dropoff';
  if (text.includes('door') || text.includes('domicilio') || text.includes('home')) return 'door';
  if (text.includes('econom') || text.includes('standard') || text.includes('classic')) return 'economy';
  return 'other';
};

const publicServiceName = (quote: any, copy: Record<string, string>) => {
  const raw = String(quote?.serviceTypeLabel || quote?.serviceName || quote?.service || '');
  const cleaned = raw.replace(/paccofacile|parcelabc|parcel abc|genei|spedirepro|spediamo pro|easypost|logihub|ship24go/ig, '').replace(/\s+/g, ' ').trim();
  if (cleaned) return cleaned;
  const kind = serviceKind(quote);
  if (kind === 'fast') return copy.fast;
  if (kind === 'economy') return copy.economy;
  return copy.standard;
};

const publicMode = (quote: any, copy: Record<string, string>) => {
  const kind = serviceKind(quote);
  if (kind === 'dropoff') return { key: kind, label: copy.dropoff };
  if (kind === 'door') return { key: kind, label: copy.home };
  if (kind === 'fast') return { key: kind, label: copy.fast };
  if (kind === 'economy') return { key: kind, label: copy.economy };
  return { key: 'other', label: copy.standard };
};

const priceForPlan = (quote: any, planId: string) => {
  const comparisons = Array.isArray(quote?.planComparisons) ? quote.planComparisons : [];
  const match = comparisons.find((plan: any) => String(plan?.planId || '') === String(planId || ''));
  if (match && match.quotePrice != null) return numeric(match.quotePrice, 0);
  return numeric(quote?.customerPrice ?? quote?.total, 0);
};

const planOptionsFromResponse = (response: any): PlanOption[] => {
  const responsePlans = Array.isArray(response?.plans) ? response.plans : [];
  if (responsePlans.length) return responsePlans.map((plan: any) => ({
    planId: String(plan.planId || plan.id || ''),
    planName: String(plan.planName || plan.name || 'DoorDrop'),
    planPrice: numeric(plan.planPrice ?? plan.price),
    planCurrency: String(plan.planCurrency || plan.currency || 'EUR').toUpperCase(),
    discountPercent: numeric(plan.discountPercent ?? plan.discount_percent),
  })).filter((plan: PlanOption) => plan.planId);
  const fromQuote = Array.isArray(response?.quotes) ? response.quotes.flatMap((quote: any) => Array.isArray(quote?.planComparisons) ? quote.planComparisons : []) : [];
  const seen = new Set<string>();
  return fromQuote.filter((plan: any) => {
    const id = String(plan?.planId || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((plan: any) => ({
    planId: String(plan.planId), planName: String(plan.planName || 'DoorDrop'), planPrice: numeric(plan.planPrice),
    planCurrency: String(plan.planCurrency || 'EUR').toUpperCase(), discountPercent: numeric(plan.discountPercent),
  }));
};

const mergeResponses = (responses: Array<{ weight: WeightStop; data: any }>, originCountry: string, destCountry: string, copy: Record<string, string>): MatrixRow[] => {
  const rows = new Map<string, MatrixRow>();
  for (const response of responses) {
    const quotes = Array.isArray(response.data?.quotes) ? response.data.quotes : [];
    for (const quote of quotes) {
      const courier = courierFromQuote(quote);
      if (!courier) continue;
      const service = publicServiceName(quote, copy);
      const serviceKey = String(quote?.serviceId || quote?.serviceType || quote?.service || service).toLowerCase().replace(/\s+/g, '-');
      const mode = publicMode(quote, copy);
      const key = `${courier}|${serviceKey}|${mode.key}`;
      const current = rows.get(key) || {
        key, originCountry, destCountry, courier, service, mode: mode.label, modeKey: mode.key, serviceKey, quotes: {},
      };
      const existing = current.quotes[response.weight];
      if (!existing || priceForPlan(quote, String(quote?.planId || 'plan_basic')) < priceForPlan(existing, String(existing?.planId || 'plan_basic'))) {
        current.quotes[response.weight] = quote;
      }
      rows.set(key, current);
    }
  }
  return Array.from(rows.values());
};

// Real rate snapshot validated from the connected couriers for the initial catalog.
// The live quote silently replaces these rows when the route or package changes.
const DEFAULT_PLANS: PlanOption[] = [
  { planId: 'plan_basic', planName: 'DoorDrop Básico', planPrice: 0, planCurrency: 'EUR', discountPercent: 0 },
  { planId: 'plan_pro', planName: 'DoorDrop Pro', planPrice: 29.99, planCurrency: 'EUR', discountPercent: 10 },
  { planId: 'plan_enterprise', planName: 'DoorDrop Enterprise', planPrice: 50, planCurrency: 'EUR', discountPercent: 20 },
];

const referenceMoney = (value: number) => Math.round(value * 100) / 100;
const referenceQuote = (basicPrice: number) => ({
  currency: 'EUR',
  customerPrice: basicPrice,
  total: basicPrice,
  planId: 'plan_basic',
  planName: 'DoorDrop Básico',
  planComparisons: DEFAULT_PLANS.map((plan) => ({
    ...plan,
    quotePrice: referenceMoney(basicPrice * (1 - (plan.discountPercent / 100))),
    isActive: plan.planId === 'plan_basic',
  })),
});

const referenceRow = (originCountry: string, destCountry: string, courier: string, service: string, mode: string, basicPrice: number, suffix: string): MatrixRow => ({
  key: `${courier}|${service}|${mode}|${suffix}`,
  originCountry,
  destCountry,
  courier,
  service,
  mode,
  modeKey: normalize(mode),
  serviceKey: normalize(service),
  quotes: { 1: referenceQuote(basicPrice) },
});

const DEFAULT_INTERNATIONAL_ROWS: MatrixRow[] = [
  referenceRow('ES', 'DE', 'SEUR', 'Económico', 'Punto / oficina', 17.59, 'point-1'),
  referenceRow('ES', 'DE', 'SEUR', 'Económico', 'Punto / oficina', 19.47, 'point-2'),
  referenceRow('ES', 'DE', 'SEUR', 'Económico', 'Económico', 22.69, 'economy'),
  referenceRow('ES', 'DE', 'UPS', 'Económico', 'A domicilio', 25.01, 'home'),
  referenceRow('ES', 'DE', 'UPS', 'Económico', 'Punto / oficina', 26.01, 'point'),
  referenceRow('ES', 'DE', 'UPS', 'Económico', 'Económico', 27.98, 'economy'),
];

const DEFAULT_NATIONAL_ROWS: MatrixRow[] = [
  referenceRow('ES', 'ES', 'GLS', 'Económico', 'Económico', 9.84, 'gls'),
  referenceRow('ES', 'ES', 'SEUR', 'Rápido', 'Rápido', 13.68, 'seur'),
  referenceRow('ES', 'ES', 'UPS', 'Rápido', 'Rápido', 16.47, 'ups-1'),
  referenceRow('ES', 'ES', 'UPS', 'Rápido', 'Rápido', 19.41, 'ups-2'),
  referenceRow('ES', 'ES', 'UPS', 'Rápido', 'Rápido', 19.79, 'ups-3'),
];

const DEFAULT_ITALY_NATIONAL_ROWS: MatrixRow[] = [
  referenceRow('IT', 'IT', 'InPost', 'Económico', 'Económico', 4.75, 'inpost-economy'),
  referenceRow('IT', 'IT', 'SDA', 'Económico', 'Punto / oficina', 5.80, 'sda-point-1'),
  referenceRow('IT', 'IT', 'SDA', 'Económico', 'Punto / oficina', 6.63, 'sda-point-2'),
  referenceRow('IT', 'IT', 'SDA', 'Económico', 'A domicilio', 6.99, 'sda-home-1'),
  referenceRow('IT', 'IT', 'GLS', 'Rápido', 'Rápido', 7.24, 'gls-fast'),
  referenceRow('IT', 'IT', 'UPS', 'Rápido', 'Rápido', 7.27, 'ups-fast-1'),
  referenceRow('IT', 'IT', 'BRT', 'Económico', 'Punto / oficina', 7.29, 'brt-point'),
  referenceRow('IT', 'IT', 'Poste Italiane', 'Rápido', 'Rápido', 7.41, 'poste-fast-1'),
  referenceRow('IT', 'IT', 'InPost', 'Económico', 'Punto / oficina', 7.46, 'inpost-point'),
  referenceRow('IT', 'IT', 'BRT', 'Económico', 'A domicilio', 7.67, 'brt-home-1'),
  referenceRow('IT', 'IT', 'Poste Italiane', 'Económico', 'A domicilio', 7.79, 'poste-home'),
  referenceRow('IT', 'IT', 'SDA', 'Rápido', 'Rápido', 7.81, 'sda-fast-1'),
  referenceRow('IT', 'IT', 'SDA', 'Económico', 'Punto / oficina', 8.13, 'sda-point-3'),
  referenceRow('IT', 'IT', 'BRT', 'Rápido', 'Rápido', 8.14, 'brt-fast'),
  referenceRow('IT', 'IT', 'TNT', 'Rápido', 'Rápido', 8.52, 'tnt-fast'),
  referenceRow('IT', 'IT', 'Poste Italiane', 'Rápido', 'Rápido', 9.09, 'poste-fast-2'),
  referenceRow('IT', 'IT', 'SDA', 'Económico', 'A domicilio', 9.14, 'sda-home-2'),
  referenceRow('IT', 'IT', 'SDA', 'Rápido', 'Rápido', 9.48, 'sda-fast-2'),
  referenceRow('IT', 'IT', 'SDA', 'Rápido', 'Rápido', 9.48, 'sda-fast-3'),
  referenceRow('IT', 'IT', 'BRT', 'Económico', 'A domicilio', 11.17, 'brt-home-2'),
  referenceRow('IT', 'IT', 'BRT', 'Rápido', 'Rápido', 27.96, 'brt-fast-premium'),
  referenceRow('IT', 'IT', 'UPS', 'Rápido', 'Rápido', 57.29, 'ups-fast-2'),
];

const DEFAULT_US_NATIONAL_ROWS: MatrixRow[] = [
  referenceRow('US', 'US', 'FedEx', 'Rápido', 'Rápido', 50.60, 'fedex-fast'),
];

const DEFAULT_GB_NATIONAL_ROWS: MatrixRow[] = [
  referenceRow('GB', 'GB', 'UPS', 'Económico', 'Económico', 17.28, 'ups-economy'),
];

const DEFAULT_COUNTRY_ZIPS: Record<string, { originZip: string; destZip: string }> = {
  ES: { originZip: '28001', destZip: '28001' },
  IT: { originZip: '00118', destZip: '20121' },
  US: { originZip: '10001', destZip: '10002' },
  GB: { originZip: 'SW1A 1AA', destZip: 'EC1A 1BB' },
};

const DEFAULT_NATIONAL_CATALOG: Record<string, MatrixRow[]> = {
  ES: DEFAULT_NATIONAL_ROWS,
  IT: DEFAULT_ITALY_NATIONAL_ROWS,
  US: DEFAULT_US_NATIONAL_ROWS,
  GB: DEFAULT_GB_NATIONAL_ROWS,
};

const csvCell = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function DoorDropTariffa() {
  const { brand } = useBrand();
  const { language } = useI18n();
  const copy = copyFor(language);
  const pagination = paginationFor(language);
  const ui = packageCopyFor(language);
  const printCopy = printCopyFor(language);
  const { currency, setCurrency, format, availableCurrencies } = useCurrency();
  const [coverage, setCoverage] = useState<Coverage>('internacional');
  const [form, setForm] = useState<TariffForm>({ originCountry: 'ES', originZip: '28001', originCity: '', destCountry: 'DE', destZip: '10115', destCity: '', currency: currency || 'EUR' });
  const [rows, setRows] = useState<MatrixRow[]>(DEFAULT_INTERNATIONAL_ROWS);
  const [plans, setPlans] = useState<PlanOption[]>(DEFAULT_PLANS);
  const [activePlanId, setActivePlanId] = useState('plan_basic');
  const [selectedWeight, setSelectedWeight] = useState<WeightStop>(1);
  const [dimensions, setDimensions] = useState<PackageDimensions>({ width: 10, height: 10, length: 10 });
  const [dimensionsOpen, setDimensionsOpen] = useState(false);
  const [courierFilter, setCourierFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState(false);
  const [lastQuery, setLastQuery] = useState<Date | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    let mounted = true;
    api.getProfile().then((response) => {
      if (mounted) setProfile(response || null);
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const updateForm = (key: string, value: string) => {
    requestSequence.current += 1;
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      const preset = DEFAULT_COUNTRY_ZIPS[value];
      if (coverage === 'nacional' && (key === 'originCountry' || key === 'destCountry')) {
        next.originCountry = value;
        next.destCountry = value;
        next.originZip = preset?.originZip || '';
        next.destZip = preset?.destZip || preset?.originZip || '';
      } else if (key === 'originCountry') {
        next.originZip = preset?.originZip || '';
      } else if (key === 'destCountry') {
        next.destZip = preset?.destZip || preset?.originZip || '';
      }
      return next;
    });
    const nextCountry = coverage === 'nacional' ? value : form.originCountry;
    const nextSnapshot = coverage === 'nacional' && selectedWeight === 1 ? DEFAULT_NATIONAL_CATALOG[nextCountry] : undefined;
    setPlans(nextSnapshot ? DEFAULT_PLANS : []);
    setActivePlanId(nextSnapshot ? 'plan_basic' : '');
    setRows(nextSnapshot || []);
    setPage(1);
    setCourierFilter('all');
    setServiceFilter('all');
    setError('');
    setLastQuery(null);
  };

  const changeCoverage = (nextCoverage: Coverage) => {
    requestSequence.current += 1;
    const coverageChanged = coverage !== nextCoverage;
    const countryPreset = DEFAULT_COUNTRY_ZIPS[form.originCountry];
    const nextNationalSnapshot = coverageChanged && selectedWeight === 1 && nextCoverage === 'nacional' ? DEFAULT_NATIONAL_CATALOG[form.originCountry] : undefined;
    const canUseSpainInternationalSnapshot = coverageChanged && selectedWeight === 1 && nextCoverage === 'internacional' && form.originCountry === 'ES' && (form.originZip === '28001' || !form.originZip);
    setCoverage(nextCoverage);
    setPlans(nextNationalSnapshot || canUseSpainInternationalSnapshot ? DEFAULT_PLANS : []);
    setActivePlanId(nextNationalSnapshot || canUseSpainInternationalSnapshot ? 'plan_basic' : '');
    setRows(nextNationalSnapshot || (canUseSpainInternationalSnapshot ? DEFAULT_INTERNATIONAL_ROWS : []));
    setPage(1);
    setCourierFilter('all');
    setServiceFilter('all');
    setLastQuery(null);
    if (nextCoverage === 'nacional') {
      setForm((previous) => ({
        ...previous,
        originZip: countryPreset?.originZip || previous.originZip,
        destCountry: previous.originCountry,
        destZip: countryPreset?.destZip || countryPreset?.originZip || previous.originZip,
      }));
    } else {
      setForm((previous) => {
        const nextDestCountry = previous.destCountry === previous.originCountry ? (previous.originCountry === 'ES' ? 'DE' : 'ES') : previous.destCountry;
        const nextDestPreset = DEFAULT_COUNTRY_ZIPS[nextDestCountry];
        return {
          ...previous,
          originZip: countryPreset?.originZip || previous.originZip,
          destCountry: nextDestCountry,
          destZip: previous.destCountry === previous.originCountry ? (nextDestPreset?.originZip || '') : previous.destZip,
        };
      });
    }
    setError('');
  };

  const countryLabel = (code: string) => {
    const country = WORLD_COUNTRIES.find((item) => item.code === code);
    const translated = getCountryName(code, language.startsWith('en') ? 'en' : 'es');
    return `${translated || country?.nameEs || code} (${code})`;
  };

  const requestRates = async (routeForm: TariffForm, weight: WeightStop, packageDimensions: PackageDimensions) => {
    const originCountry = String(routeForm.originCountry || 'ES').toUpperCase().slice(0, 2);
    const destCountry = String(routeForm.destCountry || 'DE').toUpperCase().slice(0, 2);
    const originZip = String(routeForm.originZip || '').trim();
    const destZip = String(routeForm.destZip || '').trim();
    if (!originZip || !destZip) {
      setError(copy.required);
      return;
    }
    if (coverage === 'nacional' && originCountry !== destCountry) {
      setError(copy.required);
      return;
    }
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError('');
    setPartial(false);
    setPage(1);
    try {
      const originCity = String(routeForm.originCity || '').trim() || (originCountry === 'IT' ? resolveItalianCity(originZip, '') : resolveCityFromPostal(originCountry, originZip)) || resolveCityForCountry(originCountry, originZip, '');
      const destCity = String(routeForm.destCity || '').trim() || (destCountry === 'IT' ? resolveItalianCity(destZip, '') : resolveCityFromPostal(destCountry, destZip)) || resolveCityForCountry(destCountry, destZip, '');
      const requestedCurrency = String(routeForm.currency || currency || 'EUR').toUpperCase();
      const packageLine: PackageLine = {
        width: Math.max(1, Number(packageDimensions.width) || 10),
        height: Math.max(1, Number(packageDimensions.height) || 10),
        length: Math.max(1, Number(packageDimensions.length) || 10),
        weight,
      };
      // Each provider gets its own read-only request. This keeps the real plan
      // pricing intact while allowing the table to grow as responses arrive.
      const requestBase = {
        originCountry, destCountry, originZip, destZip, originCity, destCity, currency: requestedCurrency,
        packages: [{ ...packageLine, qty: 1 }],
        persistQuotes: false,
      };
      const responses: Array<{ weight: WeightStop; data: any }> = [];
      let firstPlanResponse: any = null;
      const receiveProviderResponse = async (providerCode: string) => {
        try {
          const response = await api.quoteShipment({ ...requestBase, providerCodes: [providerCode] });
          if (requestSequence.current !== requestId) return response;
          if (!firstPlanResponse) {
            firstPlanResponse = response;
            const nextPlans = planOptionsFromResponse(response);
            // Providers answer at different speeds. An unavailable provider can
            // legitimately return an empty payload before another provider
            // returns the real plan comparison. Never replace a visible catalog
            // with an empty one because of that partial response.
            if (nextPlans.length) {
              setPlans(nextPlans);
              const quoteList = Array.isArray(response?.quotes) ? response.quotes : [];
              const activeFromQuote = quoteList.find((quote: any) => quote?.planId)?.planId;
              const activeFromComparison = quoteList.flatMap((quote: any) => Array.isArray(quote?.planComparisons) ? quote.planComparisons : []).find((plan: any) => plan?.isActive)?.planId;
              setActivePlanId(String(activeFromQuote || activeFromComparison || nextPlans[0]?.planId || ''));
            }
          }
          if (Array.isArray(response?.quotes) && response.quotes.length) {
            responses.push({ weight, data: response });
            const nextRows = mergeResponses(responses, originCountry, destCountry, copy);
            // A malformed/partial provider payload must not erase the last
            // real rows already rendered by another provider.
            if (nextRows.length) {
              setRows(nextRows);
              setLastQuery(new Date());
            }
          }
          return response;
        } catch (providerError: any) {
          // A single unavailable connector must not hide rates from the other
          // couriers. The server already logs the provider-specific failure.
          return { quotes: [], providerCode, error: providerError?.message || 'unavailable' };
        }
      };
      const providerResults = await Promise.allSettled(PROGRESSIVE_QUOTE_PROVIDER_CODES.map(receiveProviderResponse));
      if (requestSequence.current !== requestId) return;
      if (!responses.length) {
        const firstError = providerResults.find((result: any) => result.status === 'fulfilled' && result.value?.message)?.value?.message;
        throw new Error(firstError || copy.noResults);
      }
    } catch (requestError: any) {
      if (requestSequence.current === requestId) setError(requestError?.message || copy.error);
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  };

  useEffect(() => {
    if (!form.originZip || !form.destZip) return undefined;
    const timer = window.setTimeout(() => {
      void requestRates(form, selectedWeight, dimensions);
    }, 350);
    return () => window.clearTimeout(timer);
    // Route changes load the catalog automatically after the user finishes typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, form.originCountry, form.originZip, form.destCountry, form.destZip, form.currency, selectedWeight]);

  const handleWeightChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextWeight = Number(event.target.value) as WeightStop;
    requestSequence.current += 1;
    setSelectedWeight(nextWeight);
    setRows([]);
    setLastQuery(null);
    setPage(1);
    setCourierFilter('all');
    setServiceFilter('all');
  };

  const handleDimensionChange = (key: keyof PackageDimensions, value: string) => {
    requestSequence.current += 1;
    setDimensions((previous) => ({ ...previous, [key]: Math.max(1, Number(value) || 1) }));
    setRows([]);
    setLastQuery(null);
    setCourierFilter('all');
    setServiceFilter('all');
  };

  const applyDimensions = async () => {
    setDimensionsOpen(false);
    setRows([]);
    setLastQuery(null);
    setCourierFilter('all');
    setServiceFilter('all');
    if (form.originZip && form.destZip) await requestRates(form, selectedWeight, dimensions);
  };

  const couriers = useMemo(() => Array.from(new Set(rows.map((row) => row.courier))).sort(), [rows]);
  const services = useMemo(() => Array.from(new Set(rows.map((row) => row.service))).sort(), [rows]);
  const activePlan = plans.find((plan) => plan.planId === activePlanId) || plans[0];
  const visibleRows = useMemo(() => rows
    .filter((row) => (courierFilter === 'all' || row.courier === courierFilter) && (serviceFilter === 'all' || row.service === serviceFilter))
    .sort((left, right) => priceForPlan(left.quotes[selectedWeight], activePlan?.planId || '') - priceForPlan(right.quotes[selectedWeight], activePlan?.planId || '')),
  [rows, courierFilter, serviceFilter, selectedWeight, activePlan?.planId]);
  const selectedCurrency = String(form.currency || currency || 'EUR').toUpperCase();
  const totalAvailablePrices = visibleRows.filter((row) => row.quotes[selectedWeight]).length * plans.length;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageStart = visibleRows.length ? ((currentPage - 1) * pageSize) + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, visibleRows.length);

  const priceTextForPlan = (quote: any, planId: string) => {
    if (!quote || !planId) return copy.unknown;
    const value = priceForPlan(quote, planId);
    return value > 0 ? format(value, selectedCurrency) : copy.unknown;
  };

  const exportCsv = () => {
    if (!visibleRows.length) return;
    const header = [copy.origin, copy.destination, copy.courier, copy.service, copy.mode, ...plans.map((plan) => `${plan.planName} · ${selectedWeight} kg`)];
    const lines = [header.map(csvCell).join(',')];
    for (const row of visibleRows) {
      lines.push([
        countryLabel(row.originCountry), countryLabel(row.destCountry), row.courier, row.service, row.mode,
        ...plans.map((plan) => priceTextForPlan(row.quotes[selectedWeight], plan.planId)),
      ].map(csvCell).join(','));
    }
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `doordrop-tarifas-${form.originCountry}-${form.destCountry}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const printRows = visibleRows.filter((row) => row.quotes[selectedWeight]).slice(0, 8);
  const quoteNumber = useMemo(() => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `DD-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }, []);
  const printDate = new Intl.DateTimeFormat(language || 'es', { dateStyle: 'medium' }).format(new Date());
  const clientName = profile?.company?.companyName || profile?.user?.name || printCopy.noClient;
  const standardPackage = dimensions.width === 10 && dimensions.height === 10 && dimensions.length === 10;
  const printPreventivo = () => {
    if (!printRows.length) return;
    const previousTitle = document.title;
    document.title = `${brand.siteName || 'DoorDrop'} - ${printCopy.title} ${quoteNumber}`;
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 1000);
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-cyan-400';
  const smallSelectClass = `${inputClass} min-w-[150px] cursor-pointer`;

  return (
    <>
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 pb-8 print:hidden">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Truck className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-black text-slate-900 dark:text-white">{copy.title}</h1><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{copy.subtitle}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300"><Globe2 className="h-4 w-4 text-blue-600" /> {language.toUpperCase()} <span className="text-slate-300">·</span> {selectedCurrency}</div>
          <Link to="/panel/quote" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-700 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-300"><FileText className="h-4 w-4" /> {copy.quote}</Link>
        </div>
      </header>

      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex w-fit rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
            <button type="button" onClick={() => changeCoverage('nacional')} className={`rounded-md px-4 py-2 text-sm font-bold transition ${coverage === 'nacional' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300'}`}>{copy.national}</button>
            <button type="button" onClick={() => changeCoverage('internacional')} className={`rounded-md px-4 py-2 text-sm font-bold transition ${coverage === 'internacional' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300'}`}>{copy.international}</button>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"><Download className="h-4 w-4" /> {copy.export}<button type="button" onClick={exportCsv} disabled={!visibleRows.length} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><FileSpreadsheet className="h-4 w-4" /> {copy.csv}</button><button type="button" onClick={printPreventivo} disabled={!printRows.length} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><Printer className="h-4 w-4" /> {copy.print}</button></div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-white"><Search className="h-4 w-4 text-blue-600" /> {copy.routeHelp}</div>
          <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr_auto_1.1fr_1fr_1.1fr_1.1fr] xl:items-end">
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{copy.from}<select value={form.originCountry} onChange={(event) => updateForm('originCountry', event.target.value)} className={smallSelectClass}>{countryList.map((country) => <option key={country.code} value={country.code}>{countryLabel(country.code)}</option>)}</select></label>
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{copy.postal}<input required value={form.originZip} onChange={(event) => updateForm('originZip', event.target.value)} placeholder="28001" className={inputClass} /></label>
            <div className="hidden items-center justify-center pb-2 text-slate-400 xl:flex">→</div>
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{copy.to}<select value={form.destCountry} onChange={(event) => updateForm('destCountry', event.target.value)} className={smallSelectClass}>{countryList.map((country) => <option key={country.code} value={country.code}>{countryLabel(country.code)}</option>)}</select></label>
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{copy.postal}<input required value={form.destZip} onChange={(event) => updateForm('destZip', event.target.value)} placeholder="10115" className={inputClass} /></label>
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{copy.currency}<select value={form.currency} onChange={(event) => { updateForm('currency', event.target.value); setCurrency(event.target.value); }} className={smallSelectClass}><option value="EUR">EUR</option>{availableCurrencies.filter((item) => item.code !== 'EUR').map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label>
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{ui.selectedWeight}<select value={selectedWeight} onChange={handleWeightChange} disabled={loading} className={smallSelectClass}>{WEIGHT_STOPS.map((weight) => <option key={weight} value={weight}>{weight} kg</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300"><span className="mr-2 uppercase tracking-wide text-slate-500">{ui.activePlan}:</span><span className="font-black text-blue-700 dark:text-cyan-300">{activePlan?.planName || 'DoorDrop'}</span>{activePlan?.discountPercent ? <span className="ml-2 text-emerald-600 dark:text-emerald-400">−{activePlan.discountPercent}%</span> : null}</div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{ui.allPlanPrices}</span>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
            <button type="button" onClick={() => setDimensionsOpen((open) => !open)} className="text-xs font-black text-blue-700 transition hover:text-blue-900 dark:text-cyan-300 dark:hover:text-cyan-200">{dimensionsOpen ? ui.hideDimensions : ui.changeDimensions}</button>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{ui.standardPackage}</p>
            {dimensionsOpen && <div className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{ui.length}<input type="number" min="1" step="1" value={dimensions.length} onChange={(event) => handleDimensionChange('length', event.target.value)} className={inputClass} /></label>
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{ui.width}<input type="number" min="1" step="1" value={dimensions.width} onChange={(event) => handleDimensionChange('width', event.target.value)} className={inputClass} /></label>
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">{ui.height}<input type="number" min="1" step="1" value={dimensions.height} onChange={(event) => handleDimensionChange('height', event.target.value)} className={inputClass} /></label>
              <button type="button" onClick={() => void applyDimensions()} disabled={loading || !form.originZip || !form.destZip} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950">{ui.applyDimensions}</button>
            </div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><MapPin className="h-4 w-4 text-blue-600" /> {copy.route}: {countryLabel(form.originCountry)} → {countryLabel(form.destCountry)}</div>
          <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-500"><span>{copy.courier}</span><select translate="no" value={courierFilter} onChange={(event) => { setCourierFilter(event.target.value); setPage(1); }} className={`${inputClass} w-auto min-w-[150px] py-1.5`}><option value="all">{copy.allCouriers}</option>{couriers.map((courier) => <option key={courier} value={courier}>{courier}</option>)}</select></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500"><span>{copy.service}</span><select translate="no" value={serviceFilter} onChange={(event) => { setServiceFilter(event.target.value); setPage(1); }} className={`${inputClass} w-auto min-w-[150px] py-1.5`}><option value="all">{copy.allServices}</option>{services.map((service) => <option key={service} value={service}>{service}</option>)}</select></label>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {partial && !error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">{copy.partial}</div>}

      {!rows.length && !loading && !error && <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950"><Truck className="mb-3 h-10 w-10 text-blue-500" /><h2 className="text-lg font-black text-slate-900 dark:text-white">{copy.noRoute}</h2><p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">{copy.noRouteHelp}</p></div>}
      {loading && !rows.length && <div className="flex min-h-[260px] items-center justify-center gap-3 rounded-xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:text-cyan-300"><RefreshCw className="h-5 w-5 animate-spin" /> {copy.loading}</div>}

      {!!rows.length && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between print:bg-white">
          <div><div className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {copy.live}</span>{visibleRows.length} {copy.results}{loading && <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] uppercase tracking-wide text-blue-700"><RefreshCw className="h-3 w-3 animate-spin" /> {copy.loading}</span>}</div><p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{ui.allPlanPrices} · {ui.selectedWeight}: {selectedWeight} kg {lastQuery ? `· ${copy.lastQuery}: ${lastQuery.toLocaleTimeString()}` : ''}</p></div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><User className="h-4 w-4" /> {activePlan?.planName || copy.activePlan} <span className="text-slate-300">·</span> {selectedCurrency}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b-2 border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"><tr><th className="border-r border-slate-200 px-3 py-3 font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">{copy.from}</th><th className="border-r border-slate-200 px-3 py-3 font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">{copy.to}</th><th className="border-r border-slate-200 px-3 py-3 font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">{copy.courier}</th><th className="border-r border-slate-200 px-3 py-3 font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">{copy.service}</th><th className="border-r border-slate-300 px-3 py-3 font-black text-slate-700 dark:border-slate-600 dark:text-slate-200">{copy.mode}</th>{plans.map((plan) => <th key={plan.planId} className={`border-r border-slate-200 px-3 py-2 text-right dark:border-slate-700 ${plan.planId === activePlan?.planId ? 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-cyan-200' : 'text-slate-700 dark:text-slate-200'}`}><div className="font-black">{plan.planName}</div><div className="mt-1 text-[10px] font-bold">{plan.discountPercent ? `−${plan.discountPercent}%` : '0%'} {plan.planId === activePlan?.planId ? `· ${ui.activePlan}` : ''}</div></th>)}</tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{pageRows.map((row, index) => { const quote = row.quotes[selectedWeight]; return <tr key={row.key} className={`${index % 2 ? 'bg-slate-50/60 dark:bg-slate-900/30' : 'bg-white dark:bg-slate-950'} hover:bg-blue-50/40 dark:hover:bg-blue-950/20`}><td className="border-r border-slate-200 px-3 py-3 font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">{countryLabel(row.originCountry)}</td><td className="border-r border-slate-200 px-3 py-3 font-medium text-slate-800 dark:border-slate-800 dark:text-slate-200">{countryLabel(row.destCountry)}</td><td className="border-r border-slate-200 px-3 py-3 font-black text-slate-900 dark:border-slate-800 dark:text-white"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[10px] text-blue-700 dark:bg-blue-950/50 dark:text-cyan-300">{row.courier.slice(0, 1)}</span>{row.courier}</td><td className="border-r border-slate-200 px-3 py-3 text-slate-700 dark:border-slate-800 dark:text-slate-300">{row.service}</td><td className="border-r border-slate-300 px-3 py-3 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">{row.mode}</td>{plans.map((plan) => <td key={plan.planId} className={`border-r border-slate-200 px-3 py-3 text-right font-mono font-bold dark:border-slate-700 ${plan.planId === activePlan?.planId ? 'bg-blue-50/60 text-blue-900 dark:bg-blue-950/30 dark:text-cyan-100' : 'text-slate-800 dark:text-slate-100'}`}>{priceTextForPlan(quote, plan.planId)}</td>)}</tr>; })}</tbody>
          </table>
        </div>
        {!visibleRows.length && <div className="px-4 py-10 text-center text-sm font-bold text-slate-500">{copy.noResults}</div>}
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400 print:hidden lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><p>{visibleRows.length} {copy.results} · {totalAvailablePrices} {ui.allPlanPrices.toLowerCase()} · {ui.selectedWeight}: {selectedWeight} kg · {copy.dataSource}</p>{visibleRows.length > 0 && <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{pagination.showing} {pageStart}–{pageEnd} de {visibleRows.length}</p>}</div>
          {visibleRows.length > 0 && <div className="flex flex-wrap items-center justify-end gap-2" aria-label={`${pagination.page} ${currentPage} ${totalPages}`}>
            <label className="flex items-center gap-2 whitespace-nowrap"><span>{pagination.perPage}</span><select translate="no" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>
            <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 transition hover:border-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{pagination.previous}</button>
            <div className="flex items-center gap-1">{Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} aria-current={currentPage === pageNumber ? 'page' : undefined} className={`min-w-8 rounded-lg px-2.5 py-1.5 font-black transition ${currentPage === pageNumber ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{pageNumber}</button>)}</div>
            <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 transition hover:border-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{pagination.next}</button>
          </div>}
        </div>
      </section>}
    </div>
    <section className="hidden print:block">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media screen { .doordrop-print { display: none !important; } }
        @media print {
          html, body { background: #ffffff !important; }
          body { margin: 0 !important; }
          *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .doordrop-print { display: block !important; }
          .doordrop-print-table thead { display: table-header-group; }
          .doordrop-print-table tr { break-inside: avoid; page-break-inside: avoid; }
        }
        .doordrop-print { box-sizing: border-box; width: 100%; max-width: 186mm; margin: 0 auto; color: #142033; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.45; }
        .doordrop-print *, .doordrop-print *::before, .doordrop-print *::after { box-sizing: border-box; }
        .doordrop-print-topline { display: flex; justify-content: space-between; color: #64748b; font-size: 8px; margin-bottom: 14px; }
        .doordrop-print-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding-bottom: 18px; border-bottom: 2px solid #e11d2e; }
        .doordrop-print-logo { display: block; width: 148px; max-height: 42px; object-fit: contain; object-position: left center; }
        .doordrop-print-kicker { color: #2563eb; font-size: 9px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; }
        .doordrop-print-title { margin: 3px 0 0; color: #101827; font-size: 25px; font-weight: 800; line-height: 1.1; }
        .doordrop-print-subtitle { margin-top: 5px; color: #64748b; font-size: 10px; }
        .doordrop-print-number { min-width: 118px; padding: 9px 11px; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff; text-align: right; }
        .doordrop-print-number-label { color: #64748b; font-size: 8px; text-transform: uppercase; }
        .doordrop-print-number-value { margin-top: 2px; color: #142033; font-size: 10px; font-weight: 700; }
        .doordrop-print-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
        .doordrop-print-card { padding: 12px 13px; border: 1px solid #dbe4f0; border-radius: 10px; background: #ffffff; }
        .doordrop-print-card-label { color: #64748b; font-size: 8px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
        .doordrop-print-card-title { margin-top: 4px; color: #101827; font-size: 12px; font-weight: 800; }
        .doordrop-print-card-line { margin-top: 2px; color: #475569; font-size: 9px; }
        .doordrop-print-summary { display: grid; grid-template-columns: 1.55fr 1fr 1fr; gap: 8px; margin-top: 10px; }
        .doordrop-print-summary-item { padding: 10px 11px; border-radius: 9px; background: #eff6ff; }
        .doordrop-print-summary-item:nth-child(2) { background: #f0fdf4; }
        .doordrop-print-summary-item:nth-child(3) { background: #fff7ed; }
        .doordrop-print-summary-label { color: #64748b; font-size: 8px; font-weight: 700; text-transform: uppercase; }
        .doordrop-print-summary-value { margin-top: 3px; color: #142033; font-size: 10px; font-weight: 700; }
        .doordrop-print-section-title { margin: 19px 0 8px; color: #101827; font-size: 13px; font-weight: 800; }
        .doordrop-print-plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .doordrop-print-plan { padding: 9px 10px; border: 1px solid #dbe4f0; border-radius: 9px; background: #ffffff; }
        .doordrop-print-plan-active { border-color: #2563eb; background: #eff6ff; }
        .doordrop-print-plan-name { color: #142033; font-size: 9px; font-weight: 800; }
        .doordrop-print-plan-discount { margin-top: 2px; color: #16a34a; font-size: 9px; font-weight: 700; }
        .doordrop-print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
        .doordrop-print-table th { padding: 8px 6px; background: #101827; color: #ffffff; font-size: 8px; font-weight: 700; text-align: left; }
        .doordrop-print-table th:first-child { width: 22%; }
        .doordrop-print-table th:nth-child(2) { width: 16%; }
        .doordrop-print-table th:nth-child(3) { width: 16%; }
        .doordrop-print-table th:nth-child(n+4) { width: 15.33%; text-align: right; }
        .doordrop-print-table td { padding: 7px 6px; border-bottom: 1px solid #e5eaf1; color: #334155; vertical-align: top; }
        .doordrop-print-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .doordrop-print-table td:nth-child(n+4) { color: #142033; font-weight: 700; text-align: right; white-space: nowrap; }
        .doordrop-print-table td:first-child { color: #142033; font-weight: 800; }
        .doordrop-print-note { margin-top: 9px; color: #64748b; font-size: 8.5px; }
        .doordrop-print-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 20px; padding-top: 11px; border-top: 1px solid #dbe4f0; color: #64748b; font-size: 8px; }
        .doordrop-print-footer strong { color: #142033; }
      `}</style>
      <div className="doordrop-print">
        <div className="doordrop-print-topline"><span>{printCopy.website}</span><span>{printCopy.date}: {printDate}</span></div>
        <header className="doordrop-print-header">
          <div>
            <img className="doordrop-print-logo" src={brand.logoWordmarkUrl || brand.logoUrl} alt={brand.siteName || 'DoorDrop'} />
            <div className="doordrop-print-kicker">{brand.tagline || 'Plataforma de envíos'}</div>
            <h1 className="doordrop-print-title">{printCopy.title}</h1>
            <div className="doordrop-print-subtitle">{copy.subtitle}</div>
          </div>
          <div className="doordrop-print-number"><div className="doordrop-print-number-label">{printCopy.quoteNumber}</div><div className="doordrop-print-number-value">{quoteNumber}</div></div>
        </header>

        <div className="doordrop-print-two-col">
          <div className="doordrop-print-card"><div className="doordrop-print-card-label">{printCopy.issuedBy}</div><div className="doordrop-print-card-title">{brand.siteName || 'DoorDrop'}</div><div className="doordrop-print-card-line">{brand.tagline || 'Plataforma de envíos'}</div><div className="doordrop-print-card-line">{printCopy.website} | {printCopy.support}</div></div>
          <div className="doordrop-print-card"><div className="doordrop-print-card-label">{printCopy.client}</div><div className="doordrop-print-card-title">{clientName}</div><div className="doordrop-print-card-line">{printCopy.valid}: {printCopy.validValue}</div></div>
        </div>

        <div className="doordrop-print-summary">
          <div className="doordrop-print-summary-item"><div className="doordrop-print-summary-label">{printCopy.route}</div><div className="doordrop-print-summary-value">{countryLabel(form.originCountry)} {form.originZip} -&gt; {countryLabel(form.destCountry)} {form.destZip}</div></div>
          <div className="doordrop-print-summary-item"><div className="doordrop-print-summary-label">{printCopy.package}</div><div className="doordrop-print-summary-value">{selectedWeight} kg</div></div>
          <div className="doordrop-print-summary-item"><div className="doordrop-print-summary-label">{printCopy.dimensions}</div><div className="doordrop-print-summary-value">{standardPackage ? printCopy.standardPackage : `${dimensions.length} x ${dimensions.width} x ${dimensions.height} cm`}</div></div>
        </div>

        <h2 className="doordrop-print-section-title">{printCopy.options}</h2>
        <table className="doordrop-print-table">
          <thead><tr><th>{printCopy.carrier}</th><th>{printCopy.service}</th><th>{printCopy.mode}</th>{plans.map((plan) => <th key={plan.planId}>{plan.planName}<br />{plan.discountPercent ? `-${plan.discountPercent}%` : '0%'}</th>)}</tr></thead>
          <tbody>{printRows.map((row) => { const quote = row.quotes[selectedWeight]; return <tr key={row.key}><td>{row.courier}</td><td>{row.service}</td><td>{row.mode}</td>{plans.map((plan) => <td key={plan.planId}>{priceTextForPlan(quote, plan.planId)}</td>)}</tr>; })}</tbody>
        </table>
        {visibleRows.length > printRows.length && <div className="doordrop-print-note">{printCopy.moreOptions} {visibleRows.length} {copy.results} encontradas.</div>}
        <div className="doordrop-print-footer"><span><strong>{brand.siteName || 'DoorDrop'}</strong> | {printCopy.website} | {printCopy.support}</span><span>{printCopy.footer}</span></div>
      </div>
    </section>
    </>
  );
}
