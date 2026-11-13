import React from 'react';

interface LumaMarkProps {
  size?: number;
  className?: string;
}

export const LumaMark: React.FC<LumaMarkProps> = ({ size = 28, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx="20"
        cy="20"
        r="17"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.75"
      />
      <path
        d="M22.5 8.5C16.1487 8.5 11 13.6487 11 20C11 26.3513 16.1487 31.5 22.5 31.5C25.1 31.5 27.49 30.64 29.41 29.18C24.48 28.9 20.56 24.87 20.56 20C20.56 15.13 24.48 11.1 29.41 10.82C27.49 9.36 25.1 8.5 22.5 8.5Z"
        fill="currentColor"
      />
      <circle cx="28" cy="20" r="2.8" fill="#FF7194" />
    </svg>
  );
};
