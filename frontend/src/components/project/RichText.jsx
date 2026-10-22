import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorContent, Extension, ReactRenderer, useEditor, useEditorState } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import Suggestion, { exitSuggestion } from "@tiptap/suggestion";
import { generateHTML } from "@tiptap/html";
import { isEmptyDoc, schema } from "./richDoc.js";
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, Check, ChevronDown, Code, Ellipsis, Heading1, Heading2, Heading3,
  Highlighter, Italic, Link2, List, ListOrdered, ListTodo, Minus, Pilcrow, Plus, Quote, RemoveFormatting, SquareCode,
  Strikethrough, Type, Underline, Unlink,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════
   Rich text for the board's text boxes and stickies (TipTap / ProseMirror).

   The model is the one Miro, FigJam and Notion share: a toolbar docked above
   the box while you write, whose styles apply to what is selected — a whole
   block, or a few letters in the middle of a sentence — plus "/" for blocks,
   markdown as you type (# , - , 1. , [ ] , > , **bold**) and the usual keys
   (⌘B ⌘I ⌘U ⌘K, ⌘⇧7/8/9, ⌘⌥1-3).

   Stored as ProseMirror JSON on the item (`doc`), with the plain text beside
   it (`text`). Off-edit it renders through the same schema, so only what the
   editor can make ever reaches the page.
   ════════════════════════════════════════════════════════════════════════ */

// ── view (not editing) ───────────────────────────────────────────────────
export function RichTextView({ doc, placeholder, onToggleTask }) {
  const html = useMemo(() => {
    try {
      return generateHTML(doc, schema);
    } catch {
      return "";
    }
  }, [doc]);
  // React 19 rewrites innerHTML whenever this object is new — which would swap
  // the DOM between the two clicks of a double-click. Keep it stable per string.
  const inner = useMemo(() => ({ __html: html }), [html]);
  if (isEmptyDoc(doc)) return <div className="rt rt-view"><span className="rt-placeholder">{placeholder}</span></div>;
  const onPointerDown = (e) => {
    const box = e.target.closest?.("input[type=checkbox]");
    if (box && onToggleTask) {
      e.stopPropagation();
      e.preventDefault();
      onToggleTask([...e.currentTarget.querySelectorAll("li[data-type=taskItem] > label input[type=checkbox]")].indexOf(box));
      return;
    }
    if (e.target.closest?.("a[href]")) e.stopPropagation(); // a link opens instead of dragging the box
  };
  return <div className="rt rt-view" onPointerDown={onPointerDown} onClick={(e) => e.target.closest?.("input[type=checkbox]") && e.preventDefault()} dangerouslySetInnerHTML={inner} />;
}

// ── blocks: the "/" menu and the style picker share them ──────────────────
const BLOCKS = [
  { key: "h1", label: "Rubrik 1", hint: "#", Icon: Heading1, words: "heading rubrik titel h1", run: (c) => c.setNode("heading", { level: 1 }) },
  { key: "h2", label: "Rubrik 2", hint: "##", Icon: Heading2, words: "heading rubrik underrubrik h2", run: (c) => c.setNode("heading", { level: 2 }) },
  { key: "h3", label: "Rubrik 3", hint: "###", Icon: Heading3, words: "heading rubrik h3", run: (c) => c.setNode("heading", { level: 3 }) },
  { key: "p", label: "Text", hint: "", Icon: Pilcrow, words: "text paragraph brödtext stycke", run: (c) => c.setParagraph() },
  { key: "ul", label: "Punktlista", hint: "-", Icon: List, words: "bullet lista punkt", run: (c) => c.toggleBulletList() },
  { key: "ol", label: "Numrerad lista", hint: "1.", Icon: ListOrdered, words: "numbered ordered lista nummer", run: (c) => c.toggleOrderedList() },
  { key: "task", label: "Checklista", hint: "[ ]", Icon: ListTodo, words: "todo check att göra uppgift", run: (c) => c.toggleTaskList() },
  { key: "quote", label: "Citat", hint: ">", Icon: Quote, words: "quote citat", run: (c) => c.toggleBlockquote() },
  { key: "code", label: "Kodblock", hint: "```", Icon: SquareCode, words: "code kod", run: (c) => c.toggleCodeBlock() },
  { key: "hr", label: "Avdelare", hint: "---", Icon: Minus, words: "divider linje avdelare hr", run: (c) => c.setHorizontalRule() },
];

const SlashMenu = forwardRef(function SlashMenu({ items, command }, ref) {
  const [sel, setSel] = useState({ items, active: 0 });
  if (sel.items !== items) setSel({ items, active: 0 }); // a new filter starts at the top
  const active = sel.items === items ? sel.active : 0;
  const setActive = (f) => setSel((p) => ({ items, active: typeof f === "function" ? f(p.active) : f }));
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false;
      if (e.key === "ArrowDown") { setActive((a) => (a + 1) % items.length); return true; }
      if (e.key === "ArrowUp") { setActive((a) => (a - 1 + items.length) % items.length); return true; }
      if (e.key === "Enter" || e.key === "Tab") { command(items[active]); return true; }
      return false;
    },
  }));
  if (!items.length) return null;
  return (
    <div className="rt-slash" onMouseDown={(e) => e.preventDefault()}>
      <div className="rt-slash-h">Block</div>
      {items.map((b, i) => (
        <button key={b.key} type="button" className={i === active ? "is-on" : ""} onMouseEnter={() => setActive(i)} onClick={() => command(b)}>
          <b.Icon size={16} /> <span>{b.label}</span> {b.hint && <kbd>{b.hint}</kbd>}
        </button>
      ))}
    </div>
  );
});

