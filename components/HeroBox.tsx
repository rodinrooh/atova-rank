// Portrait 2:1 (height:width) box with hard 10px rounding
// NOTE: "2x1 aspect ratio" here means HEIGHT is 2 × WIDTH (taller than wider).
// Tailwind aspect utilities interpret aspect-[W/H], so we use aspect-[1/2] to get H = 2 * W.

export default function HeroBox({
  label,
  bg,
}: {
  label: string;
  bg: string;
}) {
  return (
    <div
      className="hero-box"
      style={{ backgroundColor: bg }}
      aria-label={label}
      role="img"
    >
      {label}
    </div>
  );
}
