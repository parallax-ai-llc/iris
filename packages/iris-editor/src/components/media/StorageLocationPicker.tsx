// Seam slot — the host's output storage-location picker. Optional; renders
// nothing when the host doesn't provide one.
import { useSeams } from '@editor/seams';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StorageLocationPicker(props: any) {
  const { StorageLocationPicker: Impl } = useSeams();
  if (!Impl) return null;
  return <Impl {...props} />;
}

export default StorageLocationPicker;
