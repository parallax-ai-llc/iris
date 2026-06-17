import { WifiOff } from 'lucide-react';

interface ServerRequiredOverlayProps {
  pageName: string;
}

export function ServerRequiredOverlay({ pageName }: ServerRequiredOverlayProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-900">
      <div className="flex flex-col items-center gap-4 text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">
          Server Connection Required
        </h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          {pageName} requires an active server connection.
          Please check your network and try again.
        </p>
      </div>
    </div>
  );
}
