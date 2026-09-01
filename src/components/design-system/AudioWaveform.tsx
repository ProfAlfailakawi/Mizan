import React, { useEffect, useState } from 'react';

interface AudioWaveformProps {
  active?: boolean;
  barsCount?: number;
  height?: number;
  className?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  active = true,
  barsCount = 28,
  height = 36,
  className = ''
}) => {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: barsCount }, () => 20 + Math.random() * 60)
  );

  useEffect(() => {
    if (!active) {
      setLevels(Array.from({ length: barsCount }, () => 15));
      return;
    }
    const interval = setInterval(() => {
      setLevels(
        Array.from({ length: barsCount }, (_, idx) => {
          // Natural sine-modulated fluctuation
          const base = 20 + Math.sin(Date.now() / 200 + idx * 0.4) * 35;
          const noise = Math.random() * 25;
          return Math.min(100, Math.max(12, base + noise));
        })
      );
    }, 120);

    return () => clearInterval(interval);
  }, [active, barsCount]);

  return (
    <div
      className={`flex items-center gap-1 justify-center px-2 ${className}`}
      style={{ height: `${height}px` }}
    >
      {levels.map((lvl, i) => (
        <div
          key={i}
          className="w-1 bg-emerald-600 rounded-full transition-all duration-100 ease-out"
          style={{
            height: `${Math.max(4, (lvl / 100) * height)}px`,
            opacity: active ? 0.35 + (lvl / 100) * 0.65 : 0.2
          }}
        />
      ))}
    </div>
  );
};
