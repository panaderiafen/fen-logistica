# fën · Órdenes B2B (logística) · v1.0.0

**App nueva** · repo `fen-logistica` · dirección: `https://panaderiafen.github.io/fen-logistica/` · 6 de octubre de 2026

La app con la que la encargada de logística registra las órdenes B2B. Guarda directo en la base nueva (Firebase **fen-b2b**), así que es rápida y todo se ve en vivo. La planilla recibe una copia automática.

## Qué hace
| Sección | Qué hace |
| --- | --- |
| **Nueva orden** | Fecha, cliente y productos. El **precio sale de la lista**: el especial del cliente o el precio base. Al guardar, el N° lo da la base (el que sigue) y se descarga el **PDF** de la orden, con el mismo formato de siempre |
| **Órdenes** | Las de los últimos 14 días y todas las que no tienen folio, en vivo. Buscar por cliente o N°, "Solo sin folio", **Descargar PDF**. **Editar** las que no tienen folio ni pago, con motivo (queda en el historial y el PDF lo muestra) |
| **Solicitudes** | **Precio especial** para un cliente, o **producto nuevo** de Producción (de la lista que publica Producción, solo los que todavía no son producto B2B). Le llegan a Emmanuel en Sistema Fën; al aprobarlas, aparecen solas |

(i) **Si necesita otro precio**, no se escribe a mano: se pide en Solicitudes. Así ninguna orden sale con un precio que nadie aprobó.

(i) **La planilla al día:** arriba dice "Planilla al día" o "N por pasar a la planilla". Se pasa sola después de cada orden y se reintenta cada pocos minutos si no hay internet.

(i) **Antes del cambio** (mientras se use la app B2B de siempre), esta app deja mirar pero no crear órdenes. Se activa sola cuando Emmanuel cambia a la base nueva en Sistema Fën.

## Archivos y dónde va cada uno
```
index.html, estilos.css, app.js, modelo.js, pdf.js, firebase.js   → GitHub, repo NUEVO fen-logistica (raíz)
config.js        → GitHub (raíz). Antes de subirlo, pega aquí la configuración de fen-b2b (ver paso 3)
logo-fen.png, logo-orden.png                                      → GitHub (raíz)
README.md        → GitHub (respaldo)
```
No hay claves secretas: la configuración de Firebase solo dice cuál es el proyecto.

## Instalación (unos 10 minutos)
1. En GitHub, cuenta **panaderiafen** → **New repository** → nombre `fen-logistica` → **Public** → Create.
2. **Add file → Upload files**: sube todos los archivos del zip (sin la carpeta) → Commit.
3. Abre `config.js` en GitHub → lápiz (editar). En la línea `firebase: null,` reemplaza `null` por el bloque de fen-b2b, **solo lo que va entre llaves**, así:
   ```js
   firebase: {
     apiKey: "…",
     authDomain: "fen-b2b.firebaseapp.com",
     projectId: "fen-b2b",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…"
   },
   ```
   (Ojo con la coma final después de `}`.) → **Commit changes**.
4. **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, carpeta **/ (root)** → Save. En 1 o 2 minutos queda en `https://panaderiafen.github.io/fen-logistica/`.

## La cuenta de la encargada (una sola vez)
1. Consola de Firebase → proyecto **fen-b2b** → **Authentication → Usuarios → Agregar usuario**: su correo y una contraseña. Copia su **UID**.
2. **Firestore → Datos → Iniciar colección** `logistica` → ID del documento: **su UID** → campo `ok`, booleano, `true` → Guardar.
3. En su celular abre la dirección, entra con su correo y contraseña. Queda recordada hasta que presione **Salir**.
   - (i) Para que quede como app: en Chrome, menú ⋮ → **Agregar a la pantalla principal**.

## Lista de verificación
- [ ] Ella entra con su cuenta y ve Nueva orden, Órdenes y Solicitudes.
- [ ] Antes del cambio dice que todavía se usa la app de siempre y no deja guardar.
- [ ] Después del cambio: crea una orden de prueba → baja el PDF → aparece en Sistema Fën (Ventas B2B → Por facturar) y en la planilla (Resumen Facturas, arriba).
- [ ] Edita esa orden con un motivo → el PDF muestra el cambio y el historial.
- [ ] Manda una solicitud de precio → aparece en Sistema Fën → Solicitudes.

## Si algo sale mal
- **"Esta cuenta no tiene acceso"**: falta el documento `logistica/{UID}` (paso 2 de la cuenta) o el UID no es el mismo.
- **"La base no dejó guardar (permiso)"**: revisa que estén publicadas las reglas de fen-b2b **v1.1.0**.
- **Pantalla en blanco**: revisa `config.js` (las comillas y la coma después de `}`).
- Para volver a la app de siempre: Emmanuel, en Sistema Fën → Ventas B2B → Base nueva → **Volver a la app antigua**.
