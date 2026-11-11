import React from 'react';

/**
 * IIUI institutional crest mark rendered as inline SVG.
 * Shield silhouette with a pointed-arch (mihrab) motif, university green
 * field, and gold linework.
 */
export default function IIUICrest({ size = 44 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="International Islamic University Islamabad crest"
    >
      {/* Shield body */}
      <path
        d="M32 2 L58 10 V34 C58 48.5 46.5 57.5 32 62 C17.5 57.5 6 48.5 6 34 V10 Z"
        fill="url(#iiuiCrestFill)"
        stroke="#c9a227"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Inner arch (mihrab) */}
      <path
        d="M32 13 C39.5 18 44 24 44 31.5 V46 H20 V31.5 C20 24 24.5 18 32 13 Z"
        fill="rgba(12, 47, 22, 0.55)"
        stroke="#c9a227"
        strokeOpacity="0.65"
        strokeWidth="1.4"
      />
      {/* Keystone star */}
      <circle cx="32" cy="24" r="2.6" fill="#dcb74c" />
      {/* Base rule */}
      <rect x="23" y="48.5" width="18" height="1.6" rx="0.8" fill="#c9a227" />
      <defs>
        <linearGradient id="iiuiCrestFill" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#1a5f2a" />
          <stop offset="100%" stopColor="#0e3d1c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

