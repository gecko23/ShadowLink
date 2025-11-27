import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, icon, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-xs text-gray-500 font-mono uppercase tracking-wider">{label}</label>}
      <div className="relative group">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
            {icon}
          </div>
        )}
        <input
          {...props}
          className={`
            w-full bg-surface border border-zinc-800 rounded-lg py-3 
            ${icon ? 'pl-10' : 'pl-4'} pr-4 
            text-gray-100 placeholder-gray-600 focus:outline-none focus:border-primary 
            focus:ring-1 focus:ring-primary/50 transition-all font-mono
            ${className}
          `}
        />
      </div>
    </div>
  );
};