const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        items: ({ query }) => {
          const q = query.toLowerCase();
          return BLOCKS.filter((b) => !q || b.label.toLowerCase().includes(q) || b.words.includes(q));
        },
        command: ({ editor, range, props }) => props.run(editor.chain().focus().deleteRange(range)).run(),
        render: () => {
          let renderer = null;
          const place = (props) => {
            const r = props.clientRect?.();
            if (!r || !renderer) return;
            const el = renderer.element;
            el.style.left = `${Math.min(r.left, window.innerWidth - 250)}px`;
            el.style.top = `${r.bottom + 260 > window.innerHeight ? Math.max(8, r.top - 300) : r.bottom + 6}px`;
          };
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              Object.assign(renderer.element.style, { position: "fixed", zIndex: 1000 });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              place(props);
            },
            onKeyDown: ({ event, view }) => {
              if (event.key === "Escape") {
                event.stopPropagation(); // closes the menu, not the box
                exitSuggestion(view);
                return true;
              }
              return renderer?.ref?.onKeyDown(event) || false;
            },
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});

// ⌘K asks the toolbar for the link field.
const LinkShortcut = Extension.create({
  name: "linkShortcut",
  addKeyboardShortcuts() {
    return { "Mod-k": () => { this.editor.emit("rt-link"); return true; } };
  },
});

// ── editor (while editing) ───────────────────────────────────────────────
// `at`: the screen point that opened the editor (a double-click) — the caret
// starts there, on the word that was clicked, instead of at the end.
export function RichTextEditor({ doc, at, onChange, onReady }) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const editor = useEditor({
    extensions: [
      ...schema,
      SlashCommand,
      LinkShortcut,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? `Rubrik ${node.attrs.level}` : "Skriv, eller tryck / för rubriker, listor …"),
      }),
    ],
    content: doc,
    autofocus: at ? false : "end",
    onCreate: ({ editor: e }) => {
      if (!at) return;
      // The camera may be gliding in, so place it by share of the box, not by pixel.
      const r = e.view.dom.getBoundingClientRect();
      const hit = e.view.posAtCoords({ left: r.left + at.fx * r.width, top: r.top + at.fy * r.height });
      if (hit) e.chain().focus().setTextSelection(hit.pos).run();
      else e.commands.focus("end");
    },
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: "rt rt-edit", spellcheck: "true" } },
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getJSON(), e.getText({ blockSeparator: "\n" })),
  });
  useEffect(() => {
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor, onReady]);
  return <EditorContent editor={editor} className="rt-host" />;
}

