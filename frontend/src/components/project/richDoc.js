// The rich text model for board text boxes and stickies: the schema the
// editor and the view share, and helpers for the stored document. The
// components live in RichText.jsx.
import StarterKit from "@tiptap/starter-kit";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";

// The schema: what a box can hold. The view and the editor share it.
export const schema = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    trailingNode: false, // a heading-only box shouldn't sprout an empty line
    link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
  }),
  TextStyle,
  FontSize,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

// ── document helpers ─────────────────────────────────────────────────────
const para = (text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined });

export const emptyDoc = (block = "p") => ({ type: "doc", content: [block === "h1" ? { type: "heading", attrs: { level: 1 } } : para("")] });
export const docFromText = (text) => ({ type: "doc", content: String(text || "").split("\n").map(para) });

// Boxes made before rich text had a plain `text` and a size (l/m/s).
export function docFromItem(item) {
  if (item?.doc?.type === "doc") return item.doc;
  const size = item?.type === "text" ? item.size || "m" : "s";
  const level = { l: 1, m: 2 }[size];
  const lines = String(item?.text || "").split("\n");
  return { type: "doc", content: lines.map((t) => (level ? { type: "heading", attrs: { level }, content: t ? [{ type: "text", text: t }] : undefined } : para(t))) };
}

const hasContent = (node) => node?.type === "text" ? !!node.text : node?.type === "horizontalRule" || (node?.content || []).some(hasContent);
export const isEmptyDoc = (doc) => !hasContent(doc);

// Tick the nth checklist item (document order) — for checking off without editing.
export function toggleTaskAt(doc, index) {
  let n = -1;
  const walk = (node) => {
    if (node.type === "taskItem" && ++n === index) return { ...node, attrs: { ...node.attrs, checked: !node.attrs?.checked } };
    return node.content ? { ...node, content: node.content.map(walk) } : node;
  };
  return walk(doc);
}

