import { useEffect, useRef } from 'react';

/** `ref.current` is true while the component is mounted. */
export function useMountedRef() {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}
