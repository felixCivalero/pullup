import { Fragment } from "react";
import { useBrandId, useCurrentBrand } from "../../lib/brand.js";

/* A page that shows one brand's things (events, CRM, mail) is drawn afresh
   when the brand changes: its data is fetched again for the new brand. */
export function ByBrand({ children }) {
  const id = useBrandId();
  return <Fragment key={id || "brand"}>{children}</Fragment>;
}

/* The brand's name above a page title, so it's always clear whose events,
   people or mail are on screen. */
export function BrandKicker() {
  const brand = useCurrentBrand();
  if (!brand) return null;
  return <p className="ea-brand">{brand.name}</p>;
}

/* Things only a brand's team does (new events, mail to the guests): hidden for
   someone who co-hosts single events in the brand. */
export function TeamOnly({ children, otherwise = null }) {
  const brand = useCurrentBrand();
  return brand?.role === "event" ? otherwise : children;
}
