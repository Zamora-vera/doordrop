import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { api, getAuthToken } from '../lib/api';

export const IntegrationCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const save = async () => {
      try {
        if (!getAuthToken()) {
          setStatus('error');
          return;
        }
        const payload: Record<string, string> = {};
        searchParams.forEach((value, key) => { payload[key] = value; });
        const token = payload.access_token || payload.accessToken || payload.token;
        if (!token) {
          setStatus('error');
          return;
        }
        await api.saveEcartCallback(payload);
        setStatus('success');
        setTimeout(() => navigate('/panel/stores'), 1800);
      } catch {
        setStatus('error');
      }
    };
    save();
  }, [searchParams, navigate]);

  return (
    <div className="p-8 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
      {status === 'loading' && (
        <>
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Conectando tu tienda...</h2>
          <p className="text-gray-500">Estamos guardando la conexión de forma segura.</p>
        </>
      )}
      {status === 'success' && (
        <>
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Tienda conectada con éxito</h2>
          <p className="text-gray-500">Ya puedes sincronizar pedidos y preparar envíos.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
            <XCircle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No se pudo completar la operación</h2>
          <p className="text-gray-500 mb-6">Vuelve a iniciar la conexión desde Integraciones.</p>
          <button onClick={() => navigate('/panel/stores')} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200">
            Volver a integraciones
          </button>
        </>
      )}
    </div>
  );
};
