import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Marketplace } from './Marketplace';
import { ProductPage } from './ProductPage';
import { SellerPage } from './SellerPage';
import MarketplaceTermsDocument from '../components/MarketplaceTermsDocument';

export default function MarketplaceApp() {
  return (
    <div data-no-runtime-translate="true">
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/terms" element={<MarketplaceTermsDocument />} />
        <Route path="/categoria/:categorySlug" element={<Marketplace />} />
        <Route path="/category/:categorySlug" element={<Marketplace />} />
        <Route path="/producto/:slug" element={<ProductPage />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/listings/:slug" element={<ProductPage />} />
        <Route path="/vendedor/:slug" element={<SellerPage />} />
        <Route path="/sellers/:slug" element={<SellerPage />} />
        <Route path="/seller/:slug" element={<SellerPage />} />
      </Routes>
    </div>
  );
}
