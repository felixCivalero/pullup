// HostResourceContext — host pages declare which resource they're showing
// ("event X", "campaign Y") so the floating coach widget can decide whether
// to render in AI mode. One slot, one source of truth.
//
// The hooks (useHostResource, useSetHostResource) live in a sibling .js file
// so this module can stay component-only for fast refresh.

import { createContext, useState } from "react";

// eslint-disable-next-line react-refresh/only-export-components
export const HostResourceContext = createContext({
  value: null,
  setValue: () => {},
});

export function HostResourceProvider({ children }) {
  const [value, setValue] = useState(null);
  return (
    <HostResourceContext.Provider value={{ value, setValue }}>
      {children}
    </HostResourceContext.Provider>
  );
}
