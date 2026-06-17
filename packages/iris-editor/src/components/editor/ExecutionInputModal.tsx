'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, Image as ImageIcon, Play, Loader2 } from 'lucide-react';
import { cn } from '@editor/lib/convert/string';

type InputType = 'none' | 'text' | 'image' | 'file';

interface ExecutionInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (input: { type: InputType; value: string; file?: File }) => void;
  inputType: InputType;
  inputLabel?: string;
  isExecuting?: boolean;
}

export function ExecutionInputModal({
  isOpen,
  onClose,
  onExecute,
  inputType,
  inputLabel,
  isExecuting = false,
}: ExecutionInputModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTextValue('');
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  }, [isOpen]);

  // Clean up preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ESC key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExecuting) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose, isExecuting]);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    if (inputType === 'image' && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, [inputType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleExecute = () => {
    if (inputType === 'none') {
      onExecute({ type: 'none', value: '' });
    } else if (inputType === 'text') {
      if (!textValue.trim()) return;
      onExecute({ type: 'text', value: textValue });
    } else {
      if (!selectedFile) return;
      onExecute({ type: inputType, value: selectedFile.name, file: selectedFile });
    }
  };
  const isValid = inputType === 'none' ? true : inputType === 'text' ? textValue.trim().length > 0 : selectedFile !== null;

  const getPlaceholder = () => {
    return inputLabel || 'Enter your input...';
  };

  const getAcceptType = () => {
    if (inputType === 'image') return 'image/*';
    return '*/*';
  };

  if (!isOpen || !isMounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isExecuting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative border border-white/10 rounded-xl w-full max-w-lg p-6 shadow-2xl" style={{ backgroundColor: '#0f0f0f' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isExecuting}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 p-1 disabled:opacity-50"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white">Run Workflow</h3>
          <p className="text-sm text-white/50 mt-1">
            Provide input to start the workflow execution
          </p>
        </div>

        {/* Input Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/70 mb-2">
            {inputLabel || 'Input'}
            {(inputType === 'image' || inputType === 'file') && (
              <span className="ml-2 text-xs text-white/40">
                ({inputType === 'image' ? 'Image' : 'File'})
              </span>
            )}
          </label>
          {inputType === 'none' ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              No input is required. This will emit a trigger signal only.
            </div>
          ) : inputType === 'text' ? (
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder={getPlaceholder()}
              disabled={isExecuting}
              rows={5}
              className={cn(
                'w-full px-4 py-3 rounded-lg resize-none',
                'bg-white/5 border border-white/10',
                'text-white placeholder-white/40',
                'focus:outline-none focus:border-slate-400/50',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !isExecuting && fileInputRef.current?.click()}
              className={cn(
                'relative rounded-lg border-2 border-dashed transition-colors cursor-pointer',
                'flex flex-col items-center justify-center',
                selectedFile
                  ? 'border-slate-400/50 bg-slate-400/10'
                  : 'border-white/20 hover:border-white/40 bg-white/5',
                isExecuting && 'opacity-50 cursor-not-allowed',
                'min-h-[200px]'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptType()}
                onChange={handleFileInputChange}
                disabled={isExecuting}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-3 p-4">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-32 max-w-full rounded-lg object-contain"
                    />
                  ) : (
                    <FileText size={48} className="text-slate-300" />
                  )}
                  <div className="text-center">
                    <p className="text-sm text-white font-medium truncate max-w-[250px]">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                    className="text-xs text-white/50 hover:text-white/70 underline"
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 p-6">
                  {inputType === 'image' ? (
                    <ImageIcon size={48} className="text-white/30" />
                  ) : (
                    <Upload size={48} className="text-white/30" />
                  )}
                  <div className="text-center">
                    <p className="text-sm text-white/70">
                      Click or drag to upload {inputType === 'image' ? 'an image' : 'a file'}
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      {inputType === 'image' ? 'PNG, JPG, GIF, WEBP' : 'Any file type'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExecuting}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition-colors',
              'text-white/70 hover:text-white hover:bg-white/10',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={!isValid || isExecuting}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-green-500 hover:bg-green-600 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isExecuting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Workflow
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
