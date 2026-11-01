import React from 'react';

interface BrainLogoProps {
  size?: number;
  className?: string;
}

export const BrainLogo: React.FC<BrainLogoProps> = ({ size = 16, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Central neural node */}
      <circle cx="50" cy="50" r="14" fill="currentColor" />
      {/* Radiating synaptic branches */}
      <circle cx="50" cy="18" r="8" fill="currentColor" opacity="0.85" />
      <circle cx="80" cy="35" r="7.5" fill="currentColor" opacity="0.8" />
      <circle cx="78" cy="72" r="8" fill="currentColor" opacity="0.85" />
      <circle cx="50" cy="84" r="7" fill="currentColor" opacity="0.75" />
      <circle cx="22" cy="72" r="8" fill="currentColor" opacity="0.85" />
      <circle cx="20" cy="35" r="7.5" fill="currentColor" opacity="0.8" />
      {/* Synaptic interconnects */}
      <line x1="50" y1="50" x2="50" y2="18" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" opacity="0.7" />
      <line x1="50" y1="50" x2="80" y2="35" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
      <line x1="50" y1="50" x2="78" y2="72" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" opacity="0.7" />
      <line x1="50" y1="50" x2="50" y2="84" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
      <line x1="50" y1="50" x2="22" y2="72" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" opacity="0.7" />
      <line x1="50" y1="50" x2="20" y2="35" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
      {/* Outer loop links */}
      <line x1="50" y1="18" x2="80" y2="35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <line x1="80" y1="35" x2="78" y2="72" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <line x1="78" y1="72" x2="50" y2="84" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <line x1="50" y1="84" x2="22" y2="72" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <line x1="22" y1="72" x2="20" y2="35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <line x1="20" y1="35" x2="50" y2="18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
};

// Backward-compatible alias
export const ApexLogo = BrainLogo;
