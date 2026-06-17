import { FileText, Image, Video, Music } from 'lucide-react';
import { PortType } from '../../../../constants/node-definitions';

// Port type icons
export const portTypeIcons: Record<PortType, typeof FileText> = {
  text: FileText,
  image: Image,
  video: Video,
  audio: Music,
  document: FileText,
  json: FileText,
  any: FileText,
  trigger: FileText,
};

// Allowed file extensions per port type for storage browser
export const PORT_TYPE_EXTENSIONS: Record<PortType, string[] | undefined> = {
  text: ['.txt', '.md'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
  video: ['.mp4', '.mov', '.webm', '.avi', '.mkv'],
  audio: ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm'],
  document: ['.pdf', '.png', '.jpg', '.jpeg'],
  json: ['.json'],
  any: undefined, // Allow all files
  trigger: undefined, // Not applicable for storage
};
