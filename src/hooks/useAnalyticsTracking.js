import { useEffect, useRef } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../initializer/firebase";

const SESSION_KEY = "cajalibre_analytics_session";

function getSessionId() {
  try {
    const current = sessionStorage.getItem(SESSION_KEY);
    if (current) return current;
    const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function cleanText(value, maxLength = 100) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function eventBase(authInfo) {
  const userAgent = String(navigator.userAgent || "");
  const device = /Mobi|Android|iPhone|iPad/i.test(userAgent) ? "movil" : "escritorio";
  return {
    uid: authInfo.uid,
    negocioId: authInfo.cuentaPrincipalUid || authInfo.uid,
    cuentaPrincipalUid: authInfo.cuentaPrincipalUid || authInfo.uid,
    rol: cleanText(authInfo.rol, 40),
    sessionId: getSessionId(),
    dispositivo: device,
    navegador: cleanText(navigator.userAgentData?.brands?.[0]?.brand || navigator.vendor || "Navegador", 60),
    plataforma: cleanText(navigator.userAgentData?.platform || navigator.platform || "Desconocida", 60),
    versionSistema: "1.9",
    clientAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
}

function saveEvent(authInfo, data) {
  if (!authInfo?.uid) return;
  addDoc(collection(db, "analitica_eventos"), {
    ...eventBase(authInfo),
    ...data,
  }).catch(() => {
    // La analitica nunca debe interrumpir el trabajo del usuario.
  });
}

export default function useAnalyticsTracking(authInfo, pathname) {
  const authRef = useRef(authInfo);

  useEffect(() => {
    authRef.current = authInfo;
  }, [authInfo]);

  useEffect(() => {
    if (!authInfo?.uid || !pathname) return undefined;
    const startedAt = Date.now();

    saveEvent(authInfo, {
      tipo: "vista_pagina",
      ruta: cleanText(pathname, 160),
      titulo: cleanText(document.title, 120),
    });

    return () => {
      saveEvent(authInfo, {
        tipo: "tiempo_pagina",
        ruta: cleanText(pathname, 160),
        duracionMs: Math.max(0, Date.now() - startedAt),
      });
    };
  }, [authInfo, pathname]);

  useEffect(() => {
    const onClick = (event) => {
      const target = event.target?.closest?.("button, a, [role='button']");
      if (!target || !authRef.current?.uid) return;
      saveEvent(authRef.current, {
        tipo: "click",
        ruta: cleanText(window.location.pathname, 160),
        elemento: cleanText(
          target.getAttribute("aria-label") ||
            target.getAttribute("title") ||
            target.textContent ||
            target.tagName,
          100,
        ),
        etiqueta: cleanText(target.tagName, 20),
      });
    };

    const onError = (event) => {
      if (!authRef.current?.uid) return;
      saveEvent(authRef.current, {
        tipo: "error",
        ruta: cleanText(window.location.pathname, 160),
        mensaje: cleanText(event.message || "Error de JavaScript", 300),
        archivo: cleanText(event.filename, 200),
        linea: Number(event.lineno) || 0,
      });
    };

    const onRejection = (event) => {
      if (!authRef.current?.uid) return;
      const reason = event.reason;
      saveEvent(authRef.current, {
        tipo: "error",
        ruta: cleanText(window.location.pathname, 160),
        mensaje: cleanText(reason?.message || reason || "Promesa rechazada", 300),
      });
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (!authInfo?.uid) return undefined;
    const reportNavigation = () => {
      const navigation = performance.getEntriesByType("navigation")[0];
      if (!navigation) return;
      saveEvent(authInfo, {
        tipo: "rendimiento",
        ruta: cleanText(window.location.pathname, 160),
        metrica: "carga_pagina",
        duracionMs: Math.round(navigation.loadEventEnd || navigation.duration || 0),
      });
    };

    if (document.readyState === "complete") {
      window.setTimeout(reportNavigation, 0);
      return undefined;
    }
    window.addEventListener("load", reportNavigation, { once: true });
    return () => window.removeEventListener("load", reportNavigation);
  }, [authInfo]);
}
