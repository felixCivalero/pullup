// The event editor's look — the admin palette (black, grey, orange; no pink).
import { colors } from "../../crm/mailColors.js";

export { colors };

export const EDITOR_CSS = `
  .ee-panel { display: grid; gap: 12px; }
  .ee-card { position: relative; background: #fff; border: 1px solid ${colors.border}; border-radius: 12px; padding: 12px 14px; transition: border-color 0.15s ease; }
  .ee-card.is-hover { border-color: ${colors.secondary}; }
  .ee-card.is-drag { opacity: 0.5; }
  .ee-card-head { display: flex; align-items: center; gap: 6px; cursor: grab; }
  .ee-card-head .ee-kind { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${colors.textFaded}; user-select: none; }
  .ee-card-head .ee-grow { flex: 1; }
  .ee-arrows { display: flex; flex-direction: column; gap: 1px; }
  .ee-arrows button, .ee-x { background: none; border: 0; padding: 0 3px; cursor: pointer; color: ${colors.textSubtle}; font-size: 12px; line-height: 1; }
  .ee-arrows button:disabled { color: ${colors.borderStrong}; cursor: default; }
  .ee-x { font-size: 18px; color: ${colors.textFaded}; }
  .ee-drop-line { position: absolute; left: 8px; right: 8px; height: 2px; background: ${colors.secondary}; border-radius: 1px; }
  .ee-input, .ee-field input, .ee-field textarea, .ee-field select { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; color: ${colors.text}; background: ${colors.surfaceMuted}; border: 1px solid ${colors.border}; border-radius: 9px; padding: 9px 11px; outline: none; }
  .ee-input:focus, .ee-field input:focus, .ee-field textarea:focus { border-color: ${colors.text}; background: #fff; }
  .ee-bare { width: 100%; box-sizing: border-box; font: inherit; border: 0; outline: none; background: transparent; color: ${colors.text}; padding: 0; }
  .ee-bare.is-title { font-size: 18px; font-weight: 700; margin-top: 8px; }
  .ee-bare.is-h { font-size: 15px; font-weight: 600; margin: 10px 0 6px; }
  textarea.ee-bare { font-size: 14px; line-height: 1.6; color: ${colors.textMuted}; resize: vertical; min-height: 64px; }
  .ee-field { display: grid; gap: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: ${colors.textSubtle}; }
  .ee-field small, .ee-toggle small { font-size: 11.5px; font-weight: 400; text-transform: none; letter-spacing: 0; color: ${colors.textSubtle}; line-height: 1.4; display: block; }
  .ee-toggle { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: ${colors.text}; }
  .ee-toggle > span { padding-top: 1px; }
  .ee-toggle button { width: 36px; height: 20px; border-radius: 10px; border: 0; background: ${colors.borderStrong}; position: relative; cursor: pointer; flex-shrink: 0; transition: background 0.2s ease; padding: 0; }
  .ee-toggle button i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transition: left 0.2s ease; }
  .ee-toggle button.is-on { background: ${colors.text}; }
  .ee-toggle button.is-on i { left: 18px; }
  .ee-when { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; cursor: pointer; }
  .ee-when input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ee-when .is-empty { color: ${colors.textSubtle}; }
  .ee-embed { border-radius: 8px; margin-top: 10px; border: 0; width: 100%; }
  .ee-add { border: 1px dashed ${colors.borderStrong}; border-radius: 12px; padding: 10px 8px 8px; background: ${colors.surfaceMuted}; }
  .ee-add > p { margin: 0 0 8px; font-size: 11px; text-align: center; color: ${colors.textSubtle}; }
  .ee-add-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .ee-add-grid button { display: grid; justify-items: center; gap: 4px; padding: 9px 2px 7px; background: none; border: 0; border-radius: 8px; cursor: pointer; font: inherit; }
  .ee-add-grid button:hover { background: #fff; }
  .ee-add-grid b { font-size: 19px; line-height: 1; color: ${colors.textSubtle}; }
  .ee-add-grid span { font-size: 9.5px; color: ${colors.textSubtle}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .ee-row { display: flex; align-items: center; gap: 8px; }
  .ee-row > span { font-size: 12px; color: ${colors.textSubtle}; width: 78px; flex-shrink: 0; }
  .ee-logo { width: 48px; height: 48px; border-radius: 8px; border: 1px dashed ${colors.borderStrong}; display: grid; place-items: center; overflow: hidden; cursor: pointer; background: ${colors.surfaceMuted}; flex-shrink: 0; }
  .ee-logo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
  .ee-section-title { margin: 6px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${colors.textSubtle}; }
  .ee-muted { margin: 0; font-size: 12.5px; color: ${colors.textSubtle}; line-height: 1.5; }
`;
