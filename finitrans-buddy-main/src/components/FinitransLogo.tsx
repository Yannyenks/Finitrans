interface FinitransLogoProps {
  variant?: "full" | "icon";
  darkBg?: boolean;
  iconSize?: number;
  className?: string;
}

const ShipArc = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 130 130"
    width={size}
    height={size}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* Outer orange arc */}
    <path d="M 65,8 Q 3,65 65,122" stroke="#F07B37" strokeWidth="11" strokeLinecap="round" />
    {/* Inner orange arc */}
    <path d="M 76,5 Q 14,65 76,125" stroke="#F07B37" strokeWidth="5" strokeLinecap="round" opacity="0.75" />

    {/* Ship hull */}
    <path d="M 13,104 L 26,76 L 112,65 L 118,104 Z" fill="#1A9AD6" />
    {/* Hull deck shadow */}
    <path d="M 26,76 L 112,65 L 118,76 L 26,88 Z" fill="#1383BA" />
    {/* Deck 1 */}
    <rect x="33" y="54" width="72" height="13" rx="3" fill="#1484BB" />
    {/* Deck 2 */}
    <rect x="45" y="42" width="48" height="13" rx="3" fill="#1078A8" />
    {/* Bridge */}
    <rect x="57" y="31" width="26" height="12" rx="2" fill="#0D6A96" />
    {/* Funnel */}
    <rect x="65" y="20" width="9" height="12" rx="1.5" fill="#0A5A80" />

    {/* Orange waterline */}
    <path d="M 11,108 Q 65,122 119,108" stroke="#F07B37" strokeWidth="7" strokeLinecap="round" />
  </svg>
);

const FinitransLogo = ({
  variant = "full",
  darkBg = false,
  iconSize = 52,
  className = "",
}: FinitransLogoProps) => {
  if (variant === "icon") {
    return <ShipArc size={iconSize} />;
  }

  const textColor = darkBg ? "#ffffff" : "#111111";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ShipArc size={iconSize} />
      <span
        style={{
          fontSize:      `${Math.round(iconSize * 0.72)}px`,
          lineHeight:    1,
          letterSpacing: "-0.02em",
          color:         textColor,
          fontFamily:    "'Plus Jakarta Sans', Arial, sans-serif",
        }}
      >
        <span style={{ fontWeight: 900 }}>FINI</span>
        <span style={{ fontWeight: 300 }}>TRANS</span>
      </span>
    </div>
  );
};

export default FinitransLogo;
