import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, ShieldAlert, Sliders, Box, Layers } from 'lucide-react';

interface CameraMeasureProps {
  onConfirmMeasure: (weight: string) => void;
}

export function CameraMeasure({ onConfirmMeasure }: CameraMeasureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Dimensions state (in cm)
  const [width, setWidth] = useState(30);
  const [length, setLength] = useState(40);
  const [height, setHeight] = useState(20);
  const [density, setDensity] = useState('medium'); // light (cardboard), medium (regular), heavy (metals/liquid)

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Volumetric weight computation: (W * L * H) / 5000
  const volume = width * length * height;
  const volumetricWeight = (volume / 5000);
  
  // Density multipliers to estimate actual physical weight
  const densityMultiplier = density === 'light' ? 0.6 : density === 'heavy' ? 1.4 : 1.0;
  const estimatedWeight = (volumetricWeight * densityMultiplier).toFixed(1);

  // Start back-camera
  const startCamera = async () => {
    try {
      setErrorMessage('');
      const constraints = {
        video: {
          facingMode: 'environment', // prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setHasPermission(true);
      setCameraActive(true);
    } catch (err: any) {
      console.warn('[Camera] Failed to open back camera, trying any camera:', err);
      // Fallback to any camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setHasPermission(true);
        setCameraActive(true);
      } catch (innerErr: any) {
        console.error('[Camera] Access denied or unavailable:', innerErr);
        setHasPermission(false);
        setErrorMessage('La cámara no está disponible o el navegador denegó el acceso (común en vistas previas iframe). Mostrando calibrador virtual interactivo.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  // Handle canvas drawing overlay (wireframe 3D box)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const drawOverlay = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 30;

      // Sizing scales for drawing
      const scale = 2.0;
      const dx = width * scale;
      const dy = length * scale;
      const dz = height * scale;

      ctx.save();
      ctx.translate(cx, cy);

      // Define standard isometric coordinates
      const isoProject = (x: number, y: number, z: number) => {
        // Isometric formula: x_screen = (x - y) * cos(30), y_screen = (x + y) * sin(30) - z
        const cos30 = 0.866;
        const sin30 = 0.5;
        return {
          x: (x - y) * cos30,
          y: (x + y) * sin30 - z
        };
      };

      // 8 Points of the 3D box
      const p0 = isoProject(-dx/2, -dy/2, 0);   // Bottom-back
      const p1 = isoProject(dx/2, -dy/2, 0);    // Bottom-right
      const p2 = isoProject(dx/2, dy/2, 0);     // Bottom-front
      const p3 = isoProject(-dx/2, dy/2, 0);    // Bottom-left
      const p4 = isoProject(-dx/2, -dy/2, dz);  // Top-back
      const p5 = isoProject(dx/2, -dy/2, dz);   // Top-right
      const p6 = isoProject(dx/2, dy/2, dz);    // Top-front
      const p7 = isoProject(-dx/2, dy/2, dz);   // Top-left

      // Draw grid helper background line
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        const gStart1 = isoProject(-120, i * 30, 0);
        const gEnd1 = isoProject(120, i * 30, 0);
        ctx.beginPath();
        ctx.moveTo(gStart1.x, gStart1.y);
        ctx.lineTo(gEnd1.x, gEnd1.y);
        ctx.stroke();

        const gStart2 = isoProject(i * 30, -120, 0);
        const gEnd2 = isoProject(i * 30, 120, 0);
        ctx.beginPath();
        ctx.moveTo(gStart2.x, gStart2.y);
        ctx.lineTo(gEnd2.x, gEnd2.y);
        ctx.stroke();
      }

      // Draw dashed bottom face edges (hidden inside)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();

      // Draw solid edges
      ctx.setLineDash([]);
      ctx.strokeStyle = '#00F0FF'; // neon-cyan
      ctx.lineWidth = 3;

      // Bottom visible edges
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      // Verticals
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p7.x, p7.y);
      ctx.moveTo(p2.x, p2.y); ctx.lineTo(p6.x, p6.y);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p5.x, p5.y);
      ctx.stroke();

      // Top face
      ctx.beginPath();
      ctx.moveTo(p4.x, p4.y);
      ctx.lineTo(p5.x, p5.y);
      ctx.lineTo(p6.x, p6.y);
      ctx.lineTo(p7.x, p7.y);
      ctx.closePath();
      ctx.stroke();

      // Fill faces with semi-transparent tech colors
      ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p6.x, p6.y);
      ctx.lineTo(p7.x, p7.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(112, 0, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p5.x, p5.y);
      ctx.lineTo(p6.x, p6.y);
      ctx.closePath();
      ctx.fill();

      // Highlight nodes (vertices)
      ctx.fillStyle = '#00F0FF';
      [p1, p2, p3, p5, p6, p7].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Label dimensions on edges
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;

      // Width label (p2 -> p3 side)
      const midW = { x: (p2.x + p3.x) / 2 - 10, y: (p2.y + p3.y) / 2 + 15 };
      ctx.fillText(`Ancho: ${width} cm`, midW.x, midW.y);

      // Length label (p1 -> p2 side)
      const midL = { x: (p1.x + p2.x) / 2 + 15, y: (p1.y + p2.y) / 2 + 15 };
      ctx.fillText(`Largo: ${length} cm`, midL.x, midL.y);

      // Height label (p2 -> p6 side)
      const midH = { x: p2.x + 10, y: (p2.y + p6.y) / 2 };
      ctx.fillText(`Alto: ${height} cm`, midH.x, midH.y);

      ctx.restore();

      animationId = requestAnimationFrame(drawOverlay);
    };

    drawOverlay();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [width, length, height, isOpen]);

  const handleApply = () => {
    onConfirmMeasure(estimatedWeight);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full mt-2.5 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-blue-600/10 to-cyan-500/10 dark:from-neon-cyan/20 dark:to-neon-green/10 border border-blue-500/30 dark:border-neon-cyan/30 rounded-xl text-blue-600 dark:text-neon-cyan font-bold text-xs uppercase tracking-wider hover:bg-blue-600/20 transition-all cursor-pointer shadow-sm hover:shadow-neon-cyan/15"
      >
        <Camera className="w-4 h-4" />
        Medir con Cámara / PWA
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 flex flex-col items-center justify-center p-4 md:p-6 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
                  <Box className="w-5 h-5 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Escáner de Dimensiones AR</h3>
                  <p className="text-[10px] text-cyan-400/80 font-mono">Calibrador Tridimensional en Tiempo Real</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera View and Canvas */}
            <div className="relative flex-1 bg-black min-h-[260px] md:min-h-[340px] flex items-center justify-center overflow-hidden">
              
              {/* Fallback pattern background if camera access is pending or blocked */}
              {!cameraActive && (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-center p-6 border-b border-slate-800">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                    <Layers className="w-8 h-8 text-slate-500 animate-pulse" />
                  </div>
                  <p className="text-slate-400 text-xs font-bold max-w-sm mb-2">{errorMessage || "Iniciando feed de cámara..."}</p>
                  <p className="text-[10px] text-slate-600">Puedes usar las barras deslizadoras inferiores para ajustar las medidas de forma manual e interactiva.</p>
                </div>
              )}

              {/* HTML5 Live Video Feed */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover opacity-60"
              />

              {/* Canvas Overlay for 3D box wireframe drawing */}
              <canvas
                ref={canvasRef}
                width={500}
                height={320}
                className="relative z-10 w-full h-full max-w-[500px] max-h-[320px] pointer-events-none"
              />

              {/* Target Aim Guidelines */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border border-white/20 rounded-full flex items-center justify-center">
                  <div className="w-32 h-32 border border-dashed border-white/10 rounded-full"></div>
                </div>
                <div className="absolute w-8 h-0.5 bg-cyan-400"></div>
                <div className="absolute h-8 w-0.5 bg-cyan-400"></div>
              </div>

              {/* Floating Camera Flip / Refresh status */}
              {hasPermission && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="absolute bottom-4 right-4 z-20 p-2.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-cyan-400 hover:text-cyan-300 rounded-xl transition backdrop-blur flex items-center gap-1.5 text-[10px] font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> RE-VINCULAR
                </button>
              )}
            </div>

            {/* Controls & Calculations */}
            <div className="p-5 border-t border-slate-800 bg-slate-900/90 flex flex-col gap-4">
              
              {/* Sizing Sliders */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                    <span>Largo (L)</span>
                    <span className="text-cyan-400 font-mono">{length} cm</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                    <span>Ancho (W)</span>
                    <span className="text-cyan-400 font-mono">{width} cm</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                    <span>Alto (H)</span>
                    <span className="text-cyan-400 font-mono">{height} cm</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>

              {/* Density Options & Estimates */}
              <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Densidad:</span>
                  <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setDensity('light')}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                        density === 'light' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Ligero (Cartón)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDensity('medium')}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                        density === 'medium' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Estándar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDensity('heavy')}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                        density === 'heavy' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Pesado (Metal)
                    </button>
                  </div>
                </div>

                {/* Live Estimator Dashboard */}
                <div className="flex items-center gap-6 bg-slate-950 px-4 py-2.5 rounded-2xl border border-slate-800 w-full sm:w-auto justify-around sm:justify-start">
                  <div className="text-center sm:text-left">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Volumen</span>
                    <span className="text-sm font-black text-white font-mono">{(volume / 1000).toFixed(1)} L</span>
                  </div>
                  <div className="w-px h-6 bg-slate-800"></div>
                  <div className="text-center sm:text-left">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Peso Vol.</span>
                    <span className="text-sm font-black text-cyan-400 font-mono">{volumetricWeight.toFixed(1)} kg</span>
                  </div>
                  <div className="w-px h-6 bg-slate-800"></div>
                  <div className="text-center sm:text-left">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Peso Estimado</span>
                    <span className="text-base font-black text-green-400 font-mono">{estimatedWeight} kg</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl transition text-xs uppercase tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-black rounded-xl transition text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/15 animate-pulse"
                >
                  <Check className="w-4 h-4" /> Aplicar Medida ({estimatedWeight} kg)
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
