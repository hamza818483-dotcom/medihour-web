import React from 'react';

export const MaleAvatar = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="10" fill="#E2E8F0" />
    <path
      d="M12 13C14.2091 13 16 11.2091 16 9C16 6.79086 14.2091 5 12 5C9.79086 5 8 6.79086 8 9C8 11.2091 9.79086 13 12 13Z"
      fill="#475569"
    />
    <path
      d="M12 15C8.13401 15 5 18.134 5 22H19C19 18.134 15.866 15 12 15Z"
      fill="#475569"
    />
  </svg>
);

export const FemaleAvatar = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="10" fill="#E2E8F0" />
    <path
      d="M12 13C14.2091 13 16 11.2091 16 9C16 6.79086 14.2091 5 12 5C9.79086 5 8 6.79086 8 9C8 11.2091 9.79086 13 12 13Z"
      fill="#EC4899"
    />
    <path
      d="M12 15C8.13401 15 5 18.134 5 22H19C19 18.134 15.866 15 12 15Z"
      fill="#EC4899"
    />
    <path
        d="M16.5 9.5C16.5 9.5 17 11 15.5 12.5"
        stroke="#EC4899"
        strokeWidth="1"
        strokeLinecap="round"
    />
     <path
        d="M7.5 9.5C7.5 9.5 7 11 8.5 12.5"
        stroke="#EC4899"
        strokeWidth="1"
        strokeLinecap="round"
    />
  </svg>
);
