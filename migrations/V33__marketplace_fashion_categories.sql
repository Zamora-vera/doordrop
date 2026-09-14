-- DoorDrop V33: categorie moda gerarchiche per cataloghi reali del marketplace.
-- Idempotente: riusa la categoria principale "moda" esistente.

INSERT INTO marketplace_categories (slug, name, icon, sort_order, is_active, parent_id)
SELECT seed.slug, seed.name, seed.icon, seed.sort_order, 1, parent.id
FROM marketplace_categories parent
JOIN (
  SELECT 'moda-abiti' slug, 'Abiti' name, 'dress' icon, 10 sort_order UNION ALL
  SELECT 'moda-top-camicie', 'Top e Camicie', 'shirt', 20 UNION ALL
  SELECT 'moda-pantaloni', 'Pantaloni e Gonne', 'pants', 30 UNION ALL
  SELECT 'moda-capispalla', 'Giacche e Cappotti', 'jacket', 40 UNION ALL
  SELECT 'moda-calzature', 'Calzature', 'shoe', 50 UNION ALL
  SELECT 'moda-accessori', 'Accessori Moda', 'bag', 60 UNION ALL
  SELECT 'moda-intimo', 'Intimo e Nightwear', 'sparkles', 70
) seed
LEFT JOIN marketplace_categories existing ON existing.slug = seed.slug
WHERE parent.slug = 'moda' AND existing.id IS NULL;

INSERT IGNORE INTO marketplace_category_translations (category_id, locale, name)
SELECT category.id, translations.locale, translations.name
FROM marketplace_categories category
JOIN (
  SELECT 'moda-abiti' slug, 'es' locale, 'Vestidos' name UNION ALL SELECT 'moda-abiti','en','Dresses' UNION ALL SELECT 'moda-abiti','fr','Robes' UNION ALL SELECT 'moda-abiti','de','Kleider' UNION ALL
  SELECT 'moda-top-camicie','es','Tops y Camisas' UNION ALL SELECT 'moda-top-camicie','en','Tops & Shirts' UNION ALL SELECT 'moda-top-camicie','fr','Hauts et Chemises' UNION ALL SELECT 'moda-top-camicie','de','Tops und Hemden' UNION ALL
  SELECT 'moda-pantaloni','es','Pantalones y Faldas' UNION ALL SELECT 'moda-pantaloni','en','Trousers & Skirts' UNION ALL SELECT 'moda-pantaloni','fr','Pantalons et Jupes' UNION ALL SELECT 'moda-pantaloni','de','Hosen und Röcke' UNION ALL
  SELECT 'moda-capispalla','es','Chaquetas y Abrigos' UNION ALL SELECT 'moda-capispalla','en','Jackets & Coats' UNION ALL SELECT 'moda-capispalla','fr','Vestes et Manteaux' UNION ALL SELECT 'moda-capispalla','de','Jacken und Mäntel' UNION ALL
  SELECT 'moda-calzature','es','Calzado' UNION ALL SELECT 'moda-calzature','en','Footwear' UNION ALL SELECT 'moda-calzature','fr','Chaussures' UNION ALL SELECT 'moda-calzature','de','Schuhe' UNION ALL
  SELECT 'moda-accessori','es','Accesorios de Moda' UNION ALL SELECT 'moda-accessori','en','Fashion Accessories' UNION ALL SELECT 'moda-accessori','fr','Accessoires de Mode' UNION ALL SELECT 'moda-accessori','de','Modeaccessoires' UNION ALL
  SELECT 'moda-intimo','es','Ropa Interior y Noche' UNION ALL SELECT 'moda-intimo','en','Lingerie & Nightwear' UNION ALL SELECT 'moda-intimo','fr','Lingerie et Nuit' UNION ALL SELECT 'moda-intimo','de','Wäsche und Nachtwäsche'
) translations ON translations.slug = category.slug;
