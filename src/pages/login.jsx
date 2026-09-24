import { useCallback, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "../initializer/firebase";
import {
  buscarMembresiaDeUsuario,
  obtenerEstadoAutorizacion,
} from "../js/services/autorizacion";
import { consumeDeviceConflictMessage } from "../js/services/device_sessions";
import { PREMIUM_SITE_URL } from "../js/services/premium_config";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { crearNegocioInicial, obtenerNegocio } from "../js/services/negocios";
import { permisosBasePorRol } from "../js/services/permisos";
import {
  RUTA_LOGIN,
  registrarRedireccion,
  resolverRutaSesion,
} from "../js/services/ruta_sesion";
import { mensajeDeErrorAcceso } from "../js/services/suscripciones";
import { getDocRef, saveTenantContext } from "../js/services/tenant";
import intlTelInput from "intl-tel-input";
import "intl-tel-input/styles";
import "../css/login.scss";
import "../css/sesion_dispositivo.css";

const SYSTEM_NAME = "CajaLibre";

function normalizeDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function validateEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

function validateRegistroFields({ nombre, nombreNegocio, telefono, email, password, confirmPassword }) {
  const errors = {};
  const nombreLimpio = String(nombre || "").trim();
  const negocioLimpio = String(nombreNegocio || "").trim();
  const telefonoDigits = normalizeDigits(telefono);
  const correoLimpio = String(email || "").trim();

  if (nombreLimpio.length < 3) {
    errors.nombre = "Escribe tu nombre completo.";
  }

  if (negocioLimpio.length < 3) {
    errors.nombreNegocio = "Escribe el nombre de tu negocio.";
  }

  if (telefonoDigits.length < 7) {
    errors.telefono = "Ingresa un número telefónico válido.";
  }

  if (!validateEmail(correoLimpio)) {
    errors.email = "Ingresa un correo valido.";
  }

  if (String(password || "").length < 8) {
    errors.password = "Usa al menos 8 caracteres.";
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = "Combina letras y numeros.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirma tu contrasena.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Las contrasenas no coinciden.";
  }

  return errors;
}

function validateLoginFields({ email, password }) {
  const errors = {};

  if (!validateEmail(email)) {
    errors.email = "Ingresa un correo valido.";
  }

  if (!password) {
    errors.password = "Ingresa tu contrasena.";
  }

  return errors;
}

function getFriendlyLoginError(error) {
  const code = String(error?.code || "").trim();
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-email"
  ) {
    return "Credenciales incorrectas.";
  }

  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "No se pudo validar tu acceso. Revisa permisos y reglas de Firestore.";
  }

  if (code === "auth/email-already-in-use") {
    return "Ese correo ya esta registrado. Inicia sesion o usa otro correo.";
  }

  if (code === "auth/weak-password") {
    return "La contrasena debe tener al menos 6 caracteres.";
  }

  return String(error?.message || "").trim() || "No se pudo iniciar sesion.";
}

function buildAdministradorInicial({
  uid,
  nombre = "",
  telefono = "",
  correo = "",
} = {}) {
  const correoLimpio = String(correo || "").trim();
  return {
    activo: true,
    online: true,
    lastActive: serverTimestamp(),
    rol: "Administrador",
    permisos: permisosBasePorRol("Administrador"),
    superAdmin: false,
    accesoAnalitica: false,
    nombre: String(nombre || "").trim() || correoLimpio.split("@")[0] || "Administrador",
    telefono: String(telefono || "").trim(),
    correo: correoLimpio,
    correoNormalizado: correoLimpio.toLowerCase(),
    cuentaPrincipalUid: uid,
    negocioId: uid,
    suscripcionControlada: false,
    terminosAceptados: false,
    terminosVersion: "",
    setupCompleto: false,
    esCuentaPrincipal: true,
    createdAt: serverTimestamp(),
  };
}

class AccesoBloqueadoError extends Error {}

