import React from 'react';

export default function Icon({ name = 'box', className = '' }) {
  const size = 36;
  switch (name) {
    case 'empresa':
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7l9-4 9 4v8l-9 4-9-4V7z" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="#FFEDD5" />
          <path d="M12 3v10" stroke="#B45309" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'empleados':
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="8" r="3" stroke="#0EA5E9" strokeWidth="1.2" fill="#E0F2FE" />
          <path d="M2 20c1.5-4 6-6 10-6s8.5 2 10 6" stroke="#0284C7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'pos':
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="4" width="18" height="7" rx="1.5" stroke="#0EA5E9" strokeWidth="1.2" fill="#EFF6FF" />
          <rect x="6" y="13" width="12" height="6" rx="1" stroke="#0EA5E9" strokeWidth="1" fill="#DBEAFE" />
        </svg>
      );
    case 'inventario':
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l8 4-8 4-8-4 8-4z" stroke="#16A34A" strokeWidth="1.2" fill="#ECFDF5" />
          <path d="M4 10v6l8 4 8-4v-6" stroke="#15803D" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case 'servicios':
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2v6" stroke="#7C3AED" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="16" r="4" stroke="#7C3AED" strokeWidth="1.2" fill="#F5F3FF" />
        </svg>
      );
    case 'respaldo':
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="#059669" strokeWidth="1.2" fill="#ECFDF5" />
          <path d="M12 9v6" stroke="#047857" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M9 12l3-3 3 3" stroke="#047857" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="#374151" strokeWidth="1" fill="#F8FAFC" />
        </svg>
      );
  }
}
