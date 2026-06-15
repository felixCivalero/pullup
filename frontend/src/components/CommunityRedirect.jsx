import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../lib/api.js";
import { LoadingScreen } from "./LoadingScreen.jsx";

// /community → the host's SINGLE community page, opened in the same editor as an
// event. Get-or-create returns the kind='community' events row id; we forward to
// the standard event editor for it. There is only ever one community page.
export function CommunityRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/host/community-page");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.id) navigate(`/app/events/${data.id}/edit`, { replace: true });
        else navigate("/room", { replace: true });
      } catch {
        if (!cancelled) navigate("/room", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);
  return <LoadingScreen label="opening your community" />;
}
