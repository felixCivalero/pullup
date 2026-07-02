// Read the app-level messages store (contacts + room events, loaded once and
// kept live). Split from the provider file so both stay fast-refresh friendly.
import { useContext } from "react";
import { MessagesStoreContext } from "./MessagesStoreContext.jsx";

export function useMessagesStore() {
  const ctx = useContext(MessagesStoreContext);
  if (!ctx) throw new Error("useMessagesStore requires <MessagesStoreProvider>");
  return ctx;
}
