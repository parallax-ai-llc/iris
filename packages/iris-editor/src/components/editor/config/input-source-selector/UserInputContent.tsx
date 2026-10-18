'use client';

import { useState, useCallback } from 'react';
import { cn } from '@editor/lib/convert/string';
import { PortType } from '../../../../constants/node-definitions';
import { FileAttachment } from '../../../media/FileAttachment';

interface UserInputContentProps {
  inputType: PortType;
  inputLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export function UserInputContent({
  inputType,
  inputLabel,
  value,
  onChange,
}: UserInputContentProps) {
  // State for file attachment (converts File to base64 for storage)
  const [files, setFiles] = useState<File[]>([]);

  // Handle file changes - convert to base64 and pass to onChange
  const handleFilesChange = useCallback(async (newFiles: File[]) => {
    setFiles(newFiles);
    
    if (newFiles.length === 0) {
      onChange('');
      return;
    }

    // Convert first file to base64 data URL
    const file = newFiles[0];
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onChange(base64);
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  if (inputType === 'text' || inputType === 'any') {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${inputLabel.toLowerCase()}...`}
        rows={3}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-md resize-none',
          'bg-white/5 border border-white/10',
          'text-white placeholder-white/40',
          'focus:outline-none focus:border-slate-400/50'
        )}
      />
    );
  }

  // Media types: image, video, audio - use FileAttachment
  if (inputType === 'image' || inputType === 'video' || inputType === 'audio') {
    // Determine accept type based on input type
    const acceptMap: Record<string, string> = {
      image: 'image/*',
      video: 'video/*',
      audio: 'audio/*',
    };
    const accept = acceptMap[inputType] || 'image/*,video/*';

    return (
      <FileAttachment
        files={files}
        onChange={handleFilesChange}
        accept={accept}
        maxFiles={1}
        dropdownPosition="bottom"
        variant="neutral"
        displayMode="thumbnail"
      />
    );
  }

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${inputLabel.toLowerCase()}...`}
      rows={2}
      className={cn(
        'w-full px-3 py-2 text-sm rounded-md resize-none',
        'bg-white/5 border border-white/10',
        'text-white placeholder-white/40',
        'focus:outline-none focus:border-slate-400/50'
      )}
    />
  );
}
