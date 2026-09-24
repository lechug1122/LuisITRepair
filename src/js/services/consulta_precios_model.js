export function priceLookupScope(negocioId, codigo) {
  const negocio = String(negocioId || "").trim();
  const barcode = String(codigo || "").trim();
  if (!negocio || negocio.includes("/")) throw new Error("No se pudo identificar el negocio.");
  if (!barcode || barcode.length > 128) throw new Error("Ingresa un código de barras válido.");
  return { negocioId: negocio, codigo: barcode, path: `negocios/${negocio}/productos` };
}

export function belongsToPriceScope(row, negocioId, collection) {
  const path = String(row.path || "").split("/");
  return path.length === 4 && path[0] === "negocios" && path[1] === negocioId && path[2] === collection
    && (!row.negocioId || row.negocioId === negocioId)
    && (!row.cuentaPrincipalUid || row.cuentaPrincipalUid === negocioId);
}

export function selectPriceProduct(rows, scope) {
  const matches = rows.filter((row) => belongsToPriceScope(row, scope.negocioId, "productos")
    && String(row.codigo ?? "").trim() === scope.codigo && row.activo !== false
    && String(row.estadoInventario || "Activo").toLowerCase() !== "inactivo"
    && row.tipo !== "servicio");
  if (matches.length > 1) throw new Error("Hay más de un producto con este código. Solicita ayuda al personal.");
  const row = matches[0];
  if (!row) return null;
  const precio = Number(row.precioVenta);
  if (row.precioVenta == null || row.precioVenta === "" || !Number.isFinite(precio) || precio < 0) {
    throw new Error("Este producto aún no tiene un precio válido. Solicita ayuda al personal.");
  }
  return {
    id: row.id, negocioId: scope.negocioId, codigo: scope.codigo,
    nombre: String(row.nombre || "Producto"),
    presentacion: String(row.presentacion || row.contenido || row.descripcion || ""),
    categoria: String(row.categoria || "Sin categoría"),
    precio, disponible: Number(row.stock || 0) > 0,
  };
}

function discountAmount(precio, tipo, valor) {
  const amount = Math.max(0, Number(valor) || 0);
  if (tipo === "gratis") return precio;
  if (tipo === "porcentaje") return Math.min(precio, precio * amount / 100);
  if (tipo === "precio_especial") return Math.max(0, precio - amount);
  return Math.min(precio, amount);
}

// Muestra las condiciones de las ofertas, sin prometer descuentos que requieran autorización.
export function pricePromotions(rows, producto, hoy) {
  if (!producto) return [];
  return rows.filter((row) => belongsToPriceScope(row, producto.negocioId, "promociones_descuentos")
    && row.activo === true && /^\d{4}-\d{2}-\d{2}$/.test(String(row.fechaInicio))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(row.fechaFin)) && row.fechaInicio <= hoy && row.fechaFin >= hoy)
    .flatMap((row) => {
      if (row.clase === "descuento") {
        if (row.autorizacion !== "sin_autorizacion") return [];
        const applicable = row.aplicaA === "todos"
          || (row.aplicaA === "productos" && (row.objetivoIds || []).includes(producto.id))
          || (row.aplicaA === "categoria" && (row.objetivoIds || []).includes(producto.categoria));
        if (!applicable || !(Number(row.valor) > 0)) return [];
        const ahorro = discountAmount(producto.precio, row.tipo, row.valor);
        return ahorro > 0 ? [{ id: row.id, nombre: row.nombre, tipo: "descuento", precio: producto.precio - ahorro }] : [];
      }
      const requisitos = Array.isArray(row.requerimientos) && row.requerimientos.length
        ? row.requerimientos : [{ productoId: row.productoRequeridoId, cantidad: row.cantidadRequerida }];
      if (!requisitos.some((req) => req.productoId === producto.id) && row.productoBeneficiadoId !== producto.id) return [];
      if (requisitos.length === 1 && requisitos[0].productoId === producto.id && row.productoBeneficiadoId === producto.id) {
        const requeridas = Math.max(1, Number(requisitos[0].cantidad) || 1);
        const beneficiadas = Math.max(1, Number(row.cantidadBeneficiada) || 1);
        const ahorro = ["gratis", "porcentaje", "precio_especial"].includes(row.beneficioTipo)
          ? discountAmount(producto.precio, row.beneficioTipo, row.beneficioValor) * beneficiadas
          : Math.min(producto.precio * beneficiadas, Math.max(0, Number(row.beneficioValor) || 0));
        if (ahorro <= 0) return [];
        return [{ id: row.id, nombre: row.nombre, tipo: "paquete", cantidad: requeridas + beneficiadas,
          precio: (requeridas + beneficiadas) * producto.precio - ahorro }];
      }
      const compra = requisitos.map((req) => `${req.cantidad || 1} ${req.productoNombre || "producto participante"}`).join(" + ");
      const beneficio = row.beneficioTipo === "gratis" ? "gratis"
        : row.beneficioTipo === "porcentaje" ? `con ${row.beneficioValor}% de descuento`
          : row.beneficioTipo === "precio_especial" ? "a precio especial" : "con descuento";
      return [{ id: row.id, nombre: row.nombre, tipo: "condicionada",
        detalle: `Compra ${compra} y obtén ${row.cantidadBeneficiada || 1} ${row.productoBeneficiadoNombre || "producto participante"} ${beneficio}.` }];
    });
}