// ── the docked toolbar ───────────────────────────────────────────────────
const SIZES = [10, 12, 13, 14, 16, 17, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96, 120];
const STYLES = [
  { key: "h1", label: "Rubrik 1", Icon: Heading1, size: 48 },
  { key: "h2", label: "Rubrik 2", Icon: Heading2, size: 32 },
  { key: "h3", label: "Rubrik 3", Icon: Heading3, size: 24 },
  { key: "p", label: "Text", Icon: Type, size: null },
  { key: "small", label: "Liten text", Icon: Pilcrow, size: 13 },
];
const TEXT_COLORS = [
  [null, "Standard"], ["#6b7280", "Grå"], ["#dc2626", "Röd"], ["#ea580c", "Orange"], ["#ca8a04", "Gul"],
  ["#16a34a", "Grön"], ["#0d9488", "Teal"], ["#2563eb", "Blå"], ["#7c3aed", "Lila"], ["#ec178f", "Rosa"],
];
const HIGHLIGHTS = [
  [null, "Ingen"], ["#fef08a", "Gul"], ["#fed7aa", "Orange"], ["#fecaca", "Röd"], ["#bbf7d0", "Grön"],
  ["#bfdbfe", "Blå"], ["#ddd6fe", "Lila"], ["#fbcfe8", "Rosa"], ["#e5e7eb", "Grå"],
];

const ALIGNS = [{ key: "left", Icon: AlignLeft, label: "Vänster" }, { key: "center", Icon: AlignCenter, label: "Centrera" }, { key: "right", Icon: AlignRight, label: "Höger" }];

// The size the reader sees at the cursor: an explicit size mark, else what
// the block renders at (a heading's size, the box's base).
function sizeAt(editor) {
  const mark = parseFloat(editor.getAttributes("textStyle").fontSize);
  if (mark) return Math.round(mark);
  try {
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const el = node.nodeType === 3 ? node.parentElement : node;
    return Math.round(parseFloat(getComputedStyle(el).fontSize)) || 17;
  } catch {
    return 17;
  }
}

// A selection inside one block that doesn't cover all of it: styles go on
// those letters only. Otherwise they change the block(s).
function isPartial(state) {
  const { from, to, empty, $from, $to } = state.selection;
  return !empty && $from.sameParent($to) && (from > $from.start() || to < $from.end());
}

function applyStyle(editor, key) {
  const style = STYLES.find((s) => s.key === key);
  const { state } = editor;
  const { $from, $to } = state.selection;
  const original = state.selection;
  if (isPartial(state)) {
    const c = editor.chain().focus();
    if (key === "p") return c.unsetFontSize().unsetBold().run();
    return (key === "small" ? c.setFontSize(`${style.size}px`).unsetBold() : c.setFontSize(`${style.size}px`).setBold()).run();
  }
  const blockFrom = $from.start(), blockTo = $to.end();
  let c = editor.chain().focus();
  c = key.startsWith("h") ? c.setNode("heading", { level: Number(key[1]) }) : c.setParagraph();
  // A block style replaces sizes set inside it; "Liten text" sets its own.
  if (blockTo > blockFrom) {
    c = c.setTextSelection({ from: blockFrom, to: blockTo });
    c = key === "small" ? c.setFontSize(`${style.size}px`) : c.unsetFontSize();
    c = c.command(({ tr }) => { tr.setSelection(original.map(tr.doc, tr.mapping)); return true; }); // what was selected stays selected
  } else if (key === "small") {
    c = c.setFontSize(`${style.size}px`);
  }
  return c.run();
}

