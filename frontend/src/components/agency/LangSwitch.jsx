import { Globe } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { LANGS, setLang, useLang } from "./i18n.js";

/* EN · SV · SW in the nav. A small pill showing the current language with a
   native <select> laid over it: a dropdown on desktop, the phone's own picker
   on mobile, keyboard and screen readers for free. */
export function LangSwitch() {
  const lang = useLang();
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  return (
    <label className="pc-lang">
      <Globe size={15} strokeWidth={1.75} aria-hidden="true" />
      <span aria-hidden="true">{cur.short}</span>
      <select
        aria-label="Language / Språk / Lugha"
        value={lang}
        onChange={(e) => {
          trackEvent("lang_switch", { from: lang, to: e.target.value });
          setLang(e.target.value);
        }}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
