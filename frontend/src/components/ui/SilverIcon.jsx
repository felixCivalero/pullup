// Wrapper so Lucide icons render as silver details by default
// Glitter: soft silver glow + gentle pulse like jewelry lit in darkness
import { iconStyle, glitter } from "../../theme/colors.js";

export function SilverIcon({ as: Icon, size = 18, style = {}, noGlitter = false, ...props }) {
  if (!Icon) return null;
  const baseStyle = {
    ...iconStyle,
    ...(noGlitter ? {} : { filter: glitter.filter }),
    ...style,
  };
  return (
    <span className={noGlitter ? undefined : "silver-icon-glitter"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Icon
        size={size}
        strokeWidth={1.75}
        style={baseStyle}
        {...props}
      />
    </span>
  );
}
