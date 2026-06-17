// Seam slot — the host's storage browser modal. iris/web injects its real one;
// the local host omits it (storage input source shows a gentle fallback).
import { useSeams } from '@editor/seams';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function StorageBrowserModal(props: any) {
  const { StorageBrowserModal: Impl } = useSeams();
  if (!Impl) {
    if (!props?.isOpen) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={() => props?.onClose?.()}
      >
        <div
          className="rounded-xl border border-iris-line-2 bg-iris-bg-panel-solid p-6 text-sm text-iris-text-2"
          onClick={e => e.stopPropagation()}
        >
          Storage browsing isn’t available in the local host.
        </div>
      </div>
    );
  }
  return <Impl {...props} />;
}
