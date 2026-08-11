import { motion } from "framer-motion";

const ROUTES = [
  { x1: 8,  y1: 32, cx: 38, cy:  8, x2: 72, y2: 25 },
  { x1: 18, y1: 68, cx: 52, cy: 42, x2: 90, y2: 58 },
  { x1: 5,  y1: 52, cx: 28, cy: 18, x2: 60, y2: 14 },
];

const PORT_DOTS = [
  { cx: 8,  cy: 32 }, { cx: 72, cy: 25 },
  { cx: 18, cy: 68 }, { cx: 90, cy: 58 },
  { cx: 5,  cy: 52 }, { cx: 60, cy: 14 },
];

const PARTICLES = [
  { x: 12, y: 88, s: 2.5, d: 0,   dur: 6   },
  { x: 28, y: 82, s: 3,   d: 1.2, dur: 7   },
  { x: 45, y: 91, s: 1.5, d: 2.5, dur: 5   },
  { x: 62, y: 85, s: 2,   d: 0.8, dur: 8   },
  { x: 76, y: 79, s: 2.5, d: 3,   dur: 6.5 },
  { x: 88, y: 87, s: 1.5, d: 1.5, dur: 7   },
  { x: 20, y: 74, s: 2,   d: 4,   dur: 5.5 },
  { x: 51, y: 78, s: 3,   d: 2,   dur: 7.5 },
  { x: 68, y: 93, s: 1,   d: 0.5, dur: 6   },
  { x: 35, y: 96, s: 2,   d: 3.5, dur: 8   },
  { x: 83, y: 75, s: 1.5, d: 1,   dur: 5   },
  { x: 93, y: 83, s: 2,   d: 4.5, dur: 7   },
  { x: 7,  y: 65, s: 1.8, d: 2.2, dur: 6.5 },
  { x: 55, y: 86, s: 2.2, d: 0.3, dur: 9   },
];

const HEXAGONS = [
  { x: 15, y: 20, size: 8, delay: 0 },
  { x: 78, y: 15, size: 6, delay: 1.5 },
  { x: 88, y: 42, size: 9, delay: 0.8 },
  { x: 10, y: 58, size: 7, delay: 2.3 },
  { x: 65, y: 72, size: 5, delay: 1.2 },
];

const hexPath = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  });
  return `M ${pts.join(" L ")} Z`;
};

