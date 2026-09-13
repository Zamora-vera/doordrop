const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || 'E-qmf2BbM797N)',
    database: 'doordrop_ship24go'
  });

  console.log('Connected to MySQL successfully');

  // 1. Insert extra users
  await conn.query(`
    INSERT INTO users (id, email, password_hash, role, is_seller, first_name, last_name)
    VALUES 
      ('usr_seller_madrid_001', 'iberica.retro@doordrop.store', '$2b$10$dummyhashdummyhashdummyhashdu', 'customer', 1, 'Carlos', 'Gómez'),
      ('usr_seller_berlin_002', 'berlin.audio@doordrop.store', '$2b$10$dummyhashdummyhashdummyhashdu', 'customer', 1, 'Hans', 'Müller')
    ON DUPLICATE KEY UPDATE is_seller=1
  `);

  // 2. Insert seller profiles
  await conn.query(`
    INSERT INTO marketplace_seller_profiles 
      (id, user_id, display_name, slug, description, country, city, seller_type, verification_level, avg_rating, total_sales, total_ratings)
    VALUES 
      ('sel_carlos_madrid', 'usr_seller_madrid_001', 'Retro & Gaming Madrid', 'retro-gaming-madrid', 'Especialista en consolas, fotografía y coleccionismo en Madrid. Envíos el mismo día vía DoorDrop.', 'ES', 'Madrid', 'business', 'verified', 4.95, 68, 64),
      ('sel_hans_berlin', 'usr_seller_berlin_002', 'Berlin Audio & Tech', 'berlin-audio-tech', 'High-end audio, laptops y tecnología revisada profesionalmente con garantía.', 'DE', 'Berlin', 'business', 'verified', 4.98, 112, 108)
    ON DUPLICATE KEY UPDATE verification_level='verified'
  `);

  // 3. Insert listings
  const listings = [
    {
      id: 'lst_sony_xm5_006',
      seller_id: 'sel_hans_berlin',
      category_id: 1,
      title: 'Sony WH-1000XM5 Auriculares Cancelación de Ruido (Negro)',
      slug: 'sony-wh-1000xm5-negro-berlin-8841',
      description: 'Auriculares inalámbricos premium Sony WH-1000XM5 con cancelación de ruido líder en el sector. Comprados hace 3 meses, muy poco uso. Con funda rígida original y cable jack de 3.5mm.',
      condition: 'like_new',
      price_minor: 27900,
      currency: 'EUR',
      city: 'Berlin',
      country_code: 'DE',
      postal_code: '10115',
      weight_grams: 850,
      length_cm: 24,
      width_cm: 22,
      height_cm: 7,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 590,
      status: 'active',
      view_count: 56,
      favorite_count: 14,
      images: [
        { id: 'img_sony_1', url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=900&q=80', cover: 1 },
        { id: 'img_sony_2', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80', cover: 0 }
      ]
    },
    {
      id: 'lst_macbook_m2_007',
      seller_id: 'sel_carlos_madrid',
      category_id: 1,
      title: 'MacBook Air 13.6 M2 256GB SSD - Gris Espacial 100% Batería',
      slug: 'macbook-air-m2-madrid-9921',
      description: 'Portátil Apple MacBook Air con chip M2, 8GB de RAM unificada y 256GB SSD ultrarrápido. Batería con solo 14 ciclos de carga (100% de salud). Incluye cargador MagSafe 3 original y caja.',
      condition: 'like_new',
      price_minor: 84000,
      currency: 'EUR',
      city: 'Madrid',
      country_code: 'ES',
      postal_code: '28001',
      weight_grams: 2200,
      length_cm: 34,
      width_cm: 25,
      height_cm: 6,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 990,
      status: 'active',
      view_count: 120,
      favorite_count: 38,
      images: [
        { id: 'img_macbook_1', url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80', cover: 1 },
        { id: 'img_macbook_2', url: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=900&q=80', cover: 0 }
      ]
    },
    {
      id: 'lst_switch_zelda_008',
      seller_id: 'sel_carlos_madrid',
      category_id: 1,
      title: 'Nintendo Switch OLED Edición Especial Zelda: Tears of the Kingdom',
      slug: 'nintendo-switch-oled-zelda-madrid-3142',
      description: 'Consola Nintendo Switch versión OLED edición coleccionista Zelda TOTK. Pantalla impecable sin rayones protegida con cristal templado desde el primer día. Dock con motivos dorados y Joy-Cons especiales.',
      condition: 'excellent',
      price_minor: 28500,
      currency: 'EUR',
      city: 'Madrid',
      country_code: 'ES',
      postal_code: '28004',
      weight_grams: 1600,
      length_cm: 26,
      width_cm: 21,
      height_cm: 11,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 590,
      status: 'active',
      view_count: 145,
      favorite_count: 46,
      images: [
        { id: 'img_switch_1', url: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=900&q=80', cover: 1 },
        { id: 'img_switch_2', url: 'https://images.unsplash.com/photo-1612287233215-6825cbb0299f?w=900&q=80', cover: 0 }
      ]
    },
    {
      id: 'lst_canon_r50_009',
      seller_id: 'sel_john_morfe_001',
      category_id: 1,
      title: 'Cámara Mirrorless Canon EOS R50 + Objetivo RF-S 18-45mm IS STM',
      slug: 'canon-eos-r50-kit-milano-5421',
      description: 'Cámara híbrida compacta Canon EOS R50 ideal para fotografía de viajes y creación de contenido en 4K. Incluye zoom estabilizado 18-45mm, batería LP-E17, cargador y correa oficial Canon.',
      condition: 'new',
      price_minor: 58000,
      currency: 'EUR',
      city: 'Milano',
      country_code: 'IT',
      postal_code: '20121',
      weight_grams: 1100,
      length_cm: 22,
      width_cm: 18,
      height_cm: 14,
      negotiable: 0,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 690,
      status: 'active',
      view_count: 78,
      favorite_count: 22,
      images: [
        { id: 'img_canon_1', url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900&q=80', cover: 1 },
        { id: 'img_canon_2', url: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=900&q=80', cover: 0 }
      ]
    },
    {
      id: 'lst_jordan1_retro_010',
      seller_id: 'sel_john_morfe_001',
      category_id: 2,
      title: 'Zapatillas Nike Air Jordan 1 Retro High OG Chicago Lost & Found (Talla 43)',
      slug: 'nike-jordan-1-chicago-lost-found-milano-7721',
      description: 'Auténticas Jordan 1 Chicago Lost & Found compradas en SNKRS. Nuevas a estrenar con cordones de recambio, papel de recibo vintage de los 80s y caja original intacta. 100% originales verificadas.',
      condition: 'new',
      price_minor: 34000,
      currency: 'EUR',
      city: 'Milano',
      country_code: 'IT',
      postal_code: '20124',
      weight_grams: 1500,
      length_cm: 36,
      width_cm: 25,
      height_cm: 14,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 650,
      status: 'active',
      view_count: 210,
      favorite_count: 65,
      images: [
        { id: 'img_jordan_1', url: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=900&q=80', cover: 1 },
        { id: 'img_jordan_2', url: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=900&q=80', cover: 0 }
      ]
    },
    {
      id: 'lst_northface_011',
      seller_id: 'sel_carlos_madrid',
      category_id: 2,
      title: 'Chaqueta The North Face 1996 Retro Nuptse Plumas 700 - Talla M',
      slug: 'north-face-retro-nuptse-700-madrid-1124',
      description: 'Icónica chaqueta acolchada The North Face en color negro clásico. Relleno de pluma de ganso de 700 cuins con gran poder térmico. Capucha plegable en el cuello y tejido ripstop hidrófugo.',
      condition: 'excellent',
      price_minor: 18000,
      currency: 'EUR',
      city: 'Madrid',
      country_code: 'ES',
      postal_code: '28013',
      weight_grams: 950,
      length_cm: 35,
      width_cm: 28,
      height_cm: 12,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 550,
      status: 'active',
      view_count: 94,
      favorite_count: 31,
      images: [
        { id: 'img_tnf_1', url: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=900&q=80', cover: 1 }
      ]
    },
    {
      id: 'lst_steamdeck_012',
      seller_id: 'sel_hans_berlin',
      category_id: 1,
      title: 'Steam Deck OLED 512GB con Estuche Rígido + Tarjeta SD 256GB',
      slug: 'steam-deck-oled-512gb-berlin-4412',
      description: 'Consola portátil Valve Steam Deck OLED con pantalla HDR de 90Hz, 512GB NVMe ultrarrápido y batería de 50Wh. Incluye estuche protector original, cargador oficial y tarjeta microSD Samsung EVO 256GB.',
      condition: 'like_new',
      price_minor: 46500,
      currency: 'EUR',
      city: 'Berlin',
      country_code: 'DE',
      postal_code: '10117',
      weight_grams: 1400,
      length_cm: 32,
      width_cm: 16,
      height_cm: 10,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 690,
      status: 'active',
      view_count: 175,
      favorite_count: 53,
      images: [
        { id: 'img_deck_1', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=900&q=80', cover: 1 }
      ]
    },
    {
      id: 'lst_roborock_013',
      seller_id: 'sel_carlos_madrid',
      category_id: 3,
      title: 'Robot Aspirador y Fregasuelos Roborock S8 - Potencia 6000Pa',
      slug: 'roborock-s8-robot-madrid-6632',
      description: 'Robot aspirador con navegación láser LiDAR de precisión y doble cepillo de goma DuoRoller. Potente succión de 6000Pa y sistema de fregado sónico VibraRise. Con filtro HEPA nuevo de repuesto.',
      condition: 'excellent',
      price_minor: 36000,
      currency: 'EUR',
      city: 'Madrid',
      country_code: 'ES',
      postal_code: '28020',
      weight_grams: 5200,
      length_cm: 42,
      width_cm: 42,
      height_cm: 16,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 990,
      status: 'active',
      view_count: 67,
      favorite_count: 19,
      images: [
        { id: 'img_roborock_1', url: 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=900&q=80', cover: 1 }
      ]
    },
    {
      id: 'lst_eureka_mignon_014',
      seller_id: 'sel_john_morfe_001',
      category_id: 3,
      title: 'Molinillo de Café Espresso Eureka Mignon Specialità 55mm (Cromo)',
      slug: 'eureka-mignon-specialita-milano-8891',
      description: 'Molinillo profesional fabricado a mano en Florencia. Muelas planas de acero endurecido de 55 mm, pantalla táctil con doble dosis programable y tecnología silenciosa Silent Technology.',
      condition: 'like_new',
      price_minor: 32000,
      currency: 'EUR',
      city: 'Milano',
      country_code: 'IT',
      postal_code: '20121',
      weight_grams: 5800,
      length_cm: 38,
      width_cm: 24,
      height_cm: 18,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 890,
      status: 'active',
      view_count: 52,
      favorite_count: 17,
      images: [
        { id: 'img_eureka_1', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=900&q=80', cover: 1 }
      ]
    },
    {
      id: 'lst_xiaomi_scooter_015',
      seller_id: 'sel_carlos_madrid',
      category_id: 4,
      title: 'Patinete Eléctrico Xiaomi Mi Electric Scooter Pro 2 (45km de autonomía)',
      slug: 'xiaomi-scooter-pro-2-madrid-3301',
      description: 'Patinete con motor de 300W (600W pico), velocidad máxima de 25 km/h y batería de largo alcance de hasta 45 km. Ruedas neumáticas de 8.5 pulgadas con sistema de doble frenado regenerativo E-ABS.',
      condition: 'good',
      price_minor: 26000,
      currency: 'EUR',
      city: 'Madrid',
      country_code: 'ES',
      postal_code: '28028',
      weight_grams: 14200,
      length_cm: 115,
      width_cm: 52,
      height_cm: 22,
      negotiable: 1,
      shipping_available: 1,
      pickup_available: 1,
      shipping_from_minor: 1490,
      status: 'active',
      view_count: 115,
      favorite_count: 36,
      images: [
        { id: 'img_scooter_1', url: 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=900&q=80', cover: 1 }
      ]
    }
  ];

  for (const item of listings) {
    await conn.query(`
      INSERT INTO marketplace_listings 
        (id, seller_id, category_id, title, slug, description, \`condition\`, price_minor, currency, city, country_code, postal_code, weight_grams, length_cm, width_cm, height_cm, negotiable, shipping_available, pickup_available, shipping_from_minor, status, view_count, favorite_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title=VALUES(title), price_minor=VALUES(price_minor), status=VALUES(status)
    `, [
      item.id, item.seller_id, item.category_id, item.title, item.slug, item.description, item.condition, item.price_minor, item.currency, item.city, item.country_code, item.postal_code, item.weight_grams, item.length_cm, item.width_cm, item.height_cm, item.negotiable, item.shipping_available, item.pickup_available, item.shipping_from_minor, item.status, item.view_count, item.favorite_count
    ]);

    for (let i = 0; i < item.images.length; i++) {
      const img = item.images[i];
      await conn.query(`
        INSERT INTO marketplace_listing_images (id, listing_id, url, sort_order, is_cover)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE url=VALUES(url), is_cover=VALUES(is_cover)
      `, [img.id, item.id, img.url, i + 1, img.cover]);
    }
  }

  console.log('Successfully inserted all 10 premium listings and images!');
  await conn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
