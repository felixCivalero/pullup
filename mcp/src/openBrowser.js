// Auto-open the host's default browser to a URL. Used to surface event
// previews immediately after create/update/publish so the host doesn't have
// to copy-paste from the chat.
//
// Opt out with PULLUP_MCP_AUTO_OPEN=0 for headless setups.

import { spawn } from "node:child_process";

const SHOULD_OPEN = () => {
  const flag = process.env.PULLUP_MCP_AUTO_OPEN;
  return flag !== "0" && flag !== "false" && flag !== "no";
};

export function openInBrowser(url) {
  if (!url || !SHOULD_OPEN()) return false;

  let cmd, args;
  switch (process.platform) {
    case "darwin":
      cmd = "open";
      args = [url];
      break;
    case "win32":
      // `cmd /c start "" "<url>"` — the empty title is required so the URL
      // isn't parsed as the window title.
      cmd = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      cmd = "xdg-open";
      args = [url];
  }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    // Don't fail the tool just because the browser couldn't open. The link
    // is still in the chat response.
    return false;
  }
}
