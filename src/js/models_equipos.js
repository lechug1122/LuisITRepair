import Papa from "papaparse";

function parseCSVText(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

export async function cargarCatalogoEquiposDesdeTextos({ marcas, csvTexts }) {
  const datasets = await Promise.all(csvTexts.map(parseCSVText));
  const combined = datasets.flat();

  const marcasModelos = {};
  const modelosData = {};

  marcas.forEach((m) => {
    marcasModelos[m] = [];
  });

  combined.forEach((row) => {
    const name = row?.name?.trim();
    if (!name) return;

    marcas.forEach((marca) => {
      if (name.toLowerCase().includes(marca.toLowerCase())) {
        if (!marcasModelos[marca]) marcasModelos[marca] = [];

        // ✅ guardamos el name COMPLETO como "modelo"
        if (!marcasModelos[marca].includes(name)) {
          marcasModelos[marca].push(name);
        }

        // ✅ llave exacta: marca||name
        modelosData[`${marca}||${name}`] = row;
      }
    });
  });

  Object.keys(marcasModelos).forEach((k) => marcasModelos[k].sort());

  return { marcasModelos, modelosData };
}

export function obtenerSpecsPorModelo(modelosData, marca, modelo) {
  const datos = modelosData?.[`${marca}||${modelo}`];
  if (!datos) return null;

  return {
    procesador: datos.cpu_processor || "",
    ram: datos.ram_memory ? `${datos.ram_memory} GB` : "",
    disco: datos.internal_storage_gb ? `${datos.internal_storage_gb} GB` : "",
  };
}
