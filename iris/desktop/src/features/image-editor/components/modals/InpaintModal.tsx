/**
 * InpaintModal - Full-screen modal for AI inpainting
 * Shows the current image on a canvas where the user can paint a mask,
 * then submit with a prompt to generate inpainted content.
 */

import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { X, Wand2, Trash2, Minus, Plus, Coins } from 'lucide-react';
import { inpaintImage, getAssetStatus } from '@/shared/api/image.api';
import { toast } from '@/shared/lib/toast';
import { useTokenCost, formatTokenCost } from '@/shared/hooks/useTokenCost';

interface InpaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasRef: React.RefObject<{ getCanvas: () => HTMLCanvasElement | null } | null>;
}

export const InpaintModal = memo(function InpaintModal({
  isOpen,
  onClose,
  canvasRef,
}: InpaintModalProps) {
  const {
    sourceAsset,
    isProcessing,
    setProcessing,
    setProcessingProgress,
    addLayerFromUrl,
    layers,
    openEditor,
  } = useImageEditorStore();

  // Local state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [brushSize, setBrushSize] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [hasMask, setHasMask] = useState(false);
  const { cost: tokenCost, isLoading: costLoading } = useTokenCost('EDIT_IMAGE_INPAINT');

  // Canvas refs
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Image dimensions
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);

  // Load current image into the modal canvas
  useEffect(() => {
    if (!isOpen) return;

    const sourceCanvas = canvasRef.current?.getCanvas();
    if (!sourceCanvas || !imageCanvasRef.current || !maskCanvasRef.current) return;

    const imgW = sourceCanvas.width;
    const imgH = sourceCanvas.height;
    setImgDimensions({ width: imgW, height: imgH });

    // Calculate scale to fit in container
    const container = containerRef.current;
    if (container) {
      const maxW = container.clientWidth - 48;
      const maxH = container.clientHeight - 48;
      const s = Math.min(1, maxW / imgW, maxH / imgH);
      setScale(s);
    }

    // Setup image canvas
    imageCanvasRef.current.width = imgW;
    imageCanvasRef.current.height = imgH;
    const imgCtx = imageCanvasRef.current.getContext('2d');
    if (imgCtx) {
      imgCtx.drawImage(sourceCanvas, 0, 0);
    }

    // Setup mask canvas (same size, transparent)
    maskCanvasRef.current.width = imgW;
    maskCanvasRef.current.height = imgH;
    const maskCtx = maskCanvasRef.current.getContext('2d');
    if (maskCtx) {
      maskCtx.clearRect(0, 0, imgW, imgH);
    }

    setHasMask(false);
    setError(null);
  }, [isOpen, canvasRef]);

  // Get coordinates relative to the image
  const getImageCoords = useCallback((e: React.MouseEvent) => {
    if (!maskCanvasRef.current) return null;
    const rect = maskCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return { x, y };
  }, [scale]);

  // Draw a line segment on the mask canvas
  const drawMaskStroke = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, [brushSize]);

  // Mouse handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const coords = getImageCoords(e);
    if (!coords) return;

    isDrawingRef.current = true;
    lastPointRef.current = coords;

    // Draw a dot
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    setHasMask(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getImageCoords, brushSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;

    const coords = getImageCoords(e);
    if (!coords) return;

    drawMaskStroke(lastPointRef.current, coords);
    lastPointRef.current = coords;
  }, [getImageCoords, drawMaskStroke]);

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  // Clear mask
  const handleClearMask = useCallback(() => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx && maskCanvasRef.current) {
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
    setHasMask(false);
  }, []);

  // Generate inpaint
  const handleGenerate = useCallback(async () => {
    if (!maskCanvasRef.current || !sourceAsset?.id || !prompt.trim()) return;

    const maskDataUrl = maskCanvasRef.current.toDataURL('image/png');

    setError(null);
    setProcessing(true, 'AI inpainting...');

    try {
      const result = await inpaintImage(
        sourceAsset.id,
        prompt,
        maskDataUrl,
        negativePrompt || undefined
      );

      if (!result) {
        throw new Error('Failed to start inpainting');
      }

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        const status = await getAssetStatus(result.id);

        if (!status) {
          throw new Error('Failed to get processing status');
        }

        if (status.status === 'READY' || status.status === 'COMPLETED') {
          setProcessing(false);
          if (status.asset) {
            if (layers.length > 0) {
              const imageUrl = status.asset.previewUrl || status.asset.publicUrl;
              if (imageUrl) {
                await addLayerFromUrl(imageUrl, 'Inpainted');
                toast.success('Inpaint complete - added as new layer');
              }
            } else {
              openEditor(status.asset);
            }
          }
          onClose();
          return;
        }

        if (status.status === 'FAILED' || status.status === 'ERROR') {
          throw new Error(status.error || 'Inpainting failed');
        }

        setProcessingProgress(Math.min(90, (attempts / maxAttempts) * 100));
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      throw new Error('Processing timeout');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inpainting failed');
      setProcessing(false);
    }
  }, [sourceAsset?.id, prompt, negativePrompt, setProcessing, setProcessingProgress, openEditor, addLayerFromUrl, layers.length, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Wand2 className="w-4 h-4 text-white/70" />
          <h2 className="text-sm font-medium text-white">AI Inpaint</h2>
          <span className="text-xs text-zinc-500">Paint over the area to modify</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden bg-zinc-950 p-6"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
              linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
              linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        >
          <div
            className="relative"
            style={{
              width: imgDimensions.width * scale,
              height: imgDimensions.height * scale,
            }}
          >
            {/* Image layer */}
            <canvas
              ref={imageCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ imageRendering: 'auto' }}
            />
            {/* Mask layer (semi-transparent red overlay) */}
            <canvas
              ref={maskCanvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{
                imageRendering: 'auto',
                opacity: 0.5,
                mixBlendMode: 'normal',
                filter: 'hue-rotate(0deg) saturate(3)',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>
        </div>

        {/* Right panel - controls */}
        <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Brush size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">Brush Size</span>
                <span className="text-xs text-zinc-500">{brushSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBrushSize(s => Math.max(5, s - 10))}
                  className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="range"
                  min={5}
                  max={200}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white
                    [&::-webkit-slider-thumb]:shadow-md
                    [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <button
                  onClick={() => setBrushSize(s => Math.min(200, s + 10))}
                  className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {hasMask && (
                <button
                  onClick={handleClearMask}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-xs transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Mask
                </button>
              )}
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what should appear in the masked area..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 resize-none h-24"
              />
            </div>

            {/* Negative prompt */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">Negative Prompt</span>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid... (optional)"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 resize-none h-16"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Token cost */}
            {tokenCost > 0 && !costLoading && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-zinc-400">
                  <Coins className="w-3 h-3" />
                  <span>Estimated cost</span>
                </div>
                <span className="text-zinc-300">{formatTokenCost(tokenCost)} credits</span>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !hasMask || !prompt.trim() || !sourceAsset?.id}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
                'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
                'text-sm font-medium transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Wand2 className="w-4 h-4" />
              {isProcessing ? 'Processing...' : 'Generate'}
            </button>

            {!hasMask && (
              <p className="text-xs text-zinc-500 text-center">
                Paint on the image to create a mask first
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default InpaintModal;
