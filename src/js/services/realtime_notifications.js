import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../initializer/firebase";

function monedaMXN(valor) {
  return Number(valor || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

export function suscribirNotificacionesGlobales(onNotify) {
  const unsubs = [];
  const cache = {
    servicios: new Map(),
    clientes: new Map(),
    productos: new Map(),
    ventas: new Map(),
  };
  const listo = {
    servicios: false,
    clientes: false,
    productos: false,
    ventas: false,
  };

  const notificar = (payload) => {
    if (typeof onNotify === "function") onNotify(payload);
  };

  unsubs.push(
    onSnapshot(collection(db, "servicios"), (snap) => {
      if (!listo.servicios) {
        snap.docs.forEach((d) => cache.servicios.set(d.id, d.data()));
        listo.servicios = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        const data = change.doc.data();
        const prev = cache.servicios.get(change.doc.id);

        if (change.type === "added") {
          notificar({
            tipo: "servicio",
            nivel: "media",
            titulo: "Nuevo servicio",
            detalle: `${data?.folio || change.doc.id} - ${data?.nombre || "Sin nombre"}`,
            fecha: Date.now(),
          });
        }

        if (change.type === "modified" && prev) {
          const statusPrev = normalizarStatus(prev.status);
          const statusNow = normalizarStatus(data.status);
          if (statusPrev !== statusNow) {
            notificar({
              tipo: "servicio",
              nivel: statusNow === "entregado" ? "baja" : "media",
              titulo: "Cambio de estado de servicio",
              detalle: `${data?.folio || change.doc.id}: ${prev.status || "Sin estado"} -> ${data?.status || "Sin estado"}`,
              fecha: Date.now(),
            });
          }
        }

        if (change.type === "removed") {
          notificar({
            tipo: "servicio",
            nivel: "baja",
            titulo: "Servicio eliminado",
            detalle: `${data?.folio || change.doc.id}`,
            fecha: Date.now(),
          });
        }

        cache.servicios.set(change.doc.id, data);
      });
    })
  );

  unsubs.push(
    onSnapshot(collection(db, "clientes"), (snap) => {
      if (!listo.clientes) {
        snap.docs.forEach((d) => cache.clientes.set(d.id, d.data()));
        listo.clientes = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === "added") {
          notificar({
            tipo: "cliente",
            nivel: "baja",
            titulo: "Nuevo cliente",
            detalle: data?.nombre || data?.telefono || "Cliente registrado",
            fecha: Date.now(),
          });
        }
        cache.clientes.set(change.doc.id, data);
      });
    })
  );

  unsubs.push(
    onSnapshot(collection(db, "productos"), (snap) => {
      if (!listo.productos) {
        snap.docs.forEach((d) => cache.productos.set(d.id, d.data()));
        listo.productos = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        const data = change.doc.data();
        const prev = cache.productos.get(change.doc.id);

        if (change.type === "added") {
          notificar({
            tipo: "producto",
            nivel: "baja",
            titulo: "Nuevo producto",
            detalle: data?.nombre || "Producto registrado",
            fecha: Date.now(),
          });
        }

        if (change.type === "modified" && prev) {
          const stockPrev = Number(prev.stock || 0);
          const stockNow = Number(data.stock || 0);
          const min = Number(data.stockMinimo || 0);
          const cayoABajoMinimo = min > 0 && stockPrev > min && stockNow <= min;

          if (cayoABajoMinimo) {
            notificar({
              tipo: "producto",
              nivel: "alta",
              titulo: "Stock bajo",
              detalle: `${data?.nombre || "Producto"}: ${stockNow} en stock`,
              fecha: Date.now(),
            });
          }
        }

        cache.productos.set(change.doc.id, data);
      });
    })
  );

  unsubs.push(
    onSnapshot(collection(db, "ventas"), (snap) => {
      if (!listo.ventas) {
        snap.docs.forEach((d) => cache.ventas.set(d.id, d.data()));
        listo.ventas = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === "added") {
          notificar({
            tipo: "venta",
            nivel: "media",
            titulo: "Nueva venta registrada",
            detalle: `${monedaMXN(data?.total)} - ${data?.tipoPago || "Sin tipo de pago"}`,
            fecha: Date.now(),
          });
        }
        cache.ventas.set(change.doc.id, data);
      });
    })
  );

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // noop
      }
    });
  };
}
