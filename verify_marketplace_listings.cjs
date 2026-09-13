(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/marketplace/listings?limit=5');
    const data = await res.json();
    console.log('Total listings in Marketplace:', data.total);
    console.log('\nSample 3 items:');
    (data.listings || []).slice(0, 3).forEach((l, i) => {
      console.log(`[${i+1}] ${l.title}`);
      console.log(`    Prezzo: ${(l.price_minor / 100).toFixed(2)} ${l.currency}`);
      console.log(`    Venditore: ${l.seller_name}`);
      console.log(`    Immagine: ${l.cover_image}`);
      console.log(`    Slug: ${l.slug}\n`);
    });
  } catch (err) {
    console.error('Error:', err);
  }
})();
