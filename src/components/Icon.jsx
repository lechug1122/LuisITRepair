import React from "react";

export default function Icon({ name = "box", className = "" }) {
  const size = 36;

  switch (name) {
    case "empresa":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7l9-4 9 4v8l-9 4-9-4V7z" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="#FFEDD5" />
          <path d="M12 3v10" stroke="#B45309" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "empleados":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="8" r="3" stroke="#0EA5E9" strokeWidth="1.4" fill="#E0F2FE" />
          <circle cx="17" cy="9" r="2" stroke="#0284C7" strokeWidth="1.3" fill="#E0F2FE" />
          <path d="M2.5 20c1.3-3.8 5.3-5.6 8.5-5.6 3.1 0 7.1 1.8 8.5 5.6" stroke="#0284C7" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );

    case "pos":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="4" width="18" height="7" rx="1.8" stroke="#0EA5E9" strokeWidth="1.4" fill="#EFF6FF" />
          <rect x="6" y="13" width="12" height="7" rx="1.2" stroke="#0EA5E9" strokeWidth="1.2" fill="#DBEAFE" />
          <path d="M8 16.5h3" stroke="#0284C7" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case "inventario":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l8 4-8 4-8-4 8-4z" stroke="#16A34A" strokeWidth="1.4" fill="#ECFDF5" />
          <path d="M4 10v6l8 4 8-4v-6" stroke="#15803D" strokeWidth="1.4" fill="none" />
          <path d="M12 10v10" stroke="#15803D" strokeWidth="1.2" />
        </svg>
      );

    case "servicios":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3h2" stroke="#7C3AED" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12 3v5" stroke="#7C3AED" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="15.5" r="4.5" stroke="#7C3AED" strokeWidth="1.4" fill="#F5F3FF" />
        </svg>
      );

    case "metodos":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2.5" y="5" width="19" height="14" rx="2" stroke="#475569" strokeWidth="1.3" fill="#F8FAFC" />
          <path d="M2.5 9h19" stroke="#475569" strokeWidth="1.2" />
          <circle cx="18" cy="14.5" r="1.2" fill="#64748B" />
        </svg>
      );

    case "impresoras":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="3" width="12" height="5" rx="1" stroke="#334155" strokeWidth="1.3" fill="#E2E8F0" />
          <rect x="4" y="8" width="16" height="8" rx="2" stroke="#334155" strokeWidth="1.3" fill="#F8FAFC" />
          <rect x="7" y="14" width="10" height="7" rx="1" stroke="#334155" strokeWidth="1.3" fill="#E2E8F0" />
        </svg>
      );

    case "apariencia":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3c4.97 0 9 4.03 9 9 0 3.6-2.14 6.69-5.21 8.11-.86.4-1.79-.26-1.72-1.21.07-.95.53-1.85 1.28-2.47.9-.75 1.48-1.87 1.48-3.13 0-2.26-1.83-4.09-4.09-4.09h-.74A2.98 2.98 0 019 6.24C9 4.45 10.45 3 12.24 3H12z" fill="#FDE68A" stroke="#D97706" strokeWidth="1.1" />
          <circle cx="8" cy="8" r="1" fill="#A855F7" />
          <circle cx="7" cy="12" r="1" fill="#0EA5E9" />
          <circle cx="9.5" cy="15.5" r="1" fill="#22C55E" />
        </svg>
      );

    case "notificaciones":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 10a6 6 0 1112 0v4l1.5 2.5H4.5L6 14v-4z" stroke="#475569" strokeWidth="1.3" fill="#F8FAFC" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 004 0" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="18.5" cy="5.5" r="2" fill="#EF4444" />
        </svg>
      );

    case "respaldo":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="#059669" strokeWidth="1.3" fill="#ECFDF5" />
          <path d="M12 9v6" stroke="#047857" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M9 12l3-3 3 3" stroke="#047857" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "seguridad":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3l7 3v5c0 4.4-2.7 8.3-7 10-4.3-1.7-7-5.6-7-10V6l7-3z" stroke="#0F766E" strokeWidth="1.3" fill="#CCFBF1" />
          <path d="M9.5 11.5a2.5 2.5 0 115 0v2.5h-5v-2.5z" stroke="#0F766E" strokeWidth="1.2" fill="#99F6E4" />
        </svg>
      );

    case "integraciones":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="10" width="7" height="7" rx="1.5" stroke="#1D4ED8" strokeWidth="1.2" fill="#DBEAFE" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#7C3AED" strokeWidth="1.2" fill="#F3E8FF" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#16A34A" strokeWidth="1.2" fill="#DCFCE7" />
          <path d="M10 13h4" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M17.5 10v4" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
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
