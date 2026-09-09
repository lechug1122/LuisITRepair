import { Component, lazy, Suspense } from "react";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
const AdPanel = lazy(() => import("./AdPanel"));
class AdBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
export default function Advertising({ placement }) {
  const { puedeMostrarPublicidad, isPremium } = useAutorizacionActual();
  if (import.meta.env.DEV) {
    console.log("[ADS] isPremium:", isPremium);
    console.log("[ADS] mostrar publicidad:", puedeMostrarPublicidad);
  }
  if (!puedeMostrarPublicidad) return null;
  return <AdBoundary><Suspense fallback={null}><AdPanel placement={placement} /></Suspense></AdBoundary>;
}
