import { Routes, Route, Navigate } from 'react-router-dom';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import PublicPages from './pages/Public';
import AuthPages from './pages/Auth';
import CustomerPanel from './pages/CustomerPanel';
import AdminPanel from './pages/AdminPanel';
import { IntegrationCallback } from './pages/IntegrationCallback';
import { BrandProvider } from './lib/brand';
import MarketplaceApp from './pages/MarketplaceApp';

export default function App() {
  return (
    <BrandProvider>
      <Routes>
        <Route path="/marketplace/*" element={<MarketplaceApp />} />
        <Route path="/auth/*" element={<AuthPages />} />
        <Route path="/panel/*" element={<CustomerPanel />} />
        <Route path="/admin/*" element={<AdminPanel />} />
        <Route path="/es/customer/integeration" element={<IntegrationCallback />} />
        <Route path="/customer/integration" element={<IntegrationCallback />} />
        <Route path="/*" element={<PublicPages />} />
      </Routes>
      <PwaInstallBanner />
    </BrandProvider>
  );
}
