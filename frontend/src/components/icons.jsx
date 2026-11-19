import React from 'react';

function Svg({ size = 18, strokeWidth = 1.8, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CalendarClockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.8v3.4M16 2.8v3.4" />
      <path d="M12 12.5v3l2 1.2" />
    </Svg>
  );
}

export function DoorIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 21h16M6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21" />
      <path d="M14.5 12.5h.01" />
    </Svg>
  );
}

export function BookIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 4.8A2.8 2.8 0 0 1 6.8 2H20v17.5H6.8A2.8 2.8 0 0 0 4 22.3V4.8Z" />
      <path d="M4 19.5A2.8 2.8 0 0 1 6.8 17H20" />
    </Svg>
  );
}

export function GraduationIcon(props) {
  return (
    <Svg {...props}>
      <path d="M2.5 9.2 12 4.5l9.5 4.7L12 13.9 2.5 9.2Z" />
      <path d="M6 11.4v4.1c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.1" />
      <path d="M21.5 9.4v5.2" />
    </Svg>
  );
}

export function UsersIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 15.4c1.9.6 3.1 2.2 3.5 4.6" />
    </Svg>
  );
}

export function CalendarIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.8v3.4M16 2.8v3.4" />
    </Svg>
  );
}

export function GridIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function ShieldIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 2.8 19.5 6v5.2c0 4.6-3.1 8.2-7.5 10-4.4-1.8-7.5-5.4-7.5-10V6L12 2.8Z" />
      <path d="m9 11.8 2.2 2.2 4-4.2" />
    </Svg>
  );
}

export function AlertIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10.4 3.9 2.6 18a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.6 3.9a1.8 1.8 0 0 0-3.2 0Z" />
      <path d="M12 9v4.2M12 17h.01" />
    </Svg>
  );
}

export function TicketIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5V6.8A1.8 1.8 0 0 1 5.3 5h13.4a1.8 1.8 0 0 1 1.8 1.8v1.7a2.2 2.2 0 0 0 0 7v1.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8v-1.7a2.2 2.2 0 0 0 0-7Z" />
      <path d="M14 5v14" strokeDasharray="2 3" />
    </Svg>
  );
}

export function CollapseIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15M15 9.5l-2.5 2.5L15 14.5" />
    </Svg>
  );
}

export function ExpandIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15M12.5 9.5 15 12l-2.5 2.5" />
    </Svg>
  );
}

export function MenuIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </Svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <Svg {...props}>
      <path d="m9.5 5 7 7-7 7" />
    </Svg>
  );
}
