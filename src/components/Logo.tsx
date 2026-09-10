import Image from "next/image";
import green from "../../public/logo-green.png";
import cream from "../../public/logo-cream.png";

/**
 * Brush-lettered "Sabha" with a hand-drawn olive branch above it. A portrait
 * lockup, so it wants about 130px of width on a phone, not 170. No rule
 * through or under the wordmark.
 */
export function Logo({ width = 132, reversed = false }: { width?: number; reversed?: boolean }) {
  const src = reversed ? cream : green;
  return (
    <Image
      src={src}
      alt="Sabha"
      width={width}
      height={Math.round((width * 615) / 560)}
      className="logo"
      priority
      style={{ width, height: "auto" }}
    />
  );
}
