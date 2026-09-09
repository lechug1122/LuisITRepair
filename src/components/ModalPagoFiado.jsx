import { useEffect, useState } from "react";
import { FiCreditCard, FiSearch, FiX } from "react-icons/fi";
import { buscarFiadosPorTelefono } from "../js/services/fiados_firestore";

export default function ModalPagoFiado({ mostrar, onClose, onAgregar, formatCurrency }) {
  const [telefono, setTelefono] = useState("");
  const [cuentas, setCuentas] = useState([]);
  const [cuentaId, setCuentaId] = useState("");
  const [modo, setModo] = useState("todo");
  const [cantidad, setCantidad] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mostrar) { setTelefono(""); setCuentas([]); setCuentaId(""); setModo("todo"); setCantidad(""); setError(""); }
  }, [mostrar]);
  if (!mostrar) return null;
  const cuenta = cuentas.find((item) => item.id === cuentaId) || cuentas[0] || null;
  const monto = modo === "todo" ? Number(cuenta?.saldo || 0) : Number(cantidad || 0);

  const buscar = async () => {
    if (telefono.replace(/\D/g, "").length < 10) return setError("Captura un teléfono de 10 dígitos.");
    try {
      setBuscando(true); setError("");
      const items = await buscarFiadosPorTelefono(telefono);
      setCuentas(items); setCuentaId(items[0]?.id || "");
      if (!items.length) setError("No se encontraron cuentas pendientes para este teléfono.");
    } catch { setError("No se pudieron consultar las cuentas de fiado."); }
    finally { setBuscando(false); }
  };
  const agregar = () => {
    if (!cuenta || monto <= 0 || monto > Number(cuenta.saldo)) return setError("La cantidad debe ser mayor a cero y no superar el saldo.");
    onAgregar(cuenta, monto);
  };

  return <div className="pago-fiado-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="pago-fiado-modal" role="dialog" aria-modal="true">
      <header><div><span><FiCreditCard /></span><div><small>CUENTAS POR COBRAR</small><h2>Pagar fiado</h2><p>Busca al cliente y registra su abono desde caja.</p></div></div><button onClick={onClose}><FiX /></button></header>
      <label>Teléfono del cliente</label><div className="pago-fiado-search"><input autoFocus inputMode="numeric" maxLength="10" value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0,10))} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="10 dígitos" /><button onClick={buscar} disabled={buscando}><FiSearch /> {buscando ? "Buscando..." : "Buscar"}</button></div>
      {cuentas.length > 0 && <><label>Cuenta pendiente</label><select value={cuenta?.id || ""} onChange={(e) => { setCuentaId(e.target.value); setModo("todo"); setCantidad(""); }}>{cuentas.map((item) => <option key={item.id} value={item.id}>{item.clienteNombre} · {formatCurrency(item.saldo)} · vence {item.fechaVencimiento}</option>)}</select><div className="pago-fiado-balance"><span>Saldo pendiente</span><strong>{formatCurrency(cuenta?.saldo || 0)}</strong></div><div className="pago-fiado-modes"><button className={modo === "todo" ? "active" : ""} onClick={() => setModo("todo")}>Pagar todo</button><button className={modo === "parcial" ? "active" : ""} onClick={() => setModo("parcial")}>Pagar una cantidad</button></div>{modo === "parcial" && <label>Cantidad a pagar<input type="number" min="0.01" max={cuenta?.saldo} step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0.00" /></label>}</>}
      {error && <p className="pago-fiado-error">{error}</p>}
      <footer><button onClick={onClose}>Cancelar</button><button className="primary" disabled={!cuenta || monto <= 0} onClick={agregar}>Agregar al punto de venta</button></footer>
    </section>
  </div>;
}
