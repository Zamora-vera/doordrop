const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtimeFile = path.join(root, 'src/lang/finalRuntimeCleanup.ts');
const mainFile = path.join(root, 'src/main.tsx');
const swFile = path.join(root, 'public/sw.js');

const code = String.raw`
type Lang = 'es' | 'en' | 'it' | 'fr' | 'de' | 'zh';

const normalizeLang = (value?: string | null): Lang => {
  const raw = String(value || '').toLowerCase();
  if (raw.startsWith('it')) return 'it';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('zh') || raw.startsWith('cn')) return 'zh';
  if (raw.startsWith('en')) return 'en';
  return 'es';
};

const currentLang = (): Lang => normalizeLang(
  localStorage.getItem('ship24go_lang') ||
  localStorage.getItem('ship24go_language') ||
  localStorage.getItem('enviox_lang') ||
  document.documentElement.lang ||
  'es'
);

const entries: Array<{ sources: string[]; t: Record<Lang, string> }> = [
  {
    sources: ['Etiqueta lista', 'Label ready', 'Etichetta pronta', 'Étiquette prête', 'Etikett bereit', '标签已就绪'],
    t: { es: 'Etiqueta lista', en: 'Label ready', it: 'Etichetta pronta', fr: 'Étiquette prête', de: 'Etikett bereit', zh: '标签已就绪' }
  },
  {
    sources: ['Etiqueta en preparación', 'Preparando etiqueta', 'Preparing', 'Label in preparation', 'Etichetta in preparazione', 'Étiquette en préparation', 'Etikett wird vorbereitet', '标签准备中'],
    t: { es: 'Etiqueta en preparación', en: 'Label in preparation', it: 'Etichetta in preparazione', fr: 'Étiquette en préparation', de: 'Etikett wird vorbereitet', zh: '标签准备中' }
  },
  {
    sources: ['Final price', 'Final Price', 'PRECIO FINAL', 'Precio final', 'PREZZO FINALE', 'Prezzo finale', 'PRIX FINAL', 'Prix final', 'ENDPREIS', 'Endpreis', '最终价格'],
    t: { es: 'Precio final', en: 'Final price', it: 'Prezzo finale', fr: 'Prix final', de: 'Endpreis', zh: '最终价格' }
  },
  {
    sources: ['Copilote IA (SQL)', 'Copiloto AI (SQL)', 'AI Copilot (SQL)', 'Copilota AI (SQL)', 'KI-Copilot (SQL)', 'AI 助手 (SQL)'],
    t: { es: 'Copiloto AI', en: 'AI Copilot', it: 'Copilota IA', fr: 'Copilote IA', de: 'KI-Assistent', zh: 'AI 助手' }
  },
  {
    sources: ['Integraciones', 'Integrations', 'Integrazioni', 'Intégrations', 'Integrationen', '集成'],
    t: { es: 'Integraciones', en: 'Integrations', it: 'Integrazioni', fr: 'Intégrations', de: 'Integrationen', zh: '集成' }
  },
  {
    sources: ['Facturación & Saldo', 'Billing & Wallet', 'Fatturazione e saldo', 'Facturation et solde', 'Abrechnung & Guthaben', '账单与钱包'],
    t: { es: 'Facturación & Saldo', en: 'Billing & Wallet', it: 'Fatturazione e saldo', fr: 'Facturation et solde', de: 'Abrechnung & Guthaben', zh: '账单与钱包' }
  },
  {
    sources: ['Resuelve tus consultas logísticas con soporte inteligente.', 'Resolve your logistics questions with smart support.'],
    t: {
      es: 'Resuelve tus consultas logísticas con soporte inteligente.',
      en: 'Resolve your logistics questions with smart support.',
      it: 'Risolvi le tue domande logistiche con supporto intelligente.',
      fr: 'Résolvez vos questions logistiques avec une assistance intelligente.',
      de: 'Kläre deine Logistikfragen mit intelligenter Unterstützung.',
      zh: '通过智能支持解决你的物流问题。'
    }
  },
  {
    sources: ['Service Summary', 'Resumen de Servicio', 'Resumen del servicio', 'Riepilogo del servizio', 'RÉSUMÉ DU SERVICE', 'Récapitulatif du service', 'Serviceübersicht', '服务摘要'],
    t: { es: 'Resumen del servicio', en: 'Service summary', it: 'Riepilogo del servizio', fr: 'Récapitulatif du service', de: 'Serviceübersicht', zh: '服务摘要' }
  },
  {
    sources: ['Your Wallet', 'Tu Monedero', 'Mi wallet', 'Il tuo portafoglio', 'Votre portefeuille', 'Dein Guthaben', '你的钱包'],
    t: { es: 'Tu monedero', en: 'Your wallet', it: 'Il tuo portafoglio', fr: 'Votre portefeuille', de: 'Dein Guthaben', zh: '你的钱包' }
  },
  {
    sources: ['Sufficient available balance.', 'Saldo disponible suficiente.', 'Saldo disponibile sufficiente.', 'Solde disponible suffisant.', 'Ausreichendes Guthaben verfügbar.', '可用余额充足。'],
    t: { es: 'Saldo disponible suficiente.', en: 'Sufficient available balance.', it: 'Saldo disponibile sufficiente.', fr: 'Solde disponible suffisant.', de: 'Ausreichendes Guthaben verfügbar.', zh: '可用余额充足。' }
  },
  {
    sources: ['Pay and generate label immediately', 'Pagar y generar etiqueta de inmediato', 'Paga e genera subito l’etichetta', 'Payer et générer l’étiquette immédiatement', 'Sofort bezahlen und Etikett erstellen', '立即付款并生成标签'],
    t: { es: 'Pagar y generar etiqueta de inmediato', en: 'Pay and generate label immediately', it: 'Paga e genera subito l’etichetta', fr: 'Payer et générer l’étiquette immédiatement', de: 'Sofort bezahlen und Etikett erstellen', zh: '立即付款并生成标签' }
  },
  {
    sources: ['Pay and Create Real Shipment', 'Pagar y Crear Envío Real', 'Paga e crea spedizione reale', 'Payer et créer l’expédition réelle', 'Bezahlen und echte Sendung erstellen', '付款并创建真实运单'],
    t: { es: 'Pagar y crear envío real', en: 'Pay and create real shipment', it: 'Paga e crea spedizione reale', fr: 'Payer et créer l’expédition réelle', de: 'Bezahlen und echte Sendung erstellen', zh: '付款并创建真实运单' }
  },
  {
    sources: ['Back to Quotes', 'Volver a Cotizaciones', 'Volver a cotizaciones', 'Torna ai preventivi', 'Retour aux devis', 'Zurück zu Tarifen', '返回报价'],
    t: { es: 'Volver a cotizaciones', en: 'Back to quotes', it: 'Torna ai preventivi', fr: 'Retour aux devis', de: 'Zurück zu Tarifen', zh: '返回报价' }
  },
  {
    sources: ['Authorized points', 'Puntos autorizados', 'PUNTOS AUTORIZADOS', 'Punti autorizzati', 'Points autorisés', 'Autorisierte Punkte', '授权网点'],
    t: { es: 'Puntos autorizados', en: 'Authorized points', it: 'Punti autorizzati', fr: 'Points autorisés', de: 'Autorisierte Punkte', zh: '授权网点' }
  },
  {
    sources: ['Selecciona los puntos requeridos para este servicio', 'Select the required points for this service'],
    t: {
      es: 'Selecciona los puntos requeridos para este servicio',
      en: 'Select the required points for this service',
      it: 'Seleziona i punti richiesti per questo servizio',
      fr: 'Sélectionnez les points requis pour ce service',
      de: 'Wähle die erforderlichen Punkte für diesen Service aus',
      zh: '请选择此服务所需的网点'
    }
  },
  {
    sources: ['Los puntos disponibles vienen directamente de la red logística y se muestran en Google Maps.'],
    t: {
      es: 'Los puntos disponibles vienen directamente de la red logística y se muestran en Google Maps.',
      en: 'Available points come directly from the logistics network and are shown on Google Maps.',
      it: 'I punti disponibili provengono direttamente dalla rete logistica e sono mostrati su Google Maps.',
      fr: 'Les points disponibles proviennent directement du réseau logistique et sont affichés sur Google Maps.',
      de: 'Verfügbare Punkte kommen direkt vom Logistiknetzwerk und werden auf Google Maps angezeigt.',
      zh: '可用网点直接来自物流网络，并显示在 Google Maps 上。'
    }
  },
  {
    sources: ['Punto de recogida', 'Pickup point', 'Punto di ritiro', 'Point de dépôt', 'Abgabepunkt', '取件点'],
    t: { es: 'Punto de recogida', en: 'Pickup point', it: 'Punto di ritiro', fr: 'Point de dépôt', de: 'Abgabepunkt', zh: '取件点' }
  },
  {
    sources: ['Punto de entrega', 'Delivery point', 'Punto di consegna', 'Point de livraison', 'Lieferpunkt', '派送点'],
    t: { es: 'Punto de entrega', en: 'Delivery point', it: 'Punto di consegna', fr: 'Point de livraison', de: 'Lieferpunkt', zh: '派送点' }
  },
  {
    sources: ['Selecciona un punto para continuar.', 'Select a point to continue.', 'Seleziona un punto per continuare.', 'Sélectionnez un point pour continuer.', 'Wähle einen Punkt aus, um fortzufahren.', '请选择一个网点继续。'],
    t: { es: 'Selecciona un punto para continuar.', en: 'Select a point to continue.', it: 'Seleziona un punto per continuare.', fr: 'Sélectionnez un point pour continuer.', de: 'Wähle einen Punkt aus, um fortzufahren.', zh: '请选择一个网点继续。' }
  },
  {
    sources: ['Elegir punto de recogida', 'Choose pickup point', 'Scegli punto di ritiro', 'Choisir le point de dépôt', 'Abgabepunkt wählen', '选择取件点'],
    t: { es: 'Elegir punto de recogida', en: 'Choose pickup point', it: 'Scegli punto di ritiro', fr: 'Choisir le point de dépôt', de: 'Abgabepunkt wählen', zh: '选择取件点' }
  },
  {
    sources: ['Elegir punto de entrega', 'Choose delivery point', 'Scegli punto di consegna', 'Choisir le point de livraison', 'Lieferpunkt wählen', '选择派送点'],
    t: { es: 'Elegir punto de entrega', en: 'Choose delivery point', it: 'Scegli punto di consegna', fr: 'Choisir le point de livraison', de: 'Lieferpunkt wählen', zh: '选择派送点' }
  },
  {
    sources: ['Sender Details', 'Datos del Remitente', 'Dati del mittente', 'Informations de l’expéditeur', 'Absenderdaten', '发件人信息'],
    t: { es: 'Datos del remitente', en: 'Sender details', it: 'Dati del mittente', fr: 'Informations de l’expéditeur', de: 'Absenderdaten', zh: '发件人信息' }
  },
  {
    sources: ['Recipient Details', 'Datos del Destinatario', 'Dati del destinatario', 'Informations du destinataire', 'Empfängerdaten', '收件人信息'],
    t: { es: 'Datos del destinatario', en: 'Recipient details', it: 'Dati del destinatario', fr: 'Informations du destinataire', de: 'Empfängerdaten', zh: '收件人信息' }
  },
  {
    sources: ['-- Use saved address --', '-- Usar Dirección Guardada --', '-- Usa indirizzo salvato --', '-- Utiliser une adresse enregistrée --', '-- Gespeicherte Adresse verwenden --', '-- 使用已保存地址 --'],
    t: { es: '-- Usar dirección guardada --', en: '-- Use saved address --', it: '-- Usa indirizzo salvato --', fr: '-- Utiliser une adresse enregistrée --', de: '-- Gespeicherte Adresse verwenden --', zh: '-- 使用已保存地址 --' }
  },
  {
    sources: ['Search the street in the origin country', 'Busca la calle en el país de origen', 'Cerca la via nel paese di origine', 'Rechercher la rue dans le pays d’origine', 'Straße im Absenderland suchen', '搜索发件国家的街道'],
    t: { es: 'Busca la calle en el país de origen', en: 'Search the street in the origin country', it: 'Cerca la via nel paese di origine', fr: 'Rechercher la rue dans le pays d’origine', de: 'Straße im Absenderland suchen', zh: '搜索发件国家的街道' }
  },
  {
    sources: ['Search the street in the destination country', 'Busca la calle en el país de destino', 'Cerca la via nel paese di destinazione', 'Rechercher la rue dans le pays de destination', 'Straße im Zielland suchen', '搜索目的地国家的街道'],
    t: { es: 'Busca la calle en el país de destino', en: 'Search the street in the destination country', it: 'Cerca la via nel paese di destinazione', fr: 'Rechercher la rue dans le pays de destination', de: 'Straße im Zielland suchen', zh: '搜索目的地国家的街道' }
  },
  {
    sources: ['Sugerencias de Google activas para España. Selecciona una dirección de la lista.'],
    t: {
      es: 'Sugerencias de Google activas para España. Selecciona una dirección de la lista.',
      en: 'Google suggestions are active for Spain. Select an address from the list.',
      it: 'I suggerimenti Google sono attivi per la Spagna. Seleziona un indirizzo dalla lista.',
      fr: 'Les suggestions Google sont actives pour l’Espagne. Sélectionnez une adresse dans la liste.',
      de: 'Google-Vorschläge sind für Spanien aktiv. Wähle eine Adresse aus der Liste.',
      zh: 'Google 建议已为西班牙启用。请从列表中选择地址。'
    }
  },
  {
    sources: ['Required data to generate the label without delays', 'Datos necesarios para generar la etiqueta sin retrasos'],
    t: {
      es: 'Datos necesarios para generar la etiqueta sin retrasos',
      en: 'Required data to generate the label without delays',
      it: 'Dati necessari per generare l’etichetta senza ritardi',
      fr: 'Données nécessaires pour générer l’étiquette sans retard',
      de: 'Erforderliche Daten, um das Etikett ohne Verzögerung zu erstellen',
      zh: '无延迟生成标签所需的数据'
    }
  },
  {
    sources: ['Selecciona la dirección sugerida por Google en el país correcto. El número cívico, ciudad y código postal deben quedar completos antes de generar la etiqueta. En envíos internacionales agrega contenido real, valor declarado y datos de mercancía.'],
    t: {
      es: 'Selecciona la dirección sugerida por Google en el país correcto. El número cívico, ciudad y código postal deben quedar completos antes de generar la etiqueta. En envíos internacionales agrega contenido real, valor declarado y datos de mercancía.',
      en: 'Select the Google suggested address in the correct country. Street number, city and postal code must be complete before generating the label. For international shipments, add real contents, declared value and goods details.',
      it: 'Seleziona l’indirizzo suggerito da Google nel paese corretto. Numero civico, città e codice postale devono essere completi prima di generare l’etichetta. Per spedizioni internazionali, aggiungi contenuto reale, valore dichiarato e dati della merce.',
      fr: 'Sélectionnez l’adresse suggérée par Google dans le bon pays. Le numéro de rue, la ville et le code postal doivent être complets avant de générer l’étiquette. Pour les envois internationaux, ajoutez le contenu réel, la valeur déclarée et les détails de la marchandise.',
      de: 'Wähle die von Google vorgeschlagene Adresse im richtigen Land. Hausnummer, Stadt und Postleitzahl müssen vollständig sein, bevor das Etikett erstellt wird. Für internationale Sendungen müssen Inhalt, deklarierter Wert und Warenangaben ergänzt werden.',
      zh: '请选择正确国家中 Google 建议的地址。生成标签前，门牌号、城市和邮政编码必须完整。国际运单需要填写真实内容、申报价值和货物信息。'
    }
  },
  {
    sources: ['Goods & Value Details', 'Detalles de Mercancía & Valor', 'Dettagli merce e valore', 'Détails de marchandise et valeur', 'Waren- und Wertangaben', '货物与价值详情'],
    t: { es: 'Detalles de mercancía y valor', en: 'Goods & value details', it: 'Dettagli merce e valore', fr: 'Détails de marchandise et valeur', de: 'Waren- und Wertangaben', zh: '货物与价值详情' }
  },
  {
    sources: ['Route:', 'Trayecto:', 'Percorso:', 'Trajet :', 'Route:', '路线：'],
    t: { es: 'Trayecto:', en: 'Route:', it: 'Percorso:', fr: 'Trajet :', de: 'Route:', zh: '路线：' }
  },
  {
    sources: ['Estimated delivery:', 'Entrega estimada:', 'Consegna stimata:', 'Livraison estimée :', 'Geschätzte Lieferung:', '预计送达：'],
    t: { es: 'Entrega estimada:', en: 'Estimated delivery:', it: 'Consegna stimata:', fr: 'Livraison estimée :', de: 'Geschätzte Lieferung:', zh: '预计送达：' }
  },
  {
    sources: ['Total packages:', 'Bultos totales:', 'Pacchi totali:', 'Nombre total de colis :', 'Pakete gesamt:', '包裹总数：'],
    t: { es: 'Bultos totales:', en: 'Total packages:', it: 'Pacchi totali:', fr: 'Nombre total de colis :', de: 'Pakete gesamt:', zh: '包裹总数：' }
  },
  {
    sources: ['Pickup:', 'Recogida:', 'Ritiro:', 'Dépôt :', 'Abgabe:', '取件：'],
    t: { es: 'Recogida:', en: 'Pickup:', it: 'Ritiro:', fr: 'Dépôt :', de: 'Abgabe:', zh: '取件：' }
  },
  {
    sources: ['Delivery:', 'Entrega:', 'Consegna:', 'Livraison :', 'Lieferung:', '派送：'],
    t: { es: 'Entrega:', en: 'Delivery:', it: 'Consegna:', fr: 'Livraison :', de: 'Lieferung:', zh: '派送：' }
  },
  {
    sources: ['Total Price:', 'Precio Total:', 'Prezzo totale:', 'Prix total :', 'Gesamtpreis:', '总价：'],
    t: { es: 'Precio total:', en: 'Total price:', it: 'Prezzo totale:', fr: 'Prix total :', de: 'Gesamtpreis:', zh: '总价：' }
  },
  {
    sources: ['Dashboard', 'Panel', 'Pannello', 'Tableau de bord', 'Übersicht', '概览'],
    t: { es: 'Panel', en: 'Dashboard', it: 'Pannello', fr: 'Tableau de bord', de: 'Übersicht', zh: '概览' }
  },
  {
    sources: ['My Shipments', 'My shipments', 'Mis envíos', 'Le mie spedizioni', 'Mes expéditions', 'Meine Sendungen', '我的运单'],
    t: { es: 'Mis envíos', en: 'My shipments', it: 'Le mie spedizioni', fr: 'Mes expéditions', de: 'Meine Sendungen', zh: '我的运单' }
  },
  {
    sources: ['New shipment', 'Nuevo envío', 'Nuova spedizione', 'Nouvel envoi', 'Neue Sendung', '新运单'],
    t: { es: 'Nuevo envío', en: 'New shipment', it: 'Nuova spedizione', fr: 'Nouvel envoi', de: 'Neue Sendung', zh: '新运单' }
  },
  {
    sources: ['Request cancellation', 'Solicitar cancelación', 'Richiedi annullamento', 'Demander l’annulation', 'Stornierung anfordern', '申请取消'],
    t: { es: 'Solicitar cancelación', en: 'Request cancellation', it: 'Richiedi annullamento', fr: 'Demander l’annulation', de: 'Stornierung anfordern', zh: '申请取消' }
  },
  {
    sources: ['Terms', 'Condiciones', 'Termini', 'Conditions', 'Bedingungen', '条款'],
    t: { es: 'Condiciones', en: 'Terms', it: 'Termini', fr: 'Conditions', de: 'Bedingungen', zh: '条款' }
  },
  {
    sources: ['Edit', 'Modificar', 'Modifica', 'Modifier', 'Bearbeiten', '编辑'],
    t: { es: 'Modificar', en: 'Edit', it: 'Modifica', fr: 'Modifier', de: 'Bearbeiten', zh: '编辑' }
  },
  {
    sources: ['Panel language', 'Idioma del panel', 'Lingua del pannello', 'Langue du panneau', 'Sprache des Panels', '面板语言'],
    t: { es: 'Idioma del panel', en: 'Panel language', it: 'Lingua del pannello', fr: 'Langue du panneau', de: 'Sprache des Panels', zh: '面板语言' }
  },
  {
    sources: ['Panel currency', 'Moneda del panel', 'Valuta del pannello', 'Devise du panneau', 'Panel-Währung', '面板货币'],
    t: { es: 'Moneda del panel', en: 'Panel currency', it: 'Valuta del pannello', fr: 'Devise du panneau', de: 'Panel-Währung', zh: '面板货币' }
  },
  {
    sources: ['Appearance', 'Apariencia', 'Aspetto', 'Apparence', 'Darstellung', '外观'],
    t: { es: 'Apariencia', en: 'Appearance', it: 'Aspetto', fr: 'Apparence', de: 'Darstellung', zh: '外观' }
  },
  {
    sources: ['Light', 'Claro', 'Chiaro', 'Clair', 'Hell', '浅色'],
    t: { es: 'Claro', en: 'Light', it: 'Chiaro', fr: 'Clair', de: 'Hell', zh: '浅色' }
  },
  {
    sources: ['Dark', 'Oscuro', 'Scuro', 'Sombre', 'Dunkel', '深色'],
    t: { es: 'Oscuro', en: 'Dark', it: 'Scuro', fr: 'Sombre', de: 'Dunkel', zh: '深色' }
  },
  {
    sources: ['Automatic', 'Automático', 'Automatico', 'Automatique', 'Automatisch', '自动'],
    t: { es: 'Automático', en: 'Automatic', it: 'Automatico', fr: 'Automatique', de: 'Automatisch', zh: '自动' }
  },
  {
    sources: ['Billing settings', 'Configuración de facturación', 'Impostazioni di fatturazione', 'Paramètres de facturation', 'Abrechnungseinstellungen', '账单设置'],
    t: { es: 'Configuración de facturación', en: 'Billing settings', it: 'Impostazioni di fatturazione', fr: 'Paramètres de facturation', de: 'Abrechnungseinstellungen', zh: '账单设置' }
  },
  {
    sources: ['Business name', 'Nombre comercial', 'Nome azienda', 'Nom commercial', 'Firmenname', '企业名称'],
    t: { es: 'Nombre comercial', en: 'Business name', it: 'Nome azienda', fr: 'Nom commercial', de: 'Firmenname', zh: '企业名称' }
  },
  {
    sources: ['Account email', 'Correo de la cuenta', 'Email account', 'Email du compte', 'Konto-E-Mail', '账户邮箱'],
    t: { es: 'Correo de la cuenta', en: 'Account email', it: 'Email account', fr: 'Email du compte', de: 'Konto-E-Mail', zh: '账户邮箱' }
  },
  {
    sources: ['Operating country', 'País operativo', 'Paese operativo', 'Pays d’activité', 'Betriebsland', '运营国家'],
    t: { es: 'País operativo', en: 'Operating country', it: 'Paese operativo', fr: 'Pays d’activité', de: 'Betriebsland', zh: '运营国家' }
  },
  {
    sources: ['Default currency', 'Moneda predeterminada', 'Valuta predefinita', 'Devise par défaut', 'Standardwährung', '默认货币'],
    t: { es: 'Moneda predeterminada', en: 'Default currency', it: 'Valuta predefinita', fr: 'Devise par défaut', de: 'Standardwährung', zh: '默认货币' }
  },
  {
    sources: ['Save settings', 'Guardar configuración', 'Salva configurazione', 'Enregistrer la configuration', 'Einstellungen speichern', '保存设置'],
    t: { es: 'Guardar configuración', en: 'Save settings', it: 'Salva configurazione', fr: 'Enregistrer la configuration', de: 'Einstellungen speichern', zh: '保存设置' }
  },
  {
    sources: ['España', 'Spain', 'Spagna', 'Espagne', 'Spanien', '西班牙', '🇪🇸 España'],
    t: { es: 'España', en: 'Spain', it: 'Spagna', fr: 'Espagne', de: 'Spanien', zh: '西班牙' }
  },
  {
    sources: ['Alemania', 'Germany', 'Germania', 'Allemagne', 'Deutschland', '德国', '🇩🇪 Alemania'],
    t: { es: 'Alemania', en: 'Germany', it: 'Germania', fr: 'Allemagne', de: 'Deutschland', zh: '德国' }
  }
];

const index = new Map<string, Record<Lang, string>>();
for (const item of entries) {
  for (const src of item.sources) index.set(src.trim(), item.t);
}

const blocked = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

function translateValue(value: string): string {
  const lang = currentLang();
  let out = value.replace(/&ndash;/g, '–');
  const trimmed = out.trim();
  const found = index.get(trimmed);
  if (!found) {
    if (/\(SQL\)/.test(trimmed)) {
      out = out.replace(/\s*\(SQL\)/g, '');
    }
    return out;
  }
  const next = found[lang] || found.en || found.es || trimmed;
  return out.replace(trimmed, next);
}

function walk(node: Node) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.nodeValue || '';
    const next = translateValue(value);
    if (next !== value) node.nodeValue = next;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (blocked.has(el.tagName)) return;

  ['placeholder', 'title', 'aria-label'].forEach((attr) => {
    const value = el.getAttribute(attr);
    if (!value) return;
    const next = translateValue(value);
    if (next !== value) el.setAttribute(attr, next);
  });

  el.childNodes.forEach(walk);
}

function run() {
  try { walk(document.body); } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', run);
  window.addEventListener('ship24go:language-changed', run);
  document.addEventListener('DOMContentLoaded', run);

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });

  let count = 0;
  const timer = window.setInterval(() => {
    run();
    count++;
    if (count > 24) window.clearInterval(timer);
  }, 250);
}

export {};
`;

fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
fs.writeFileSync(runtimeFile, code, 'utf8');

if (fs.existsSync(mainFile)) {
  let main = fs.readFileSync(mainFile, 'utf8');
  if (!main.includes("./lang/finalRuntimeCleanup") && !main.includes("'./lang/finalRuntimeCleanup'")) {
    main = `import './lang/finalRuntimeCleanup';\n` + main;
    fs.writeFileSync(mainFile, main, 'utf8');
  }
}

if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, 'utf8');
  sw = sw.replace(/ship24go-shell-v[0-9a-zA-Z_.-]+/g, 'ship24go-shell-v1428');
  sw = sw.replace(/CACHE_NAME\s*=\s*['"][^'"]+['"]/, "CACHE_NAME = 'ship24go-shell-v1428'");
  fs.writeFileSync(swFile, sw, 'utf8');
}

const report = [
  '# Ship24Go V1.4.28 — Final language cleanup',
  '',
  `Fecha: ${new Date().toISOString()}`,
  '',
  'Aplicado:',
  '- Etiqueta lista / Etiqueta en preparación',
  '- Final price / Precio final',
  '- Limpieza de (SQL) en Copiloto IA',
  '- Textos pendientes de /panel/settings',
  '- Textos pendientes de quote, wallet, servicio, puntos y envíos',
  '- Cache PWA actualizado a ship24go-shell-v1428',
  '',
  'No modifica proveedores, compra de labels, Ecart API, wallet ni base de datos.'
].join('\n');

fs.mkdirSync(path.join(root, 'diagnostico'), { recursive: true });
fs.writeFileSync(path.join(root, 'diagnostico', `LANG_FINAL_CLEANUP_V1_4_28_${new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)}.md`), report, 'utf8');

console.log('V1.4.28 aplicado: limpieza final de idioma.');