/**
 * Repara una cuenta autenticada que se quedo sin documento en `autorizados`.
 *
 * Nunca crea un negocio nuevo si el usuario ya pertenece a uno: eso es lo que
 * convertia a un empleado en dueno de un negocio duplicado. Si el negocio
 * propio ya existe, solo se reconstruye el perfil heredando su onboarding.
 */
async function repararRegistroIncompleto(user, { perfilExiste = false, negocioPropio = null } = {}) {
  const administrador = buildAdministradorInicial({
    uid: user.uid,
    nombre: user.displayName || "",
    correo: user.email || "",
  });

  if (negocioPropio) {
    // El negocio ya existe: solo falta el perfil. Se heredan sus marcas de
    // onboarding para no devolver al dueno a la configuracion inicial.
    await setDoc(
      doc(db, "autorizados", user.uid),
      {
        ...administrador,
        terminosAceptados: negocioPropio.terminosAceptados === true,
        terminosVersion: negocioPropio.terminosVersion || "",
        setupCompleto: negocioPropio.setupCompleto === true,
      },
      { merge: true },
    );
    return;
  }

  // Este documento debe existir antes de crear el resto: las reglas lo usan
  // para resolver el tenant y los permisos de las escrituras posteriores.
  // Si el perfil ya existe no se toca: solo faltaba el negocio.
  if (!perfilExiste) {
    await setDoc(doc(db, "autorizados", user.uid), administrador, { merge: true });
  }
  await crearNegocioInicial({
    negocioId: user.uid,
    administradorUid: user.uid,
    nombre: "Mi negocio",
    correo: user.email || "",
  });

  const batch = writeBatch(db);
  batch.set(
    getDocRef("empleados", `principal_${user.uid}`, user.uid),
    {
      ...administrador,
      uid: user.uid,
      estado: "Activo",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    getDocRef("configuracion", "empresa", user.uid),
    {
      nombre: "Mi negocio",
      subtitulo: "",
      telefono: "",
      negocioId: user.uid,
      cuentaPrincipalUid: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit().catch((error) => {
    console.warn("[registro] No se pudieron recuperar datos secundarios:", error?.code || error);
  });
}

/**
 * Resuelve la sesion completa de un usuario ya autenticado.
 *
 * Solo cuando Firestore confirma que NO existe perfil ni relacion con ningun
 * negocio se repara/crea la cuenta propia. Cualquier duda (error de lectura,
 * ficha de empleado encontrada) detiene el proceso con un mensaje claro.
 */
async function resolverSesionUsuario(user) {
  let estado = await obtenerEstadoAutorizacion(user.uid);
  if (!estado.requiereCrearNegocio) return estado;

  const membresia = await buscarMembresiaDeUsuario(user.uid);

  if (membresia.negocioId && !membresia.esTitular) {
    throw new AccesoBloqueadoError(
      "Tu cuenta pertenece a un negocio, pero todavia no tiene el acceso configurado. Pide al administrador que vuelva a darte de alta.",
    );
  }

  if (membresia.error && !membresia.negocioId) {
    throw new AccesoBloqueadoError(
      mensajeDeErrorAcceso(
        membresia.error,
        "No se pudo confirmar a que negocio perteneces. Intenta de nuevo antes de crear uno nuevo.",
      ),
    );
  }

  const negocioPropio = membresia.esTitular && membresia.negocioId
    ? await obtenerNegocio(membresia.negocioId)
    : null;

  await repararRegistroIncompleto(user, {
    perfilExiste: estado.perfilExiste === true,
    negocioPropio,
  });
  estado = await obtenerEstadoAutorizacion(user.uid);
  return estado;
}

/**
 * Espera a que el registro recien creado sea visible para las consultas.
 *
 * Sin esta confirmacion la cuenta nueva podia llegar a la ruta protegida antes
 * de que existiera su negocio y rebotar por un instante.
 */
async function esperarRegistroListo(user, intentos = 6) {
  let estado = null;

  for (let intento = 0; intento < intentos; intento += 1) {
    estado = await obtenerEstadoAutorizacion(user.uid);
    if (estado.motivo !== "sin_negocio" && estado.motivo !== "sin_autorizacion") return estado;
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }

  return estado;
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeAccessMessage = String(location.state?.accessMessage || "").trim();
  const [modoRegistro, setModoRegistro] = useState(Boolean(location.state?.register));
  const [nombre, setNombre] = useState("");
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  // Aviso dejado por el equipo que fue reemplazado desde otro dispositivo.
  const [avisoSesion, setAvisoSesion] = useState(() => consumeDeviceConflictMessage());
  const phoneInputRef = useRef(null);
  const phonePluginRef = useRef(null);

  // El login NO decide el destino por su cuenta: lee el mismo estado de sesion
  // que las guardias de ruta. Cuando ambos leian fuentes distintas podian
  // contradecirse y producir el ciclo /login <-> /home.
  const {
    loading: sesionCargando,
    uid: sesionUid,
    rol: sesionRol,
    cuentaPrincipalUid: sesionCuentaPrincipalUid,
    negocioId: sesionNegocioId,
    superAdmin: sesionSuperAdmin,
    suscripcionControlada: sesionSuscripcionControlada,
    accesoPermitido,
    motivoAcceso,
    mensajeAcceso,
    requiereCrearNegocio,
  } = useAutorizacionActual();
  const reparacionRef = useRef("");

  const guardarContextoSesion = useCallback(() => {
    if (!sesionUid) return;
    saveTenantContext({
      uid: sesionUid,
      cuentaPrincipalUid: sesionCuentaPrincipalUid || sesionUid,
      negocioId: sesionNegocioId || sesionCuentaPrincipalUid || sesionUid,
      superAdmin: sesionSuperAdmin === true,
      suscripcionControlada: sesionSuscripcionControlada === true,
    });
    localStorage.setItem("rol", sesionRol || "");
  }, [
    sesionCuentaPrincipalUid,
    sesionNegocioId,
    sesionRol,
    sesionSuperAdmin,
    sesionSuscripcionControlada,
    sesionUid,
  ]);

  useEffect(() => {
    // 1. Nada se decide mientras la sesion sigue resolviendose.
    if (sesionCargando) return undefined;
    // 2. Sin sesion activa el formulario simplemente espera.
    if (!sesionUid) return undefined;
    // 3. Durante un alta o un ingreso en curso manda ese flujo; al terminar,
    //    este efecto vuelve a evaluar con el estado ya definitivo.
    if (procesando) return undefined;

    let active = true;

    // 4. Un error de lectura se informa; no se navega a ningun lado.
    if (motivoAcceso === "error_carga") {
      setError(mensajeAcceso || "No se pudo validar tu acceso.");
      return undefined;
    }

    // 5. Cuenta autenticada sin perfil ni negocio: se intenta reparar una sola
    //    vez por usuario. El listener de autorizacion avisara del resultado.
    if (requiereCrearNegocio) {
      if (reparacionRef.current !== sesionUid) {
        reparacionRef.current = sesionUid;
        resolverSesionUsuario(auth.currentUser)
          .catch(async (error) => {
            if (!active) return;
            setError(getFriendlyLoginError(error));
            await signOut(auth).catch(() => {});
          });
      }
      return () => {
        active = false;
      };
    }

    const destino = resolverRutaSesion({
      loading: sesionCargando,
      uid: sesionUid,
      accesoPermitido,
      motivoAcceso,
    });

    // 6. Con destino real se navega una sola vez.
    if (destino.ruta && destino.ruta !== RUTA_LOGIN) {
      registrarRedireccion("Login", RUTA_LOGIN, destino.ruta, destino.motivo);
      guardarContextoSesion();
      navigate(destino.ruta, { replace: true });
      return () => {
        active = false;
      };
    }

    // 7. Sesion sin acceso y sin pantalla que lo resuelva: se informa aqui
    //    mismo. Antes esto rebotaba a /home y volvia, agotando el navegador.
    setError(mensajeAcceso || "No tienes acceso a este sistema.");

    return () => {
      active = false;
    };
  }, [
    accesoPermitido,
    guardarContextoSesion,
    mensajeAcceso,
    motivoAcceso,
    navigate,
    procesando,
    requiereCrearNegocio,
    sesionCargando,
    sesionUid,
  ]);

  useEffect(() => {
    if (!modoRegistro || !phoneInputRef.current) return undefined;

    const input = phoneInputRef.current;
    const instance = intlTelInput(input, {
      initialCountry: "mx",
      separateDialCode: true,
      strictMode: true,
      loadUtils: () => import("intl-tel-input/utils"),
    });
    phonePluginRef.current = instance;

    const syncPhone = () => {
      const international = instance.getNumber();
      if (international) setTelefono(international);
    };
    // Algunos navegadores muestran la bandera inicial, pero el plugin todavía
    // no registra internamente el país hasta que el usuario lo selecciona.
    // Forzarlo antes y después de cargar las utilidades deja México (+52)
    // realmente activo desde el primer intento.
    instance.setSelectedCountry("mx");
    instance.promise
      .then(() => {
        if (phonePluginRef.current !== instance) return;
        if (!instance.getSelectedCountry()?.iso2) {
          instance.setSelectedCountry("mx");
        }
        syncPhone();
      })
      .catch(() => {});
    input.addEventListener("countrychange", syncPhone);

    return () => {
      input.removeEventListener("countrychange", syncPhone);
      instance.destroy();
      if (phonePluginRef.current === instance) phonePluginRef.current = null;
    };
  }, [modoRegistro]);
  const accessMessage = routeAccessMessage;

  const clearAccessMessage = () => {
    if (!routeAccessMessage) return;
    navigate(location.pathname, { replace: true, state: {} });
  };

  const limpiarMensajes = () => {
    setError("");
    clearAccessMessage();
  };

  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateField = async (field) => {
    if (field === "telefono" && phonePluginRef.current?.promise) {
      await phonePluginRef.current.promise.catch(() => {});
    }

    const telefonoActual = field === "telefono"
      ? phonePluginRef.current?.getNumber() || phoneInputRef.current?.value || telefono
      : telefono;
    const values = {
      nombre,
      nombreNegocio,
      telefono: telefonoActual,
      email,
      password,
      confirmPassword,
    };
    const nextErrors = modoRegistro
      ? validateRegistroFields(values)
      : validateLoginFields(values);
    const telefonoValido = field === "telefono"
      ? phonePluginRef.current?.isValidNumber()
      : null;
    if (
      modoRegistro &&
      phonePluginRef.current &&
      telefonoValido === false
    ) {
      nextErrors.telefono = "Ingresa un número telefónico válido para el país seleccionado.";
    }

    setFieldErrors((prev) => {
      const next = { ...prev };
      if (nextErrors[field]) {
        next[field] = nextErrors[field];
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      const user = userCredential.user;
      // Repara la cuenta si hiciera falta y confirma que hay acceso. La
      // navegacion queda en manos del efecto de sesion: un solo responsable.
      reparacionRef.current = user.uid;
      const estado = await resolverSesionUsuario(user);

      // Un fallo de lectura no es falta de acceso: se informa y se conserva la
      // sesion, porque el listener en tiempo real puede resolverla enseguida.
      if (estado.esError) {
        setError(estado.mensaje || "No se pudo validar tu acceso.");
        return;
      }

      // Si el motivo no tiene pantalla que lo resuelva, el acceso es terminal.
      const destinoTrasLogin = resolverRutaSesion({
        loading: false,
        uid: user.uid,
        accesoPermitido: estado.permitido,
        motivoAcceso: estado.motivo,
      });

      if (destinoTrasLogin.ruta === RUTA_LOGIN) {
        await signOut(auth);
        setError(estado.mensaje || "No tienes acceso a este sistema.");
        return;
      }

      const docRef = doc(db, "autorizados", user.uid);
      await updateDoc(docRef, {
        activo: true,
        online: true,
        lastActive: new Date(),
      }).catch(() => {});
    } catch (error) {
      await signOut(auth).catch(() => {});
      setError(getFriendlyLoginError(error));
    }
  };

  const handleRegistro = async (telefonoRegistro = telefono) => {
    const nombreLimpio = nombre.trim();
    const negocioLimpio = nombreNegocio.trim();
    const telefonoLimpio = String(telefonoRegistro || "").trim();
    const correoLimpio = email.trim();

    try {
      // Cada cuenta nueva debe comenzar su propio asistente desde el primer paso.
      try {
        window.sessionStorage.removeItem("cajalibre_onboarding_step");
        window.sessionStorage.removeItem("cajalibre_onboarding_form");
      } catch {
        // El registro puede continuar aunque el almacenamiento esté bloqueado.
      }

      const userCredential = await createUserWithEmailAndPassword(auth, correoLimpio, password);
      const user = userCredential.user;
      // El alta la esta creando este mismo flujo: el efecto de sesion no debe
      // intentar "reparar" la cuenta mientras se escriben los documentos.
      reparacionRef.current = user.uid;
      const administrador = buildAdministradorInicial({
        uid: user.uid,
        nombre: nombreLimpio,
        telefono: telefonoLimpio,
        correo: correoLimpio,
      });

      saveTenantContext({
        uid: user.uid,
        cuentaPrincipalUid: user.uid,
        superAdmin: false,
        suscripcionControlada: false,
      });

      // Se guarda primero porque las reglas de las demás colecciones consultan
      // este documento para reconocer al administrador y su negocio.
      await setDoc(doc(db, "autorizados", user.uid), administrador);
      await crearNegocioInicial({
        negocioId: user.uid,
        administradorUid: user.uid,
        nombre: negocioLimpio,
        telefono: telefonoLimpio,
        correo: correoLimpio,
      });

      const batch = writeBatch(db);
      batch.set(getDocRef("empleados", `principal_${user.uid}`, user.uid), {
        ...administrador,
        uid: user.uid,
        estado: "Activo",
        updatedAt: serverTimestamp(),
      });

      batch.set(getDocRef("configuracion", "empresa", user.uid), {
        nombre: negocioLimpio,
        subtitulo: "",
        telefono: telefonoLimpio,
        negocioId: user.uid,
        cuentaPrincipalUid: user.uid,
        updatedAt: serverTimestamp(),
      });

      await batch.commit().catch((error) => {
        console.warn("[registro] No se pudieron crear datos secundarios:", error?.code || error);
      });
      // Se espera a que el alta sea visible para las consultas; a partir de
      // ahi, el efecto de sesion decide la pantalla (Terminos).
      await esperarRegistroListo(user);
    } catch (error) {
      await signOut(auth).catch(() => {});
      setError(getFriendlyLoginError(error));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    limpiarMensajes();
    if (procesando) return;

    if (modoRegistro && phonePluginRef.current?.promise) {
      await phonePluginRef.current.promise.catch(() => {});
    }
    const telefonoInternacional = modoRegistro
      ? phonePluginRef.current?.getNumber()
        || `+${phonePluginRef.current?.getSelectedCountry()?.dialCode || "52"}${normalizeDigits(telefono)}`
      : telefono;
    const values = {
      nombre,
      nombreNegocio,
      telefono: telefonoInternacional,
      email,
      password,
      confirmPassword,
    };
    const nextErrors = modoRegistro
      ? validateRegistroFields(values)
      : validateLoginFields(values);

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Revisa los campos marcados antes de continuar.");
      return;
    }

    try {
      setProcesando(true);
      if (modoRegistro) {
        await handleRegistro(telefonoInternacional);
      } else {
        await handleLogin();
      }
    } finally {
      setProcesando(false);
    }
  };

  const cambiarModo = () => {
    setModoRegistro((prev) => !prev);
    setError("");
    setFieldErrors({});
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="login-page">
      <div className={`session ${modoRegistro ? "session-register" : ""}`}>
        <div className="left">
          <svg
            enableBackground="new 0 0 300 302.5"
            viewBox="0 0 300 302.5"
            xmlns="http://www.w3.org/2000/svg"
          >
            <style>{`.st0{fill:#fff;}`}</style>
            <path
              className="st0"
              d="m126 302.2c-2.3 0.7-5.7 0.2-7.7-1.2l-105-71.6c-2-1.3-3.7-4.4-3.9-6.7l-9.4-126.7c-0.2-2.4 1.1-5.6 2.8-7.2l93.2-86.4c1.7-1.6 5.1-2.6 7.4-2.3l125.6 18.9c2.3 0.4 5.2 2.3 6.4 4.4l63.5 110.1c1.2 2 1.4 5.5 0.6 7.7l-46.4 118.3c-0.9 2.2-3.4 4.6-5.7 5.3l-121.4 37.4z"
            />
          </svg>
        </div>

        <form className="log-in" autoComplete="off" onSubmit={handleSubmit} noValidate>
          {avisoSesion ? (
            <div className="device-session-notice" role="status">
              <h3>{avisoSesion.titulo}</h3>
              <p>{avisoSesion.mensaje}</p>
              <div className="device-session-notice-actions">
                <button
                  type="button"
                  className="emp-btn emp-btn-primary"
                  onClick={() => setAvisoSesion(null)}
                >
                  Aceptar
                </button>
                {avisoSesion.mostrarPremium ? (
                  <button
                    type="button"
                    className="emp-btn emp-btn-soft"
                    onClick={() => {
                      window.open(PREMIUM_SITE_URL, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Conocer Premium
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <h4>
            {modoRegistro ? "Crea tu cuenta en " : "Bienvenido a "}
            <span>{SYSTEM_NAME}</span>
          </h4>

          <p>
            {modoRegistro
              ? "Registra tu negocio y empieza con una cuenta administradora."
              : "Inicia sesion para entrar al negocio que tienes configurado."}
          </p>

          {modoRegistro && (
            <div className="login-form-grid">
              <div className="floating-label">
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => {
                    limpiarMensajes();
                    clearFieldError("nombre");
                    setNombre(e.target.value);
                  }}
                  onBlur={() => validateField("nombre")}
                  placeholder=" "
                  autoComplete="name"
                  className={fieldErrors.nombre ? "input-invalid" : ""}
                  aria-invalid={fieldErrors.nombre ? "true" : "false"}
                  aria-describedby={fieldErrors.nombre ? "registro-nombre-error" : undefined}
                  required
                />
                <label>Tu nombre:</label>
                {fieldErrors.nombre ? (
                  <small id="registro-nombre-error" className="login-field-error">
                    {fieldErrors.nombre}
                  </small>
                ) : null}
              </div>

              <div className="floating-label phone-field">
                <input
                  ref={phoneInputRef}
                  type="tel"
                  defaultValue={telefono}
                  onChange={(e) => {
                    limpiarMensajes();
                    clearFieldError("telefono");
                    setTelefono(e.target.value);
                  }}
                  onBlur={async () => {
                    await phonePluginRef.current?.promise?.catch(() => {});
                    const international = phonePluginRef.current?.getNumber();
                    if (international) setTelefono(international);
                    await validateField("telefono");
                  }}
                  placeholder=" "
                  autoComplete="tel"
                  inputMode="tel"
                  className={fieldErrors.telefono ? "input-invalid" : ""}
                  aria-invalid={fieldErrors.telefono ? "true" : "false"}
                  aria-describedby={fieldErrors.telefono ? "registro-telefono-error" : undefined}
                  required
                />
                <label>Telefono:</label>
                {fieldErrors.telefono ? (
                  <small id="registro-telefono-error" className="login-field-error">
                    {fieldErrors.telefono}
                  </small>
                ) : null}
              </div>

              <div className="floating-label login-field-wide">
                <input
                  type="text"
                  value={nombreNegocio}
                  onChange={(e) => {
                    limpiarMensajes();
                    clearFieldError("nombreNegocio");
                    setNombreNegocio(e.target.value);
                  }}
                  onBlur={() => validateField("nombreNegocio")}
                  placeholder=" "
                  autoComplete="organization"
                  className={fieldErrors.nombreNegocio ? "input-invalid" : ""}
                  aria-invalid={fieldErrors.nombreNegocio ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.nombreNegocio ? "registro-negocio-error" : undefined
                  }
                  required
                />
                <label>Nombre del negocio:</label>
                {fieldErrors.nombreNegocio ? (
                  <small id="registro-negocio-error" className="login-field-error">
                    {fieldErrors.nombreNegocio}
                  </small>
                ) : null}
              </div>
            </div>
          )}

          <div className={modoRegistro ? "login-form-grid" : ""}>
            <div className="floating-label">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  limpiarMensajes();
                  clearFieldError("email");
                  setEmail(e.target.value);
                }}
                onBlur={() => validateField("email")}
                placeholder=" "
                autoComplete="email"
                className={fieldErrors.email ? "input-invalid" : ""}
                aria-invalid={fieldErrors.email ? "true" : "false"}
                aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                required
              />
              <label>Correo:</label>
              {fieldErrors.email ? (
                <small id="login-email-error" className="login-field-error">
                  {fieldErrors.email}
                </small>
              ) : null}
            </div>

            <div className="floating-label">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  limpiarMensajes();
                  clearFieldError("password");
                  clearFieldError("confirmPassword");
                  setPassword(e.target.value);
                }}
                onBlur={() => validateField("password")}
                placeholder=" "
                autoComplete={modoRegistro ? "new-password" : "current-password"}
                className={fieldErrors.password ? "input-invalid" : ""}
                aria-invalid={fieldErrors.password ? "true" : "false"}
                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                required
              />
              <label>Contrasena:</label>
              {fieldErrors.password ? (
                <small id="login-password-error" className="login-field-error">
                  {fieldErrors.password}
                </small>
              ) : null}
            </div>

            {modoRegistro && (
              <div className="floating-label login-field-wide">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    limpiarMensajes();
                    clearFieldError("confirmPassword");
                    setConfirmPassword(e.target.value);
                  }}
                  onBlur={() => validateField("confirmPassword")}
                  placeholder=" "
                  autoComplete="new-password"
                  className={fieldErrors.confirmPassword ? "input-invalid" : ""}
                  aria-invalid={fieldErrors.confirmPassword ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.confirmPassword ? "registro-confirm-error" : undefined
                  }
                  required
                />
                <label>Confirmar contrasena:</label>
                {fieldErrors.confirmPassword ? (
                  <small id="registro-confirm-error" className="login-field-error">
                    {fieldErrors.confirmPassword}
                  </small>
                ) : null}
              </div>
            )}
          </div>

          <button type="submit" disabled={procesando}>
            {procesando
              ? "Procesando..."
              : modoRegistro
                ? "Crear cuenta"
                : "Iniciar sesion"}
          </button>

          <p className="login-switch-text">
            {modoRegistro ? "Ya tienes cuenta?" : "No tienes cuenta?"}{" "}
            <a
              href={modoRegistro ? "#login" : "#registro"}
              onClick={(e) => {
                e.preventDefault();
                cambiarModo();
              }}
            >
              {modoRegistro ? "Inicia sesion" : "Registrate"}
            </a>
          </p>

          {(error || accessMessage) && (
            <p style={{ color: "crimson", marginTop: "12px" }}>
              {error || accessMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
