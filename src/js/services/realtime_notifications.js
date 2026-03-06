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

function contarPermisos(permisos = {}) {
  return Object.values(permisos || {}).filter((v) => v === true).length;
}

export function suscribirNotificacionesGlobales(onNotify) {
  const unsubs = [];
  const cache = {
    servicios: new Map(),
    clientes: new Map(),
    productos: new Map(),
    ventas: new Map(),
    empleados: new Map(),
  };
  const listo = {
    servicios: false,
    clientes: false,
    productos: false,
    ventas: false,
    empleados: false,
  };

  const notificar = (payload) => {
    if (typeof onNotify === "function") onNotify(payload);
  };

  unsubs.push(
    onSnapshot(
      collection(db, "servicios"),
      (snap) => {
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
            const cobradoPrev = Boolean(prev?.cobradoEnPOS);
            const cobradoNow = Boolean(data?.cobradoEnPOS);

            if (statusPrev !== statusNow) {
              const fueCobradoEnPos = !cobradoPrev && cobradoNow;
              notificar({
                tipo: "servicio",
                nivel: statusNow === "entregado" ? "baja" : "media",
                titulo: fueCobradoEnPos ? "Servicio cobrado en POS" : "Cambio de estado de servicio",
                detalle: fueCobradoEnPos
                  ? `${data?.folio || change.doc.id} - ${data?.nombre || "Cliente"}`
                  : `${data?.folio || change.doc.id}: ${prev.status || "Sin estado"} -> ${data?.status || "Sin estado"}`,
                fecha: Date.now(),
              });
            } else if (!cobradoPrev && cobradoNow) {
              notificar({
                tipo: "servicio",
                nivel: "baja",
                titulo: "Servicio cobrado en POS",
                detalle: `${data?.folio || change.doc.id} - ${data?.nombre || "Cliente"}`,
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
      },
      (error) => {
        console.warn("Notificaciones de servicios sin permisos:", error?.code || error);
      },
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "clientes"),
      (snap) => {
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
      },
      (error) => {
        console.warn("Notificaciones de clientes sin permisos:", error?.code || error);
      },
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "productos"),
      (snap) => {
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
      },
      (error) => {
        console.warn("Notificaciones de productos sin permisos:", error?.code || error);
      },
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "ventas"),
      (snap) => {
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
      },
      (error) => {
        console.warn("Notificaciones de ventas sin permisos:", error?.code || error);
      },
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "empleados"),
      (snap) => {
        if (!listo.empleados) {
          snap.docs.forEach((d) => cache.empleados.set(d.id, d.data()));
          listo.empleados = true;
          return;
        }

        snap.docChanges().forEach((change) => {
          const data = change.doc.data();
          const prev = cache.empleados.get(change.doc.id);
          const nombre = data?.nombre || prev?.nombre || "Empleado";

          if (change.type === "added") {
            notificar({
              tipo: "empleado",
              nivel: "media",
              titulo: "Nuevo empleado registrado",
              detalle: `${nombre} - ${data?.rol || "Sin rol"}`,
              fecha: Date.now(),
            });
          }

          if (change.type === "modified" && prev) {
            const cambios = [];

            if ((prev?.rol || "") !== (data?.rol || "")) {
              cambios.push(`Rol: ${prev?.rol || "-"} -> ${data?.rol || "-"}`);
            }

            if ((prev?.estado || "") !== (data?.estado || "")) {
              cambios.push(`Estado: ${prev?.estado || "-"} -> ${data?.estado || "-"}`);
            }

            const permisosPrev = contarPermisos(prev?.permisos || {});
            const permisosNow = contarPermisos(data?.permisos || {});
            if (permisosPrev !== permisosNow) {
              cambios.push(`Permisos: ${permisosNow} activos`);
            }

            if (cambios.length > 0) {
              notificar({
                tipo: "empleado",
                nivel: "baja",
                titulo: "Empleado actualizado",
                detalle: `${nombre} - ${cambios.join(" | ")}`,
                fecha: Date.now(),
              });
            }
          }

          if (change.type === "removed") {
            notificar({
              tipo: "empleado",
              nivel: "alta",
              titulo: "Empleado eliminado",
              detalle: nombre,
              fecha: Date.now(),
            });
          }

          cache.empleados.set(change.doc.id, data);
        });
      },
      (error) => {
        console.warn("Notificaciones de empleados sin permisos:", error?.code || error);
      },
    )
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
