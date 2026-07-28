"use client";

import { useState } from "react";

interface CoinIconProps {
  asset: string;
  size?: number;
}

const ICON_URL = "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color";

export default function CoinIcon({ asset, size = 32 }: CoinIconProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-sm border border-grid bg-panel-2"
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] font-bold text-amber">
          {asset.slice(0, 1)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={`${ICON_URL}/${asset.toLowerCase()}.png`}
      alt={asset}
      width={size}
      height={size}
      className="rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}