export function RichToolbar({ editor, left, top, bottomEdge }) {
  const wrapRef = useRef(null);
  const [pop, setPop] = useState(null); // { kind, x }
  const [linkDraft, setLinkDraft] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const [pos, setPos] = useState({ left, top });

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || e.isDestroyed) return null;
      const partial = isPartial(e.state);
      const ts = e.getAttributes("textStyle");
      const size = sizeAt(e);
      const level = [1, 2, 3].find((l) => e.isActive("heading", { level: l })) || 0;
      // What the style picker shows: an inline size that matches a style
      // counts as that style; any other explicit size is "Egen".
      const mark = parseFloat(ts.fontSize);
      const styleKey = mark ? (STYLES.find((st) => st.size === Math.round(mark))?.key || "custom") : level ? `h${level}` : "p";
      return {
        partial, size, styleKey,
        bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
        code: e.isActive("code"), link: e.isActive("link"), href: e.getAttributes("link").href || "",
        bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"),
        quote: e.isActive("blockquote"), codeBlock: e.isActive("codeBlock"),
        align: ["center", "right"].find((a) => e.isActive({ textAlign: a })) || "left",
        color: ts.color || null,
        highlight: e.isActive("highlight") ? e.getAttributes("highlight").color || "#fef08a" : null,
        empty: e.state.selection.empty,
      };
    },
  });

  // Stay on screen: clamp to the stage, flip under the box near the top.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const w = el.offsetWidth;
    const maxLeft = parent.clientWidth - w - 8;
    setPos({ left: Math.max(8, Math.min(left, maxLeft)), top: top < 64 ? bottomEdge + 12 : top });
  }, [left, top, bottomEdge]);


  useEffect(() => {
    if (!pop) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setPop(null); };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [pop]);

  // Popovers open under their button (⌘K: under the link button).
  const openPop = (kind, e) => {
    if (pop?.kind === kind) { setPop(null); return; }
    if (kind === "link") setLinkDraft(editor.getAttributes("link").href || "");
    if (kind === "size") setSizeDraft(String(sizeAt(editor)));
    const btn = e?.currentTarget || wrapRef.current?.querySelector(`[data-pop=${kind}]`);
    const wrap = wrapRef.current?.getBoundingClientRect();
    setPop({ kind, x: btn && wrap ? btn.getBoundingClientRect().left - wrap.left : 0 });
  };
  const openLink = useRef(openPop);
  useEffect(() => { openLink.current = openPop; });
  useEffect(() => {
    if (!editor) return undefined;
    const open = () => openLink.current("link");
    editor.on("rt-link", open);
    return () => editor.off("rt-link", open);
  }, [editor]);

  if (!editor || !s) return null;
  const chain = () => editor.chain().focus();
  const setSize = (n) => {
    const v = Math.max(6, Math.min(400, Math.round(Number(n))));
    if (v) chain().setFontSize(`${v}px`).run();
  };
  const step = (dir) => {
    const cur = s.size;
    const next = dir > 0 ? SIZES.find((x) => x > cur) || cur + 8 : [...SIZES].reverse().find((x) => x < cur) || Math.max(6, cur - 2);
    setSize(next);
  };
  const applyLink = () => {
    const href = linkDraft.trim();
    if (!href) chain().extendMarkRange("link").unsetLink().run();
    else if (s.empty && !s.link) chain().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else chain().extendMarkRange("link").setLink({ href }).run();
    setPop(null);
  };
  const style = STYLES.find((st) => st.key === s.styleKey);
  const AlignIcon = ALIGNS.find((al) => al.key === s.align).Icon;

  // Mouse-down on the toolbar must not take focus (or the selection) from the text.
  const keepFocus = (e) => { if (!e.target.closest("input")) e.preventDefault(); };

  return (
    <div ref={wrapRef} className="rt-bar" style={{ left: pos.left, top: pos.top }} onMouseDown={keepFocus} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="rt-row">
        <button type="button" className="rt-style" onClick={(e) => openPop("style", e)} title={s.partial ? "Stil för det markerade" : "Stil för stycket"}>
          {style ? <style.Icon size={15} /> : <Type size={15} />}
          <span>{style?.label || "Egen storlek"}</span>
          <ChevronDown size={13} />
        </button>
        <span className="rt-sep" />
        <button type="button" className="rt-b" onClick={() => step(-1)} title="Mindre text"><Minus size={14} /></button>
        <button type="button" className="rt-size" onClick={(e) => openPop("size", e)} title="Textstorlek">{s.size}</button>
        <button type="button" className="rt-b" onClick={() => step(1)} title="Större text"><Plus size={14} /></button>
        <span className="rt-sep" />
        <button type="button" className={`rt-b${s.bold ? " is-on" : ""}`} onClick={() => chain().toggleBold().run()} title="Fet (⌘B)"><Bold size={16} /></button>
        <button type="button" className={`rt-b${s.italic ? " is-on" : ""}`} onClick={() => chain().toggleItalic().run()} title="Kursiv (⌘I)"><Italic size={16} /></button>
        <button type="button" className={`rt-b${s.underline ? " is-on" : ""}`} onClick={() => chain().toggleUnderline().run()} title="Understruken (⌘U)"><Underline size={16} /></button>
        <button type="button" className={`rt-b${s.strike ? " is-on" : ""}`} onClick={() => chain().toggleStrike().run()} title="Genomstruken (⌘⇧S)"><Strikethrough size={16} /></button>
        <button type="button" className="rt-b rt-color" onClick={(e) => openPop("color", e)} title="Textfärg">
          <Baseline size={16} /><i style={{ background: s.color || "#0a0a0a" }} />
        </button>
        <button type="button" className="rt-b rt-color" onClick={(e) => openPop("highlight", e)} title="Överstrykning">
          <Highlighter size={16} /><i style={{ background: s.highlight || "transparent", boxShadow: s.highlight ? "none" : "inset 0 0 0 1px rgba(0,0,0,0.2)" }} />
        </button>
        <button type="button" data-pop="link" className={`rt-b${s.link ? " is-on" : ""}`} onClick={(e) => openPop("link", e)} title="Länk (⌘K)"><Link2 size={16} /></button>
        <span className="rt-sep" />
        <button type="button" data-pop="align" className="rt-b rt-caret" onClick={(e) => openPop("align", e)} title="Justering"><AlignIcon size={16} /><ChevronDown size={11} /></button>
        <button type="button" className={`rt-b${s.bullet ? " is-on" : ""}`} onClick={() => chain().toggleBulletList().run()} title="Punktlista (⌘⇧8)"><List size={16} /></button>
        <button type="button" className={`rt-b${s.ordered ? " is-on" : ""}`} onClick={() => chain().toggleOrderedList().run()} title="Numrerad lista (⌘⇧7)"><ListOrdered size={16} /></button>
        <button type="button" className={`rt-b${s.task ? " is-on" : ""}`} onClick={() => chain().toggleTaskList().run()} title="Checklista (⌘⇧9)"><ListTodo size={16} /></button>
        <button type="button" className={`rt-b${s.quote ? " is-on" : ""}`} onClick={() => chain().toggleBlockquote().run()} title="Citat (⌘⇧B)"><Quote size={16} /></button>
        <button type="button" className="rt-b" onClick={(e) => openPop("more", e)} title="Mer"><Ellipsis size={16} /></button>
      </div>

      {pop && (
        <div className={`rt-pop rt-pop-${pop.kind}`} style={{ left: pop.x }}>
          {pop.kind === "style" && (
            <>
              <div className="rt-pop-h">{s.partial ? "Det markerade" : "Stycket"}</div>
              {STYLES.map((st) => (
                <button key={st.key} type="button" className={`rt-item rt-item-${st.key}${s.styleKey === st.key ? " is-on" : ""}`} onClick={() => { applyStyle(editor, st.key); setPop(null); }}>
                  <span>{st.label}</span>{s.styleKey === st.key && <Check size={14} />}
                </button>
              ))}
            </>
          )}
          {pop.kind === "size" && (
            <>
              <form className="rt-field" onSubmit={(e) => { e.preventDefault(); setSize(sizeDraft); setPop(null); }}>
                <input autoFocus inputMode="numeric" value={sizeDraft} onChange={(e) => setSizeDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} aria-label="Storlek i pixlar" />
                <span>px</span>
              </form>
              <div className="rt-sizes">
                {SIZES.map((n) => (
                  <button key={n} type="button" className={n === s.size ? "is-on" : ""} onClick={() => { setSize(n); setPop(null); }}>{n}</button>
                ))}
              </div>
              <button type="button" className="rt-item rt-reset" onClick={() => { chain().unsetFontSize().run(); setPop(null); }}>Återställ storlek</button>
            </>
          )}
          {(pop.kind === "color" || pop.kind === "highlight") && (
            <>
              <div className="rt-pop-h">{pop.kind === "color" ? "Textfärg" : "Överstrykning"}</div>
              <div className="rt-swatches">
                {(pop.kind === "color" ? TEXT_COLORS : HIGHLIGHTS).map(([c, name]) => {
                  const on = (pop.kind === "color" ? s.color : s.highlight) === c;
                  const run = () => {
                    if (pop.kind === "color") (c ? chain().setColor(c) : chain().unsetColor()).run();
                    else (c ? chain().setHighlight({ color: c }) : chain().unsetHighlight()).run();
                    setPop(null);
                  };
                  return (
                    <button key={name} type="button" title={name} className={`rt-swatch${on ? " is-on" : ""}${c ? "" : " is-none"}`} onClick={run}
                      style={pop.kind === "color" ? { color: c || "#0a0a0a" } : { background: c || "#fff" }}>
                      {pop.kind === "color" ? "A" : ""}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {pop.kind === "link" && (
            <form className="rt-field rt-linkfield" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
              <Link2 size={15} />
              <input autoFocus value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="Klistra in en länk" inputMode="url" />
              <button type="submit" className="rt-ok">{s.link ? "Spara" : "Lägg till"}</button>
              {s.link && <button type="button" className="rt-b" title="Ta bort länken" onClick={() => { chain().extendMarkRange("link").unsetLink().run(); setPop(null); }}><Unlink size={15} /></button>}
            </form>
          )}
          {pop.kind === "align" && (
            <div className="rt-inline">
              {ALIGNS.map((al) => (
                <button key={al.key} type="button" title={al.label} className={`rt-b${s.align === al.key ? " is-on" : ""}`} onClick={() => { chain().setTextAlign(al.key).run(); setPop(null); }}><al.Icon size={16} /></button>
              ))}
            </div>
          )}
          {pop.kind === "more" && (
            <>
              <button type="button" className={`rt-item${s.code ? " is-on" : ""}`} onClick={() => { chain().toggleCode().run(); setPop(null); }}><Code size={15} /><span>Kod i text</span><kbd>⌘E</kbd></button>
              <button type="button" className={`rt-item${s.codeBlock ? " is-on" : ""}`} onClick={() => { chain().toggleCodeBlock().run(); setPop(null); }}><SquareCode size={15} /><span>Kodblock</span><kbd>```</kbd></button>
              <button type="button" className="rt-item" onClick={() => { chain().setHorizontalRule().run(); setPop(null); }}><Minus size={15} /><span>Avdelare</span><kbd>---</kbd></button>
              <button type="button" className="rt-item" onClick={() => { chain().unsetAllMarks().clearNodes().run(); setPop(null); }}><RemoveFormatting size={15} /><span>Rensa formatering</span></button>
              <div className="rt-tip">Tips: skriv <kbd>/</kbd> för block, <kbd>#</kbd> för rubrik, <kbd>-</kbd> för lista.</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

