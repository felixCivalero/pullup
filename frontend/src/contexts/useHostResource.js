// Hooks that read and write the HostResourceContext. Split out from the
// provider file so each module is fast-refresh friendly (components in
// one file, hooks in another).

import { useContext, useEffect } from "react";
import { HostResourceContext } from "./HostResourceContext.jsx";

/** Read the currently-declared host resource, or null. */
export function useHostResource() {
  return useContext(HostResourceContext).value;
}

/** Declare the host resource for the lifetime of the calling component.
 *  Pass null/undefined to clear. Resets on unmount so route changes wipe
 *  the previous page's resource cleanly. */
export function useSetHostResource(resource) {
  const { setValue } = useContext(HostResourceContext);
  const type = resource?.type || null;
  const id = resource?.id || null;
  useEffect(() => {
    if (type && id) {
      setValue({ type, id });
    } else {
      setValue(null);
    }
    return () => setValue(null);
  }, [type, id, setValue]);
}