// Styles for the box contents (view + edit) and the toolbar. Sizes are in em
// of the box's base size, so a sticky and a text box scale the same way.
export const RICH_CSS = `
  .rt { outline: none; color: #0a0a0a; font-size: 1em; line-height: 1.5; word-break: break-word; }
  .rt > :first-child { margin-top: 0 !important; }
  .rt > :last-child { margin-bottom: 0 !important; }
  .rt p { margin: 0 0 0.45em; }
  .rt h1, .rt h2, .rt h3 { margin: 0.5em 0 0.25em; font-weight: 700; color: inherit; }
  .rt h1 { font-size: 2.8em; line-height: 1.05; letter-spacing: -0.03em; }
  .rt h2 { font-size: 1.9em; line-height: 1.12; letter-spacing: -0.02em; }
  .rt h3 { font-size: 1.4em; line-height: 1.2; letter-spacing: -0.01em; }
  .rt [style*="font-size"] { line-height: 1.15; }
  .rt strong { font-weight: 700; }
  .rt a { color: inherit; text-decoration: underline; text-decoration-color: #ec178f; text-underline-offset: 0.15em; text-decoration-thickness: 0.08em; cursor: pointer; }
  .rt mark { border-radius: 0.15em; padding: 0 0.08em; color: inherit; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .rt code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; background: rgba(10,10,10,0.07); border-radius: 0.3em; padding: 0.1em 0.3em; }
  .rt pre { margin: 0.4em 0 0.6em; padding: 0.8em 1em; border-radius: 10px; background: #0a0a0a; color: #f5f5f5; overflow-x: auto; }
  .rt pre code { background: none; padding: 0; color: inherit; font-size: 0.85em; }
  .rt blockquote { margin: 0.4em 0 0.6em; padding: 0.1em 0 0.1em 0.9em; border-left: 3px solid #0a0a0a; color: #3a3a3a; }
  .rt ul, .rt ol { margin: 0.2em 0 0.55em; padding-left: 1.35em; }
  .rt li { margin: 0.1em 0; }
  .rt li > p { margin: 0; }
  .rt hr { border: 0; border-top: 2px solid rgba(10,10,10,0.14); margin: 0.8em 0; }
  .rt ul[data-type="taskList"] { list-style: none; padding-left: 0.1em; }
  .rt ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
  .rt ul[data-type="taskList"] li > label { flex: none; display: flex; align-items: center; height: 1.5em; user-select: none; }
  .rt ul[data-type="taskList"] li > label input { width: 0.95em; height: 0.95em; margin: 0; accent-color: #0a0a0a; cursor: pointer; }
  .rt ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
  .rt ul[data-type="taskList"] li[data-checked="true"] > div { color: #8e8e93; text-decoration: line-through; }
  .rt-edit { cursor: text; user-select: text; -webkit-user-select: text; min-height: 1.5em; caret-color: #ec178f; }
  .rt-edit ::selection { background: rgba(236,23,143,0.22); }
  .rt-edit .is-empty::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: rgba(10,10,10,0.32); font-weight: 400; }
  .rt-edit h1.is-empty::before, .rt-edit h2.is-empty::before, .rt-edit h3.is-empty::before { font-weight: 700; }
  .rt-placeholder { color: rgba(0,0,0,0.35); font-weight: 400; }
  .rt-host { height: 100%; }

  .rt-bar { position: absolute; z-index: 35; font-family: inherit; color: #0a0a0a; }
  .rt-row { display: flex; align-items: center; gap: 1px; padding: 4px; background: #fff; border-radius: 12px; box-shadow: 0 12px 32px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08); white-space: nowrap; }
  .rt-bar button { font: inherit; color: inherit; cursor: pointer; }
  .rt-b { position: relative; height: 32px; min-width: 32px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; gap: 1px; border: 0; border-radius: 8px; background: transparent; flex: none; }
  .rt-b:hover, .rt-style:hover, .rt-size:hover { background: rgba(0,0,0,0.06); }
  .rt-b.is-on { background: #0a0a0a; color: #fff !important; }
  .rt-style { height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 8px 0 9px; border: 0; border-radius: 8px; background: transparent; font-size: 13px !important; font-weight: 600; min-width: 128px; }
  .rt-style span { flex: 1; text-align: left; }
  .rt-size { height: 32px; min-width: 38px; padding: 0 4px; border: 0; border-radius: 8px; background: rgba(0,0,0,0.05); font-size: 13px !important; font-weight: 600; font-variant-numeric: tabular-nums; }
  .rt-sep { width: 1px; height: 20px; background: rgba(0,0,0,0.12); margin: 0 4px; flex: none; }
  .rt-color i { position: absolute; left: 8px; right: 8px; bottom: 4px; height: 3px; border-radius: 2px; }
  .rt-color svg { margin-top: -3px; }
  .rt-caret { gap: 0; }

  .rt-pop { position: absolute; top: calc(100% + 6px); min-width: 200px; padding: 6px; background: #fff; border-radius: 12px; box-shadow: 0 16px 40px -14px rgba(0,0,0,0.38), 0 0 0 1px rgba(0,0,0,0.08); }
  .rt-pop-h { padding: 6px 8px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8a8a; }
  .rt-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 9px; border: 0; border-radius: 8px; background: transparent; text-align: left; font-size: 14px !important; }
  .rt-item span { flex: 1; }
  .rt-item:hover { background: rgba(0,0,0,0.05); }
  .rt-item.is-on { font-weight: 600; }
  .rt-item kbd, .rt-tip kbd, .rt-slash kbd { font: inherit; font-size: 11px; color: #8a8a8a; background: rgba(0,0,0,0.05); border-radius: 5px; padding: 1px 5px; }
  .rt-item-h1 span { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .rt-item-h2 span { font-size: 18px; font-weight: 700; }
  .rt-item-h3 span { font-size: 15.5px; font-weight: 700; }
  .rt-item-small span { font-size: 12.5px; }
  .rt-reset { margin-top: 4px; font-size: 12.5px !important; color: #6e6e73 !important; }
  .rt-field { display: flex; align-items: center; gap: 6px; padding: 4px 6px; }
  .rt-field input { flex: 1; min-width: 0; height: 34px; border: 1px solid rgba(0,0,0,0.14); border-radius: 8px; padding: 0 10px; font: inherit; font-size: 14px; outline: none; }
  .rt-field input:focus { border-color: #0a0a0a; }
  .rt-field span { font-size: 12.5px; color: #8a8a8a; }
  .rt-pop-size { width: 196px; }
  .rt-sizes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; padding: 4px; }
  .rt-sizes button { height: 30px; border: 0; border-radius: 7px; background: transparent; font-size: 12.5px !important; font-variant-numeric: tabular-nums; }
  .rt-sizes button:hover { background: rgba(0,0,0,0.06); }
  .rt-sizes button.is-on { background: #0a0a0a; color: #fff !important; }
  .rt-pop-color, .rt-pop-highlight { min-width: 0; }
  .rt-swatches { display: grid; grid-template-columns: repeat(5, 30px); gap: 6px; padding: 4px 6px 6px; }
  .rt-swatch { width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12); background: #fff; font-weight: 800 !important; font-size: 16px !important; display: grid; place-items: center; }
  .rt-swatch.is-on { outline: 2px solid #0a0a0a; outline-offset: 1px; }
  .rt-swatch.is-none { background: repeating-linear-gradient(135deg, #fff 0 5px, #f1f1f1 5px 10px) !important; }
  .rt-pop-link { width: 360px; }
  .rt-ok { height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: #0a0a0a; color: #fff !important; font-weight: 600; font-size: 13px !important; white-space: nowrap; }
  .rt-pop-align { min-width: 0; }
  .rt-inline { display: flex; gap: 2px; }
  .rt-pop-more { width: 250px; }
  .rt-tip { padding: 8px 9px 4px; font-size: 12px; color: #8a8a8a; line-height: 1.5; border-top: 1px solid rgba(0,0,0,0.06); margin-top: 4px; }

  .rt-slash { width: 240px; max-height: 300px; overflow-y: auto; padding: 6px; background: #fff; border-radius: 12px; box-shadow: 0 16px 40px -14px rgba(0,0,0,0.38), 0 0 0 1px rgba(0,0,0,0.08); font-family: inherit; color: #0a0a0a; }
  .rt-slash-h { padding: 4px 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8a8a; }
  .rt-slash button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 9px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 14px; color: inherit; text-align: left; cursor: pointer; }
  .rt-slash button span { flex: 1; }
  .rt-slash button.is-on { background: rgba(0,0,0,0.06); }
`;
