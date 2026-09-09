import { useEffect, useRef, useState } from "react";
import { doc, runTransaction } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../initializer/firebase";
import { isPlanPromptOwner, nextPlanPromptHistory } from "../js/services/plan_prompt_schedule";
import ModalDonacion from "./ModalDonacion";

export default function PlanSupportPrompt({ authInfo, blocked = false }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const shown = useRef(new Set());
  const eligible = isPlanPromptOwner(authInfo);
  const safePage = ["/", "/home"].includes(pathname.toLowerCase());
  const uid = authInfo.uid;

  useEffect(() => {
    if (!eligible || !safePage || blocked || shown.current.has(uid)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (document.visibilityState !== "visible" || document.querySelector('[role="dialog"], [aria-modal="true"], .modal.show')) return;
      try {
        const reserved = await runTransaction(db, async transaction => {
          const ref = doc(db, "negocios", uid);
          const snapshot = await transaction.get(ref);
          const business = snapshot.data();
          if (!business || business.cuentaPrincipalUid !== uid || business.premium === true ||
            (business.premiumUntil?.toMillis?.() || 0) > Date.now()) return false;
          const history = nextPlanPromptHistory(business.planSupportPromptHistory);
          if (!history) return false;
          transaction.update(ref, { planSupportPromptHistory: history });
          return true;
        });
        if (reserved) shown.current.add(uid);
        if (reserved && !cancelled && document.visibilityState === "visible" &&
          !document.querySelector('[role="dialog"], [aria-modal="true"], .modal.show')) setVisible(true);
      } catch {
        // Sin confirmar el limite compartido entre dispositivos, no interrumpir.
      }
    }, 30000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [eligible, safePage, blocked, uid]);

  return <ModalDonacion abierto={visible && eligible && safePage && !blocked}
    onCerrar={() => setVisible(false)}
    onApoyar={() => { setVisible(false); navigate("/configuracion/mi-suscripcion"); }} />;
}
