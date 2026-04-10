import { createContext, useContext, useState, useCallback } from "react";

const EventNavContext = createContext(null);

export function EventNavProvider({ children }) {
  const [eventNav, setEventNavState] = useState(null);

  const setEventNav = useCallback((data) => {
    setEventNavState(data);
  }, []);

  const clearEventNav = useCallback(() => {
    setEventNavState(null);
  }, []);

  return (
    <EventNavContext.Provider value={{ eventNav, setEventNav, clearEventNav }}>
      {children}
    </EventNavContext.Provider>
  );
}

const noopEventNav = { eventNav: null, setEventNav: () => {}, clearEventNav: () => {} };

export function useEventNav() {
  const ctx = useContext(EventNavContext);
  return ctx || noopEventNav;
}
