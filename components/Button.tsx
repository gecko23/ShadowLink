import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className, 
  disabled,
  ...props 
}) => {
  const baseStyles = "relative font-mono uppercase tracking-wider text-sm py-3 px-6 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-primary text-black hover:bg-primary-dim hover:shadow-[0_0_15px_rgba(0,220,130,0.4)]",
    secondary: "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700",
    danger: "bg-red-900/50 text-red-200 border border-red-900 hover:bg-red-900 hover:text-white",
    ghost: "bg-transparent text-gray-400 hover:text-white hover:bg-white/5"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Processing
        </span>
      ) : children}
    </button>
  );
};