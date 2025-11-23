import React, { useState, useRef } from 'react';
import { HERB_INFO } from '../constants';

interface HerbTooltipProps {
  herbName: string;
  children: React.ReactNode;
  className?: string;
}

const HerbTooltip: React.FC<HerbTooltipProps> = ({ herbName, children, className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const info = HERB_INFO[herbName];

  // Mobile: Long Press Logic
  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setTimeout(() => setIsVisible(false), 2000); 
  };

  // Desktop: Hover Logic
  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <div 
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {children}
      
      {isVisible && info && (
        <div className="absolute bottom-full left-1/2 mb-3 w-72 p-5 bg-slate-900/85 text-white text-xs rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] z-50 backdrop-blur-xl border border-white/10 animate-pop leading-relaxed pointer-events-none origin-bottom transform -translate-x-1/2">
          <div className="mb-3 pb-3 border-b border-white/10">
            <h4 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-teal-200 to-white font-serif tracking-wider mb-2">{herbName}</h4>
            <div className="opacity-90 font-light">{info.effect}</div>
          </div>
          <div>
            <span className="font-bold text-amber-200/90 block mb-1.5 text-[11px] uppercase tracking-wider">炮制作用</span>
            <div className="opacity-80 space-y-1.5">
                {info.paozhi.split('；').map((part, i) => (
                    <div key={i} className={part.startsWith('【') ? 'mt-1' : ''}>
                        {part.replace(/[；。]$/, '')}
                    </div>
                ))}
            </div>
          </div>
          {/* Triangle pointer */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/85"></div>
        </div>
      )}
    </div>
  );
};

export default HerbTooltip;