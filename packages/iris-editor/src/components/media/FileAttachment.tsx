// Seam slot — the host's file attachment/upload UI. Falls back to a basic file
// input so the "user input" source still works locally.
import { useSeams } from '@editor/seams';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FileAttachment(props: any) {
  const { FileAttachment: Impl } = useSeams();
  if (Impl) return <Impl {...props} />;
  return (
    <input
      type="file"
      accept={props?.accept}
      onChange={e => {
        const file = e.target.files?.[0];
        if (file) props?.onUpload?.(file);
      }}
      className="text-xs text-iris-text-3"
    />
  );
}

export default FileAttachment;