const LoginBackground3D = () => (
  <div className="absolute inset-0 overflow-hidden select-none pointer-events-none">
    {/* Deep navy base */}
    <div className="absolute inset-0 bg-gradient-to-br from-[#060F1C] via-[#0B1A30] to-[#060F1C]" />

    {/* Orange orb — top-left */}
    <motion.div
      className="absolute -top-48 -left-48 w-[600px] h-[600px] rounded-full"
      style={{ background: "radial-gradient(circle, rgba(240,123,55,0.22) 0%, transparent 70%)" }}
      animate={{ scale: [1, 1.3, 1], x: [0, 40, 0], y: [0, 25, 0] }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
    />

    {/* Blue orb — bottom-right */}
    <motion.div
      className="absolute -bottom-48 -right-24 w-[700px] h-[700px] rounded-full"
      style={{ background: "radial-gradient(circle, rgba(26,154,214,0.18) 0%, transparent 70%)" }}
      animate={{ scale: [1, 1.22, 1], x: [0, -30, 0], y: [0, -35, 0] }}
      transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
    />

    {/* Secondary orange orb — bottom-left */}
    <motion.div
      className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full"
      style={{ background: "radial-gradient(circle, rgba(240,123,55,0.12) 0%, transparent 70%)" }}
      animate={{ scale: [1, 1.4, 1] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 4 }}
    />

    {/* Perspective grid floor */}
    <div
      className="absolute bottom-0 left-[-40%] right-[-40%] h-[58%]"
      style={{
        backgroundImage: `
          linear-gradient(rgba(240,123,55,0.11) 1px, transparent 1px),
          linear-gradient(90deg, rgba(26,154,214,0.11) 1px, transparent 1px)
        `,
        backgroundSize: "55px 55px",
        transform: "perspective(380px) rotateX(68deg)",
        transformOrigin: "bottom center",
        maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,1) 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,1) 100%)",
      }}
    />

    {/* SVG scene */}
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="glow-orange">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-blue">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Hexagonal decorations */}
      {HEXAGONS.map((h, i) => (
        <motion.path
          key={`hex-${i}`}
          d={hexPath(h.x, h.y, h.size)}
          stroke="rgba(26,154,214,0.2)"
          strokeWidth="0.3"
          fill="rgba(26,154,214,0.04)"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.8, 0.4], scale: [0.5, 1, 1], rotate: [0, 360] }}
          transition={{ duration: 20, delay: h.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}

      {/* Trade route paths */}
      {ROUTES.map((r, i) => (
        <motion.path
          key={`route-${i}`}
          d={`M ${r.x1} ${r.y1} Q ${r.cx} ${r.cy} ${r.x2} ${r.y2}`}
          stroke="rgba(240,123,55,0.38)"
          strokeWidth="0.35"
          strokeDasharray="2.5 1.8"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.5, delay: i * 0.9 + 0.5, ease: "easeOut" }}
        />
      ))}

      {/* Moving ship dots on routes */}
      {ROUTES.map((r, i) => (
        <motion.circle
          key={`moving-${i}`}
          r="1.1"
          fill="#F07B37"
          filter="url(#glow-orange)"
          animate={{
            cx: [r.x1, r.cx, r.x2, r.cx, r.x1],
            cy: [r.y1, r.cy, r.y2, r.cy, r.y1],
            opacity: [0.9, 1, 0.9, 1, 0.9],
          }}
          transition={{
            duration: 8 + i * 2.5,
            delay: i * 2 + 1.5,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Port nodes */}
      {PORT_DOTS.map((p, i) => (
        <g key={`port-${i}`}>
          <motion.circle
            cx={p.cx} cy={p.cy}
            fill="rgba(240,123,55,0.15)"
            animate={{ r: [2.5, 5, 2.5], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2.5, delay: i * 0.5, repeat: Infinity }}
          />
          <circle cx={p.cx} cy={p.cy} r="1.2" fill="#F07B37" filter="url(#glow-orange)" />
          <circle cx={p.cx} cy={p.cy} r="0.5" fill="white" />
        </g>
      ))}

      {/* Radar rings expanding from ship center */}
      {[0, 1, 2, 3, 4].map(i => (
        <motion.circle
          key={`radar-${i}`}
          cx="50" cy="52"
          stroke="rgba(26,154,214,0.45)"
          strokeWidth="0.35"
          fill="none"
          animate={{ r: [1, 45], opacity: [1, 0] }}
          transition={{
            duration: 5,
            delay: i * 1.0,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Center cross-hair */}
      <motion.circle
        cx="50" cy="52" r="2"
        stroke="rgba(26,154,214,0.6)"
        strokeWidth="0.4"
        fill="rgba(26,154,214,0.1)"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <line x1="47" y1="52" x2="53" y2="52" stroke="rgba(26,154,214,0.5)" strokeWidth="0.3" />
      <line x1="50" y1="49" x2="50" y2="55" stroke="rgba(26,154,214,0.5)" strokeWidth="0.3" />
    </svg>

    {/* Floating ship SVG */}
    <motion.div
      className="absolute"
      style={{ left: "50%", top: "48%", translateX: "-50%", translateY: "-50%" }}
      animate={{ y: [0, -22, 0], rotateZ: [-2, 2, -2] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg
        viewBox="0 0 130 130"
        width="175"
        height="175"
        fill="none"
        style={{ filter: "drop-shadow(0 0 24px rgba(26,154,214,0.45)) drop-shadow(0 8px 16px rgba(0,0,0,0.4))" }}
      >
        <path d="M 13,104 L 26,76 L 112,65 L 118,104 Z" fill="#1A9AD6" opacity="0.92" />
        <path d="M 26,76 L 112,65 L 118,76 L 26,88 Z" fill="#1383BA" opacity="0.92" />
        <rect x="33" y="54" width="72" height="13" rx="3" fill="#1484BB" />
        <rect x="45" y="42" width="48" height="13" rx="3" fill="#1078A8" />
        <rect x="57" y="31" width="26" height="12" rx="2" fill="#0D6A96" />
        <rect x="65" y="20" width="9"  height="12" rx="1.5" fill="#0A5A80" />
        <path d="M 11,108 Q 65,122 119,108" stroke="#F07B37" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </motion.div>

    {/* Animated wave layers */}
    <svg
      className="absolute bottom-0 left-0 w-full"
      viewBox="0 0 100 18"
      preserveAspectRatio="none"
      style={{ height: "130px" }}
    >
      {/* Back wave (blue) */}
      <motion.path
        fill="rgba(26,154,214,0.08)"
        animate={{
          d: [
            "M 0 14 Q 30 9, 60 14 Q 80 17, 100 13 L 100 18 L 0 18 Z",
            "M 0 14 Q 30 17, 60 14 Q 80 10, 100 14 L 100 18 L 0 18 Z",
            "M 0 14 Q 30 9, 60 14 Q 80 17, 100 13 L 100 18 L 0 18 Z",
          ],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      {/* Mid wave (orange) */}
      <motion.path
        fill="rgba(240,123,55,0.1)"
        animate={{
          d: [
            "M 0 12 Q 25 6, 50 12 Q 75 17, 100 11 L 100 18 L 0 18 Z",
            "M 0 12 Q 25 17, 50 12 Q 75 6, 100 12 L 100 18 L 0 18 Z",
            "M 0 12 Q 25 6, 50 12 Q 75 17, 100 11 L 100 18 L 0 18 Z",
          ],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Front wave (lighter) */}
      <motion.path
        fill="rgba(255,255,255,0.04)"
        animate={{
          d: [
            "M 0 15 Q 20 11, 40 15 Q 60 18, 80 14 Q 90 12, 100 15 L 100 18 L 0 18 Z",
            "M 0 15 Q 20 17, 40 15 Q 60 12, 80 16 Q 90 17, 100 15 L 100 18 L 0 18 Z",
            "M 0 15 Q 20 11, 40 15 Q 60 18, 80 14 Q 90 12, 100 15 L 100 18 L 0 18 Z",
          ],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </svg>

    {/* Rising particles */}
    {PARTICLES.map((p, i) => (
      <motion.div
        key={i}
        className="absolute rounded-full"
        style={{
          left:       `${p.x}%`,
          top:        `${p.y}%`,
          width:      `${p.s}px`,
          height:     `${p.s}px`,
          background: i % 3 === 0
            ? "rgba(240,123,55,0.75)"
            : i % 3 === 1
              ? "rgba(26,154,214,0.6)"
              : "rgba(255,255,255,0.45)",
          boxShadow: i % 3 === 0
            ? "0 0 6px rgba(240,123,55,0.6)"
            : "0 0 4px rgba(26,154,214,0.4)",
        }}
        animate={{ y: [0, -90, 0], opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
        transition={{
          duration: p.dur,
          delay:    p.d,
          repeat:   Infinity,
          ease:     "easeInOut",
        }}
      />
    ))}

    {/* Top edge light beam */}
    <div
      className="absolute top-0 left-1/4 w-px h-full opacity-10"
      style={{ background: "linear-gradient(to bottom, rgba(240,123,55,0.8), transparent)" }}
    />
    <div
      className="absolute top-0 left-2/3 w-px h-full opacity-8"
      style={{ background: "linear-gradient(to bottom, rgba(26,154,214,0.6), transparent)" }}
    />

    {/* Inner vignette for text readability */}
    <div
      className="absolute inset-0"
      style={{
        background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(6,15,28,0.55) 100%)",
      }}
    />
  </div>
);

export default LoginBackground3D;
