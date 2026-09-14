import React, { useState } from 'react';
import { Sparkles, Image as ImageIcon, Type, RotateCw, ZoomIn, ZoomOut, Check, AlertCircle, X, Layers } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface PodDesignerProps {
  productTitle: string;
  mockupUrl?: string;
  onClose: () => void;
  onSaveDesign?: (designData: any) => void;
  featureFlagEnabled?: boolean;
}

export default function PodDesigner({
  productTitle,
  mockupUrl,
  onClose,
  onSaveDesign,
  featureFlagEnabled = false
}: PodDesignerProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');
  const [customText, setCustomText] = useState('');
  const [textColor, setTextColor] = useState('#000000');
  const [fontSize, setFontSize] = useState(24);
  const [zoom, setZoom] = useState(100);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">
                {t('pod_custom_title') || 'Personalizar Producto'}
              </h3>
              <p className="text-xs text-slate-500 truncate max-w-md">{productTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-dark-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feature Flag Notice si la API de Contrado no soporta aún custom upload dinámico */}
        {!featureFlagEnabled && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Modo de Previsualización Oficial</p>
              <p className="opacity-90">
                Este artículo se fabrica bajo pedido según las especificaciones técnicas y acabados certificados por Contrado. La carga de artes personalizadas dinámicas se encuentra en validación de API.
              </p>
            </div>
          </div>
        )}

        {/* Designer Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 p-6">
          {/* Canvas Area */}
          <div className="md:col-span-8 flex flex-col items-center justify-center bg-slate-50 dark:bg-dark-950 rounded-2xl p-6 relative border border-slate-200 dark:border-slate-800 min-h-[350px]">
            {/* View Tabs */}
            <div className="absolute top-4 left-4 flex gap-1 bg-white dark:bg-dark-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('front')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'front'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Frente
              </button>
              <button
                onClick={() => setActiveTab('back')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'back'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Dorso
              </button>
            </div>

            {/* Mockup Display */}
            <div className="relative max-w-xs w-full aspect-square flex items-center justify-center">
              {mockupUrl ? (
                <img
                  src={mockupUrl}
                  alt={productTitle}
                  className="w-full h-full object-contain filter drop-shadow-md"
                />
              ) : (
                <div className="text-center text-slate-400">
                  <ImageIcon className="w-16 h-16 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Mockup de Producto POD</p>
                </div>
              )}

              {/* Text Layer Preview */}
              {customText && (
                <div
                  className="absolute font-black tracking-wide select-none pointer-events-none"
                  style={{
                    color: textColor,
                    fontSize: `${fontSize}px`,
                    textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }}
                >
                  {customText}
                </div>
              )}
            </div>

            {/* Controls Bar */}
            <div className="absolute bottom-4 flex items-center gap-2 bg-white dark:bg-dark-800 px-3 py-1.5 rounded-xl shadow border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-1 hover:text-indigo-600">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono font-bold w-12 text-center">{zoom}%</span>
              <button onClick={() => setZoom(Math.min(150, zoom + 10))} className="p-1 hover:text-indigo-600">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tools Panel */}
          <div className="md:col-span-4 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Herramientas de Diseño</p>

              {/* Text Input */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-indigo-600" /> Añadir Texto / Personalización
                </label>
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Escribe tu texto..."
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-bold">Color:</span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                </div>
              </div>

              {/* Image Upload placeholder */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-indigo-600" /> Cargar Logotipo / Imagen
                </label>
                <input
                  type="file"
                  disabled={!featureFlagEnabled}
                  accept="image/png, image/jpeg"
                  className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button
                onClick={() => {
                  if (onSaveDesign) onSaveDesign({ text: customText, color: textColor, tab: activeTab });
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Aplicar y Continuar
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
