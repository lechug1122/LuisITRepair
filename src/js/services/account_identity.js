export function normalizeEmailValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function getStoredEmailValue(raw = {}) {
  return normalizeEmailValue(raw?.correoNormalizado || raw?.correo || "");
}

export function getCreateAccountErrorMessage(error, context = "cuenta") {
  const code = String(error?.code || "").trim();

  if (code === "auth/email-already-in-use") {
    if (context === "empleado") {
      return "Ese correo ya esta registrado en Firebase. Usa otro correo o recupera la cuenta existente.";
    }

    return "Ese correo ya esta registrado en Firebase. Si esa cuenta ya existe, no la registres otra vez; usa otro correo o recupera el acceso.";
  }

  if (code === "auth/invalid-email") {
    return "El correo no es valido.";
  }

  if (code === "auth/weak-password") {
    return "La contrasena debe tener al menos 6 caracteres.";
  }

  return String(error?.message || "").trim() || "No se pudo crear la cuenta.";
}
