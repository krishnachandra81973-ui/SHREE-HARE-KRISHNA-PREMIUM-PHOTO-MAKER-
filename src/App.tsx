/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, 
  Printer, 
  Trash2, 
  Plus, 
  Minus, 
  Settings2, 
  Image as ImageIcon,
  Loader2,
  Check,
  Download,
  Crop,
  Eraser,
  Paintbrush,
  RotateCcw,
  Sparkles,
  X,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import Cropper from 'react-easy-crop';
import getCroppedImg from './utils/cropImage';
import { removeBackgroundClient } from './utils/backgroundRemoval';

// Constants for Passport Size (Standard 3.5cm x 4.5cm)
const PASSPORT_WIDTH_MM = 35;
const PASSPORT_HEIGHT_MM = 45;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const DPI = 96; // Standard screen DPI for preview, we'll use mm for printing

export default function App() {
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [photoWidth, setPhotoWidth] = useState(33);
  const [photoHeight, setPhotoHeight] = useState(42);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [borderThickness, setBorderThickness] = useState(1);
  const [photoGap, setPhotoGap] = useState(2);
  const [pageMargin, setPageMargin] = useState(1);
  const [photoCount, setPhotoCount] = useState(6);
  const [brightness, setBrightness] = useState(100);
  const [photoBgColor, setPhotoBgColor] = useState('#FFFFFF');
  const [bgTolerance, setBgTolerance] = useState(35);
  const [isUsingLocalFallback, setIsUsingLocalFallback] = useState(false);
  const [removalMethod, setRemovalMethod] = useState<'cloud' | 'local'>('cloud');
  const [customPickedBgColor, setCustomPickedBgColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [autoCleanSpots, setAutoCleanSpots] = useState(true);
  const [isSamplingBgColor, setIsSamplingBgColor] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [studioLogo, setStudioLogo] = useState<string | null>(() => localStorage.getItem('studioLogo') || null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
  };

  const bokehElements = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 150 + 50,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.4 + 0.1,
    }));
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setStudioLogo(result);
        localStorage.setItem('studioLogo', result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setRawImage(event.target?.result as string);
        setShowCropper(true);
        setSelectedImage(null);
        setProcessedImage(null);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropSave = async () => {
    if (rawImage && croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(rawImage, croppedAreaPixels);
        setSelectedImage(croppedImage);
        setShowCropper(false);
      } catch (e) {
        console.error(e);
        setError("Failed to crop image.");
      }
    }
  };

  const removeBackground = async (forceLocal = false) => {
    if (!selectedImage) return;
    
    setIsProcessing(true);
    setError(null);
    setIsUsingLocalFallback(false);
    
    if (forceLocal || removalMethod === 'local') {
      try {
        const localUrl = await removeBackgroundClient(selectedImage, bgTolerance, customPickedBgColor || undefined, autoCleanSpots);
        setProcessedImage(localUrl);
        setIsUsingLocalFallback(true);
      } catch (localErr: any) {
        console.error(localErr);
        setError("Local background removal failed. Using original image.");
        setProcessedImage(selectedImage);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/remove-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: selectedImage,
          bgColor: photoBgColor,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Background removal failed.");
      }

      const data = await res.json();

      if (data.imageUrl) {
        setProcessedImage(data.imageUrl);
      } else {
        throw new Error("Failed to process image. Please try again.");
      }
    } catch (err: any) {
      console.warn("AI background removal failed, falling back to local canvas removal...", err);
      try {
        const localUrl = await removeBackgroundClient(selectedImage, bgTolerance, customPickedBgColor || undefined, autoCleanSpots);
        setProcessedImage(localUrl);
        setIsUsingLocalFallback(true);
        setError("Notice: Cloud AI quota exceeded. Used high-precision local background removal instead!");
      } catch (localErr: any) {
        console.error("Local background removal failed too:", localErr);
        setError("Error removing background. Using original image instead.");
        setProcessedImage(selectedImage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (selectedImage) {
      if (removalMethod === 'local' || isUsingLocalFallback) {
        removeBackground(true);
      }
    }
  }, [bgTolerance, removalMethod, selectedImage, customPickedBgColor, autoCleanSpots]);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isSamplingBgColor || !selectedImage) return;

    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Scale coordinates to natural image dimensions
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const naturalX = Math.floor(x * scaleX);
    const naturalY = Math.floor(y * scaleY);

    // Create temporary canvas to read the pixel color
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      tempImg.onload = () => {
        ctx.drawImage(tempImg, naturalX, naturalY, 1, 1, 0, 0, 1, 1);
        const pixel = ctx.getImageData(0, 0, 1, 1).data;
        const color = { r: pixel[0], g: pixel[1], b: pixel[2] };
        setCustomPickedBgColor(color);
        setIsSamplingBgColor(false);
        setRemovalMethod('local');
        setTimeout(() => {
          removeBackground(true);
        }, 50);
      };
      tempImg.src = selectedImage;
    }
  };

  const enhancePhoto = async () => {
    if (!selectedImage && !processedImage) return;
    
    setIsEnhancing(true);
    setError(null);
    
    try {
      const res = await fetch('/api/enhance-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: processedImage || selectedImage,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Enhancement failed.");
      }

      const data = await res.json();

      if (data.imageUrl) {
        setProcessedImage(data.imageUrl);
      } else {
        throw new Error("Failed to enhance image.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Enhancement failed. Please try again.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    const printArea = document.getElementById('a4-container');
    if (!printArea) return;
    
    setIsDownloading(true);
    const watermark = document.getElementById('watermark');
    if (watermark) watermark.style.display = 'none';
    
    try {
      const canvas = await html2canvas(printArea, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      
      const image = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.href = image;
      link.download = `Shree-Hare-Krishna-A4-${Date.now()}.jpg`;
      link.click();
    } catch (err) {
      console.error(err);
      setError("Failed to generate high-res image.");
    } finally {
      if (watermark) watermark.style.display = 'flex';
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen animated-bg text-white font-sans selection:bg-sky-500/30 relative overflow-x-hidden">
      {/* Animated Background Visualizations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Bokeh Elements */}
        {bokehElements.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-white mix-blend-overlay"
            initial={{
              left: p.left,
              top: p.top,
              y: 0,
              x: 0,
              scale: 0.8,
            }}
            animate={{
              y: [0, -150, 0],
              x: [0, 100, 0],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: p.delay,
            }}
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              filter: `blur(${p.size / 5}px)`,
            }}
          />
        ))}

        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/40 blur-[120px]"
        />
        <motion.div
          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-[40%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-indigo-600/30 blur-[100px]"
        />
      </div>

      <div className="relative z-10">
        {/* Cropper Modal */}
        <AnimatePresence>
          {showCropper && rawImage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="glass-panel p-6 w-full max-w-2xl flex flex-col gap-6 rounded-2xl"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-sky-500 flex items-center gap-2">
                    <Crop size={16} /> Crop Photo
                  </h3>
                  <button onClick={() => setShowCropper(false)} className="text-slate-400 hover:text-white uppercase text-[10px] tracking-widest font-bold">Cancel</button>
                </div>
                <div className="relative w-full h-[50vh] bg-white rounded-2xl overflow-hidden border border-slate-200">
                  <Cropper
                    image={rawImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={photoWidth / photoHeight}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Zoom</label>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                  />
                </div>
                <button
                  onClick={handleCropSave}
                  className="w-full blue-gradient text-white py-4 text-xs font-bold uppercase tracking-widest hover:opacity-100 hover:shadow-[0_12px_40px_rgba(14,165,233,0.3)] hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_30px_rgba(14,165,233,0.2)] rounded-2xl"
                >
                  Apply Crop
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Premium Header */}
        <header className="bg-slate-950/80 backdrop-blur-2xl border border-white/10 shadow-2xl py-6 px-10 sticky top-4 z-50 mx-4 mt-4 rounded-3xl">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div 
                className="relative w-24 h-24 rounded-full bg-white flex items-center justify-center overflow-hidden border border-sky-200 shadow-[0_10px_40px_rgba(14,165,233,0.15)] shrink-0 cursor-pointer group"
                onClick={() => logoInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={logoInputRef} 
                  onChange={handleLogoChange} 
                  className="hidden" 
                  accept="image/*"
                />
                <img 
                  src={studioLogo || "/logo.svg"} 
                  alt="MANGLAM Logo" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x200/0A0A0A/BF953F?text=M'; }} 
                />
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-sky-500">Change Logo</span>
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-sans font-bold tracking-tight text-white drop-shadow-sm">
                  MANGLAM
                </h1>
                <div className="flex items-center gap-4">
                  <div className="h-[1px] w-12 blue-gradient opacity-50"></div>
                  <p className="text-[11px] font-sans font-medium uppercase tracking-[0.2em] text-slate-400">
                    Premium Quality Prints
                  </p>
                </div>
              </div>
            </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-4">
              {deferredPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="group relative flex items-center gap-3 bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/30 px-6 py-4 rounded-2xl font-sans font-medium uppercase tracking-widest text-xs hover:shadow-[0_8px_30px_rgba(14,165,233,0.15)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
                >
                  <Download size={16} className="text-sky-400 group-hover:scale-110 transition-transform duration-300" />
                  Install App
                </button>
              )}
              <a 
                href="/logo.svg" 
                download="manglam_studio_logo.svg"
                className="group relative flex items-center gap-3 bg-pink-500/15 border border-pink-500/20 text-pink-400 hover:bg-pink-500/25 px-6 py-4 rounded-2xl font-sans font-medium uppercase tracking-widest text-xs hover:shadow-[0_8px_30px_rgba(244,63,94,0.15)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
                title="Download Manglam Logo to your computer"
              >
                <Download size={16} className="text-pink-400 group-hover:scale-110 transition-transform duration-300" />
                Logo Download
              </a>
              <button 
                onClick={handleDownload}
                disabled={!selectedImage || isDownloading}
                className="group relative flex items-center gap-3 bg-white/10 border border-white/10 text-white px-8 py-4 rounded-2xl font-sans font-medium uppercase tracking-widest text-xs hover:bg-white/20 hover:shadow-[0_8px_30px_rgba(255,255,255,0.05)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-20 disabled:grayscale disabled:hover:translate-y-0"
              >
                {isDownloading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                Save A4 Image
              </button>
              <button 
                onClick={handlePrint}
                disabled={!selectedImage}
                className="group relative flex items-center gap-3 blue-gradient text-white px-10 py-4 rounded-2xl font-sans font-bold uppercase tracking-widest text-xs hover:opacity-100 hover:shadow-[0_15px_50px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-20 disabled:grayscale disabled:hover:translate-y-0 shadow-[0_10px_40px_rgba(14,165,233,0.25)]"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-10 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Controls Sidebar */}
        <motion.aside 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="lg:col-span-4 space-y-8"
        >
          {/* Step 1: Upload */}
          <section className="glass-panel p-8 relative overflow-hidden group rounded-2xl">
            <div className="absolute top-0 left-0 w-1 h-full blue-gradient opacity-50"></div>
            <h2 className="text-[11px] font-sans font-bold uppercase tracking-[0.3em] text-slate-300 mb-8 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full border border-sky-300 flex items-center justify-center text-[8px] text-sky-500">01</span>
              Capture Essence
            </h2>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative border border-white/10 aspect-[4/3] flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden rounded-2xl ${
                selectedImage ? 'bg-white' : 'hover:bg-white/10 hover:border-sky-300'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*"
              />
              {selectedImage ? (
                <div className="relative w-full h-full group/img">
                  <img 
                    src={selectedImage} 
                    alt="Preview" 
                    className={`w-full h-full object-cover opacity-80 group-hover/img:opacity-100 transition-opacity ${
                      isSamplingBgColor ? 'cursor-crosshair ring-2 ring-emerald-500' : ''
                    }`}
                    onClick={(e) => {
                      if (isSamplingBgColor) {
                        e.stopPropagation();
                        handleImageClick(e);
                      }
                    }}
                  />
                  {isSamplingBgColor ? (
                    <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                      <Paintbrush className="text-emerald-400 animate-pulse mb-2" size={24} />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Click Background To Pick Color</p>
                      <p className="text-[8px] text-slate-400 mt-1">Select any point of your original photo's background</p>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 flex items-end p-4 transition-all">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500">Replace Subject</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <Upload size={32} className="mx-auto text-sky-400/60" strokeWidth={1} />
                  <p className="text-[10px] font-bold uppercase tracking-tight text-slate-500">Select High-Res Portrait</p>
                </div>
              )}
            </div>

            {selectedImage && (
              <div className="space-y-4 mt-6">
                <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Removal Method</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRemovalMethod('cloud')}
                      className={`py-2 text-[9px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                        removalMethod === 'cloud' 
                          ? 'bg-sky-500/20 border-sky-500 text-sky-400' 
                          : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      Cloud AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemovalMethod('local')}
                      className={`py-2 text-[9px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                        removalMethod === 'local' 
                          ? 'bg-sky-500/20 border-sky-500 text-sky-400' 
                          : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      Local Engine
                    </button>
                  </div>

                  {(removalMethod === 'local' || isUsingLocalFallback) && (
                    <div className="space-y-3 mt-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-end">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tolerance (Edge Precision)</label>
                        <span className="text-[9px] font-mono text-sky-400">{bgTolerance}</span>
                      </div>
                      <input 
                        type="range" min="10" max="80" step="1" value={bgTolerance}
                        onChange={(e) => setBgTolerance(parseInt(e.target.value))}
                        className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                      />

                      <div className="flex flex-col gap-2 mt-2">
                        <div className="flex justify-between items-center text-[9px] uppercase tracking-wider text-slate-400">
                          <span>Target Background Color</span>
                          {customPickedBgColor && (
                            <button
                              type="button"
                              onClick={() => setCustomPickedBgColor(null)}
                              className="text-red-400 hover:text-red-300 font-bold hover:underline"
                            >
                              Reset Auto
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsSamplingBgColor(!isSamplingBgColor)}
                            className={`flex-1 py-1.5 px-3 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              isSamplingBgColor
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Paintbrush size={10} />
                            {isSamplingBgColor ? 'Sampling Mode ON...' : 'Pick Color From Photo'}
                          </button>
                          <div 
                            className="w-7 h-7 rounded-lg border border-white/20 shrink-0 shadow-inner"
                            style={{ 
                              backgroundColor: customPickedBgColor 
                                ? `rgb(${customPickedBgColor.r},${customPickedBgColor.g},${customPickedBgColor.b})` 
                                : 'transparent' 
                            }}
                            title={customPickedBgColor ? `Picked RGB: ${customPickedBgColor.r}, ${customPickedBgColor.g}, ${customPickedBgColor.b}` : 'Auto Corners Mode'}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Sparkles size={11} className="text-emerald-400" />
                          AI Auto Spot Clean (Dote Door Karein)
                        </span>
                        <button
                          type="button"
                          onClick={() => setAutoCleanSpots(!autoCleanSpots)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            autoCleanSpots ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              autoCleanSpots ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => removeBackground()}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-3 bg-white/10 border border-white/10 text-white py-4 text-[10px] font-bold uppercase tracking-tight hover:bg-white/20 hover:shadow-[0_8px_20px_rgba(255,255,255,0.05)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-20 disabled:hover:translate-y-0 rounded-2xl"
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin text-sky-500" size={16} />
                  ) : processedImage ? (
                    <Check className="text-sky-500" size={16} />
                  ) : (
                    <Settings2 className="text-sky-500/60" size={16} />
                  )}
                  {isProcessing ? "Refining Subject..." : processedImage ? "Subject Isolated" : (removalMethod === 'local' ? "Local Background Removal" : "AI Background Removal")}
                </button>

                <button
                  onClick={() => setShowRefineModal(true)}
                  className="w-full flex items-center justify-center gap-3 bg-indigo-900/30 border border-indigo-500/30 text-indigo-400 py-4 text-[10px] font-bold uppercase tracking-tight hover:bg-indigo-800/50 hover:text-white hover:shadow-[0_8px_20px_rgba(99,102,241,0.15)] hover:-translate-y-0.5 transition-all duration-300 rounded-2xl animate-pulse"
                >
                  <Eraser size={14} className="text-indigo-400 group-hover:text-white" />
                  Manual Touch-Up / Refine Mask
                </button>

                <button
                  onClick={enhancePhoto}
                  disabled={isEnhancing}
                  className="w-full flex items-center justify-center gap-3 bg-sky-900/30 border border-sky-500/30 text-sky-500 py-4 text-[10px] font-bold uppercase tracking-tight hover:bg-sky-800/50 hover:shadow-[0_8px_20px_rgba(14,165,233,0.1)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-20 disabled:hover:translate-y-0 rounded-2xl"
                >
                  {isEnhancing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Download className="rotate-180" size={16} />
                  )}
                  {isEnhancing ? "Enhancing Quality..." : "AI Quality Enhance"}
                </button>
              </div>
            )}
            
            {error && <p className="text-red-500 text-[10px] mt-4 text-center tracking-wider">{error}</p>}
          </section>

          {/* Step 2: Precision Controls */}
          <section className="glass-panel p-8 relative rounded-2xl">
            <div className="absolute top-0 left-0 w-1 h-full blue-gradient opacity-50"></div>
            <h2 className="text-[11px] font-sans font-bold uppercase tracking-[0.3em] text-slate-300 mb-10 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full border border-sky-500/30 flex items-center justify-center text-[8px] text-sky-500">02</span>
              Precision Tuning
            </h2>
            
            <div className="space-y-10">
              {/* Photo Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Width</label>
                    <span className="text-[10px] font-mono text-sky-500">{photoWidth}mm</span>
                  </div>
                  <input 
                    type="range" min="20" max="100" step="1" value={photoWidth}
                    onChange={(e) => setPhotoWidth(parseInt(e.target.value))}
                    className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Height</label>
                    <span className="text-[10px] font-mono text-sky-500">{photoHeight}mm</span>
                  </div>
                  <input 
                    type="range" min="20" max="150" step="1" value={photoHeight}
                    onChange={(e) => setPhotoHeight(parseInt(e.target.value))}
                    className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                  />
                </div>
              </div>

              {/* Border */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Border Weight</label>
                  <span className="text-[10px] font-mono text-sky-500">{borderThickness}pt</span>
                </div>
                <input 
                  type="range" min="0" max="10" step="0.5" value={borderThickness}
                  onChange={(e) => setBorderThickness(parseFloat(e.target.value))}
                  className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                />
              </div>

              {/* Brightness */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Brightness</label>
                  <span className="text-[10px] font-mono text-sky-500">{brightness}%</span>
                </div>
                <input 
                  type="range" min="50" max="150" step="1" value={brightness}
                  onChange={(e) => setBrightness(parseInt(e.target.value))}
                  className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                />
              </div>

              {/* Photo Background Color */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Background Color</label>
                  <span className="text-[10px] font-mono text-sky-500">{photoBgColor}</span>
                </div>
                <div className="flex gap-3">
                  {['#FFFFFF', '#0000FF', '#FF0000', '#87CEEB', '#000000'].map(color => (
                    <button
                      key={color}
                      onClick={() => setPhotoBgColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all duration-300 ${photoBgColor === color ? 'border-sky-500 scale-110 shadow-[0_0_15px_rgba(14,165,233,0.4)]' : 'border-slate-300/50 hover:border-sky-400 hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-slate-300/50 hover:border-sky-400 hover:scale-105 transition-all duration-300">
                    <input 
                      type="color" 
                      value={photoBgColor}
                      onChange={(e) => setPhotoBgColor(e.target.value)}
                      className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                    />
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-2">*Requires re-running AI Background Removal to apply</p>
              </div>

              {/* Photo Spacing */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Inter-Photo Gap</label>
                  <span className="text-[10px] font-mono text-sky-500">{photoGap}mm</span>
                </div>
                <input 
                  type="range" min="0" max="20" step="1" value={photoGap}
                  onChange={(e) => setPhotoGap(parseInt(e.target.value))}
                  className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                />
              </div>

              {/* Page Margin */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Canvas Margin</label>
                  <span className="text-[10px] font-mono text-sky-500">{pageMargin}mm</span>
                </div>
                <input 
                  type="range" min="1" max="50" step="1" value={pageMargin}
                  onChange={(e) => setPageMargin(parseInt(e.target.value))}
                  className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                />
              </div>

              {/* Quantity */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300 block">Quantity</label>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setPhotoCount(Math.max(1, photoCount - 1))}
                    className="w-12 h-12 border border-white/10 flex items-center justify-center hover:bg-white/20 hover:text-sky-500 hover:shadow-[0_4px_15px_rgba(255,255,255,0.05)] transition-all duration-300 rounded-l-xl"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex-1 h-12 flex items-center justify-center font-mono text-lg font-light bg-white/10 border-y border-white/10 shadow-inner">
                    {photoCount.toString().padStart(2, '0')}
                  </div>
                  <button 
                    onClick={() => setPhotoCount(photoCount + 1)}
                    className="w-12 h-12 border border-white/10 flex items-center justify-center hover:bg-white/20 hover:text-sky-500 hover:shadow-[0_4px_15px_rgba(255,255,255,0.05)] transition-all duration-300 rounded-r-xl"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </motion.aside>

        {/* Preview Area */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="lg:col-span-8 flex flex-col items-center"
        >
          <div className="mb-6 flex items-center gap-4">
            <div className="h-[1px] w-12 bg-white/10"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">A4 Master Template</span>
            <div className="h-[1px] w-12 bg-white/10"></div>
          </div>

          <div 
            id="a4-container"
            className="bg-white shadow-[0_30px_80px_-10px_rgba(14,165,233,0.15)] relative overflow-hidden rounded-sm"
            style={{
              width: `${A4_WIDTH_MM}mm`,
              height: `${A4_HEIGHT_MM}mm`,
              boxSizing: 'border-box',
              backgroundColor: '#FFFFFF'
            }}
          >
            {/* Watermark */}
            <div id="watermark" className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02] rotate-[-45deg] select-none">
              <span className="text-[120px] font-sans font-black text-black tracking-tighter">MANGLAM STUDIO</span>
            </div>

            <div 
              id="print-area"
              className="w-full h-full grid grid-cols-6 content-start"
              style={{
                padding: `${pageMargin}mm`,
                gap: `${photoGap}mm`,
                boxSizing: 'border-box'
              }}
            >
              <AnimatePresence>
                {Array.from({ length: photoCount }).map((_, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="relative"
                    style={{
                      width: `${photoWidth}mm`,
                      height: `${photoHeight}mm`,
                      border: borderThickness > 0 ? `${borderThickness}px solid black` : 'none',
                      boxSizing: 'border-box',
                      justifySelf: 'center',
                      backgroundColor: photoBgColor
                    }}
                  >
                    {(processedImage || selectedImage) ? (
                      <img 
                        src={processedImage || selectedImage || ''} 
                        alt="Passport" 
                        className="w-full h-full object-cover"
                        style={{ filter: `brightness(${brightness}%)` }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center border border-slate-200">
                        <ImageIcon size={16} className="text-black/5" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-8 text-slate-300 text-[9px] font-bold uppercase tracking-[0.3em]">
            <p>ISO/IEC 19794-5 Compliant</p>
            <div className="w-1 h-1 rounded-full bg-white/10"></div>
            <p>{photoWidth}mm x {photoHeight}mm Format</p>
            <div className="w-1 h-1 rounded-full bg-white/10"></div>
            <p>A4 Output Format</p>
          </div>
        </motion.div>
      </main>

      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            padding: ${pageMargin}mm !important;
            gap: ${photoGap}mm !important;
            box-shadow: none !important;
            width: 210mm !important;
            height: 297mm !important;
            background: white !important;
            display: grid !important;
            grid-template-columns: repeat(6, 1fr) !important;
            content-start: start !important;
          }
          @page {
            size: A4;
            margin: 0;
          }
          .absolute.inset-0.flex.items-center.justify-center.pointer-events-none {
            display: none !important;
          }
        }
      `}} />
      </div>

      <AnimatePresence>
        {showRefineModal && selectedImage && (
          <RefineModal
            selectedImage={selectedImage}
            processedImage={processedImage || selectedImage}
            onSave={(newImg) => {
              setProcessedImage(newImg);
              setShowRefineModal(false);
            }}
            onClose={() => setShowRefineModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface RefineModalProps {
  selectedImage: string;
  processedImage: string;
  onSave: (newImage: string) => void;
  onClose: () => void;
}

function RefineModal({ selectedImage, processedImage, onSave, onClose }: RefineModalProps) {
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(15);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);

  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const processedImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let loadedCount = 0;
    const origImg = new Image();
    origImg.crossOrigin = "anonymous";
    origImg.src = selectedImage;
    origImg.onload = () => {
      originalImgRef.current = origImg;
      loadedCount++;
      if (loadedCount === 2) initCanvas();
    };

    const procImg = new Image();
    procImg.crossOrigin = "anonymous";
    procImg.src = processedImage;
    procImg.onload = () => {
      processedImgRef.current = procImg;
      loadedCount++;
      if (loadedCount === 2) initCanvas();
    };

    const initCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = procImg.naturalWidth;
      canvas.height = procImg.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(procImg, 0, 0);
    };
  }, [selectedImage, processedImage]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const drawBrush = (x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    if (brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(Math.floor(distance / 2), 1);

      for (let i = 0; i <= steps; i++) {
        const percent = i / steps;
        const cx = x1 + dx * percent;
        const cy = y1 + dy * percent;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, brushSize / 2, 0, Math.PI * 2);
        ctx.clip();
        if (originalImgRef.current) {
          ctx.drawImage(originalImgRef.current, 0, 0);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    isDrawingRef.current = true;
    lastXRef.current = coords.x;
    lastYRef.current = coords.y;

    drawBrush(coords.x, coords.y, coords.x, coords.y);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    drawBrush(lastXRef.current, lastYRef.current, coords.x, coords.y);

    lastXRef.current = coords.x;
    lastYRef.current = coords.y;
  };

  const handleEnd = () => {
    isDrawingRef.current = false;
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(processedImgRef.current, 0, 0);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass-panel p-6 w-full max-w-5xl h-[85vh] flex flex-col gap-6 rounded-3xl border border-white/10"
      >
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-sky-400 flex items-center gap-2">
              <Eraser size={18} /> Background Touch-Up & Refine
            </h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
              Brush away any messy spots or restore parts of the clothing/ears
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 overflow-hidden">
          {/* Controls column */}
          <div className="md:col-span-1 bg-white/5 border border-white/5 rounded-2xl p-5 flex flex-col gap-6 justify-between">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Tool Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBrushMode('erase')}
                    className={`py-3 text-[10px] font-bold uppercase tracking-wider rounded-xl border flex flex-col items-center gap-2 transition-all ${
                      brushMode === 'erase'
                        ? 'bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                        : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eraser size={16} />
                    Eraser Brush
                  </button>
                  <button
                    onClick={() => setBrushMode('restore')}
                    className={`py-3 text-[10px] font-bold uppercase tracking-wider rounded-xl border flex flex-col items-center gap-2 transition-all ${
                      brushMode === 'restore'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                        : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Paintbrush size={16} />
                    Restore Brush
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Brush Size</label>
                  <span className="text-xs font-mono text-sky-400">{brushSize}px</span>
                </div>
                <input 
                  type="range" min="3" max="60" step="1" value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full h-[2px] bg-white/20 appearance-none cursor-pointer accent-sky-500 rounded-full"
                />
              </div>

              <div className="p-4 bg-slate-900/50 rounded-xl border border-white/5 space-y-2">
                <h4 className="text-[9px] font-bold uppercase tracking-wider text-sky-400">Guiding Instructions:</h4>
                <p className="text-[9px] text-slate-300 leading-relaxed">
                  • <b>Eraser</b>: Removes pixels under the brush (makes them transparent). Great for cleaning collar borders, shadows, or flyaway hair.
                </p>
                <p className="text-[9px] text-slate-300 leading-relaxed">
                  • <b>Restore</b>: Returns pixels from the original photo. Excellent for correcting accidental face/hair cuts.
                </p>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/5 text-slate-300 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 hover:text-white transition-all"
            >
              <RotateCcw size={14} /> Reset Changes
            </button>
          </div>

          {/* Canvas column */}
          <div className="md:col-span-3 bg-slate-950 rounded-2xl border border-white/5 relative flex items-center justify-center overflow-auto p-4 max-h-[60vh] md:max-h-full">
            <div 
              className="relative p-8 rounded-xl border border-white/5 shadow-inner"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #18181b 25%, transparent 25%),
                  linear-gradient(-45deg, #18181b 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #18181b 75%),
                  linear-gradient(-45deg, transparent 75%, #18181b 75%)
                `,
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#09090b',
              }}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleStart}
                onMouseMove={handleMove}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={handleStart}
                onTouchMove={handleMove}
                onTouchEnd={handleEnd}
                className="cursor-crosshair shadow-2xl max-w-full max-h-[50vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-6 py-3 border border-white/10 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="blue-gradient text-white px-8 py-3 text-[10px] font-bold uppercase tracking-wider hover:opacity-100 hover:shadow-[0_12px_40px_rgba(14,165,233,0.3)] hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_30px_rgba(14,165,233,0.2)] rounded-xl"
          >
            Apply Refinements
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
