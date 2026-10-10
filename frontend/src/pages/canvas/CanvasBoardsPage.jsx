import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { AgencyShell } from "../../components/agency/AgencyShell.jsx";
import { createBoard, deleteBoard, forgetBoard, listBoards, readRecent } from "./canvasApi.js";
import { coreBoardTemplate } from "./coreBoard.js";

/* /canvas — open to everyone. "New board" works without an account: the
   board's share link is the board, and this device remembers the ones you've
   opened. Logged in, your account's boards are listed too. */
export default function CanvasBoardsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [boards, setBoards] = useState([]);
  const [recent, setRecent] = useState(() => readRecent());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [askClient, setAskClient] = useState(false);
  const [client, setClient] = useState("");

  useEffect(() => {
    if (loading || !user) return;
    let alive = true;
    listBoards().then(({ ok, data }) => {
      if (alive && ok) setBoards(data.boards || []);
    });
    return () => {
      alive = false;
    };
  }, [user, loading]);

  // Blank board, or a Core board for a client: the engagement template.
  const create = async (clientName) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const core = clientName !== undefined;
    const title = core ? `Core board — ${clientName.trim() || "Client"}` : "Untitled board";
    const { ok, status, data } = await createBoard(title, {
      loggedIn: Boolean(user),
      doc: core ? coreBoardTemplate(clientName) : undefined,
    });
    setBusy(false);
    if (!ok) {
      setError(status === 429 ? "That's a lot of new boards — try again in a while." : "Couldn't create a board. Try again.");
      return;
    }
    navigate(data.board.isOwner ? `/canvas/${data.board.id}` : `/canvas/s/${data.board.shareToken}`);
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete “${b.title}”? This can't be undone.`)) return;
    const { ok } = await deleteBoard(b.id);
    if (ok) setBoards((list) => list.filter((x) => x.id !== b.id));
  };

  const forget = (b) => {
    forgetBoard(b.token);
    setRecent(readRecent());
  };

  const card = (key, href, titleText, meta, onRemove, removeLabel) => (
    <li key={key}>
      <a
        className="cb-card"
        href={href}
        onClick={(e) => {
          e.preventDefault();
          navigate(href);
        }}
      >
        <span className="cb-card-title">{titleText}</span>
        <span className="cb-card-meta">{meta}</span>
      </a>
      <button type="button" className="cb-del" onClick={onRemove} aria-label={removeLabel}>
        <Trash2 size={16} />
      </button>
    </li>
  );
  const day = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <AgencyShell css={CSS} cursor={false}>
      <section className="pc-dark cb-head" data-pc-tone="dark">
        <div className="pc-wrap">
          <p className="pc-eyebrow">Canvas</p>
          <h1 className="cb-h">Plan the content. Together.</h1>
          <p className="cb-sub">
            Paste posts from Instagram, TikTok, YouTube and Facebook, play them on the board,
            and plan around them with text and stickies — live, in the meeting.
          </p>
          {askClient ? (
            <form
              className="cb-client"
              onSubmit={(e) => {
                e.preventDefault();
                create(client);
              }}
            >
              <input
                autoFocus
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Client name"
                aria-label="Client name"
                maxLength={80}
              />
              <button type="submit" className="pc-btn pc-btn-light" disabled={busy}>
                {busy ? "Creating…" : "Create Core board"}
              </button>
              <button type="button" className="cb-cancel" onClick={() => setAskClient(false)}>Cancel</button>
            </form>
          ) : (
            <div className="cb-actions">
              <button type="button" className="pc-btn pc-btn-light" onClick={() => setAskClient(true)} disabled={busy}>
                <Plus size={18} strokeWidth={2} /> New Core board
              </button>
              <button type="button" className="pc-btn pc-btn-ghost" onClick={() => create()} disabled={busy}>
                Blank board
              </button>
            </div>
          )}
          <p className="cb-note">
            A Core board is the client engagement on one canvas: Direction, Identity, daily alignment,
            the 3-month onboarding and both 30-minute tracks — ready to edit.
          </p>
        </div>
      </section>

      <section className="pc-section cb-list">
        <div className="pc-wrap">
          {error && <p className="cb-error">{error}</p>}
          {boards.length === 0 && recent.length === 0 && (
            <p className="cb-muted">No boards yet. Start one for your next meeting — no account needed.</p>
          )}
          {boards.length > 0 && (
            <>
              <p className="pc-label">Your account</p>
              <ul className="cb-grid">
                {boards.map((b) =>
                  card(b.id, `/canvas/${b.id}`, b.title, `${b.itemCount} ${b.itemCount === 1 ? "item" : "items"} · edited ${day(b.updatedAt)}`, () => remove(b), `Delete ${b.title}`),
                )}
              </ul>
            </>
          )}
          {recent.length > 0 && (
            <div className={boards.length ? "cb-recent" : undefined}>
              <p className="pc-label">On this device</p>
              <ul className="cb-grid">
                {recent.map((b) =>
                  card(b.token, `/canvas/s/${b.token}`, b.title || "Untitled board", `Opened ${day(b.openedAt)} · anyone with the link can edit`, () => forget(b), `Remove ${b.title} from this list`),
                )}
              </ul>
            </div>
          )}
        </div>
      </section>
    </AgencyShell>
  );
}

const CSS = `
  .cb-head { padding: clamp(120px, 16vh, 168px) 0 clamp(56px, 8vw, 88px); }
  .cb-h { font-size: clamp(40px, 6vw, 80px); font-weight: 600; line-height: 1; letter-spacing: -0.04em; max-width: 14ch; }
  .cb-sub { margin: 24px 0 36px !important; max-width: 58ch; font-size: 18px; line-height: 1.55; color: rgba(255,255,255,0.7); }
  .cb-head .pc-btn svg { transition: none; }
  .cb-head .pc-btn:hover svg { transform: none; }
  .cb-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .cb-client { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 640px; }
  .cb-client input {
    flex: 1 1 240px; height: 58px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.3);
    background: rgba(255,255,255,0.06); color: #fff; font: inherit; font-size: 17px; padding: 0 24px; outline: none;
  }
  .cb-client input:focus { border-color: #fff; }
  .cb-cancel { background: none; border: 0; color: rgba(255,255,255,0.6); font: inherit; font-size: 15px; cursor: pointer; padding: 8px; }
  .cb-note { margin-top: 20px !important; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,0.5); max-width: 60ch; }
  .cb-list { padding-top: clamp(48px, 6vw, 72px); min-height: 40vh; }
  .cb-muted { color: var(--pc-grey); font-size: 16px; }
  .cb-error { color: #b42318; font-size: 16px; }
  .cb-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .cb-grid li { position: relative; }
  .cb-card {
    display: flex; flex-direction: column; justify-content: space-between; gap: 24px;
    min-height: 150px; padding: 22px; border: 1px solid rgba(0,0,0,0.14); border-radius: 16px;
    color: inherit; text-decoration: none; transition: border-color 0.2s ease, transform 0.2s ease;
  }
  .cb-card:hover { border-color: #000; transform: translateY(-2px); }
  .cb-card-title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; padding-right: 28px; }
  .cb-card-meta { font-size: 13px; color: var(--pc-grey); }
  .cb-del {
    position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 8px;
    display: grid; place-items: center; border: 0; background: transparent; color: #8a8a8a; cursor: pointer;
  }
  .cb-del:hover { background: rgba(0,0,0,0.06); color: #b42318; }
  .cb-recent { margin-top: 56px; }
`;
