// A project's board or strategy deck: one JSON doc ({ [listKey]: [...] }) per
// client, loaded once and saved debounced with a version guard. Every change
// goes through `mutate` with the ids it touched; a 409 (saved elsewhere, e.g.
// another tab) merges by id — our unsaved entries win, the rest take the
// server's — and retries.
import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { supabase } from "../../lib/supabase.js";

export const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function useProjectDoc(clientId, kind, listKey) {
  const path = `/admin/projects/${clientId}/${kind}`;
  const [list, setListState] = useState([]);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [status, setStatus] = useState("saved"); // saved | saving | offline
  const listRef = useRef([]);
  const version = useRef(0);
  const dirty = useRef(new Set());
  const deleted = useRef(new Set());
  const saving = useRef(false);
  const again = useRef(false);
  const timer = useRef(null);
  const flushRef = useRef(null); // flush re-schedules itself (retry, again)

  const setList = useCallback((next) => {
    listRef.current = next;
    setListState(next);
  }, []);

  const merge = useCallback((latest) => {
    const local = new Map(listRef.current.map((i) => [i.id, i]));
    const server = Array.isArray(latest.doc?.[listKey]) ? latest.doc[listKey] : [];
    const merged = server
      .filter((i) => !deleted.current.has(i.id))
      .map((i) => (dirty.current.has(i.id) && local.has(i.id) ? local.get(i.id) : i));
    for (const id of dirty.current) if (local.has(id) && !merged.some((m) => m.id === id)) merged.push(local.get(id));
    version.current = latest.version;
    setList(merged);
  }, [listKey, setList]);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(path)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        version.current = d.version;
        setList(Array.isArray(d.doc?.[listKey]) ? d.doc[listKey] : []);
        setPhase("ready");
      })
      .catch(() => alive && setPhase("error"));
    return () => { alive = false; };
  }, [path, listKey, setList]);

  const flush = useCallback(async () => {
    if (saving.current) { again.current = true; return; }
    if (!dirty.current.size && !deleted.current.size) return;
    saving.current = true;
    const sentDirty = new Set(dirty.current);
    const sentDeleted = new Set(deleted.current);
    dirty.current.clear();
    deleted.current.clear();
    setStatus("saving");
    let res = null;
    let data = {};
    try {
      res = await authenticatedFetch(path, { method: "PUT", body: JSON.stringify({ doc: { [listKey]: listRef.current }, version: version.current }) });
      data = await res.json().catch(() => ({}));
    } catch { /* offline */ }
    if (res?.ok) {
      version.current = data.version;
      setStatus("saved");
    } else {
      sentDirty.forEach((i) => dirty.current.add(i));
      sentDeleted.forEach((i) => deleted.current.add(i));
      if (res?.status === 409) {
        merge(data);
        again.current = true;
      } else {
        setStatus("offline");
        window.setTimeout(() => flushRef.current?.(), 3000);
      }
    }
    saving.current = false;
    if (again.current) { again.current = false; flushRef.current?.(); }
  }, [path, listKey, merge]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  const mutate = useCallback((fn, { changed = [], removed = [] } = {}) => {
    setList(fn(listRef.current));
    changed.forEach((i) => dirty.current.add(i));
    removed.forEach((i) => { deleted.current.add(i); dirty.current.delete(i); });
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  }, [flush, setList]);

  // Leaving the project (or the page) saves what's pending.
  useEffect(() => () => { window.clearTimeout(timer.current); flush(); }, [flush]);
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty.current.size || deleted.current.size || saving.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { list, listRef, setList, mutate, phase, status, markDirty: (id) => dirty.current.add(id), flushSoon: () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600); } };
}

// Upload an image or video for the project (same storage as timeline cards).
export async function uploadProjectMedia(file) {
  const res = await authenticatedFetch("/admin/planner/upload-url", { method: "POST", body: JSON.stringify({ mimeType: file.type }) });
  if (!res.ok) throw new Error("upload_url_failed");
  const tok = await res.json();
  const { error } = await supabase.storage.from(tok.bucket).uploadToSignedUrl(tok.path, tok.token, file);
  if (error) throw error;
  return { url: tok.publicUrl, path: tok.path };
}

export async function resolveUrl(url) {
  const r = await authenticatedFetch(`/admin/resolve-url?url=${encodeURIComponent(url)}`).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json()).url || null;
}
