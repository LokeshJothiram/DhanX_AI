import React from 'react';

const Logo = ({ className = '', variant = 'default' }) => {
  // Variant determines text color for different backgrounds
  const textColorClass = variant === 'light' 
    ? 'text-white' 
    : 'text-violet-600';

  return (
    <div className={`flex items-center space-x-2.5 ${className}`}>
      <svg 
        width="32" 
        height="32" 
        viewBox="0 0 32 32" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-8 h-8"
      >
        {/* Modern, simple financial icon - stylized coin with growth arrow */}
        <rect width="32" height="32" rx="8" fill="#6D28D9"/>
        {/* Inner circle for coin effect */}
        <circle cx="16" cy="16" r="9" fill="white" opacity="0.15"/>
        <circle cx="16" cy="16" r="7" fill="white" opacity="0.25"/>
        {/* Upward trending arrow representing growth */}
        <path d="M12 20L16 12L20 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M16 12V24" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      </svg>
      <span className={`text-xl font-bold ${textColorClass} drop-shadow-sm`}>
        DhanX AI
      </span>
    </div>
  );
};

export default Logo;
