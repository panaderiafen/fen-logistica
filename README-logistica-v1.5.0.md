# Logística v1.5.0 — Gastos con la plata de los cobros y etiqueta del sobre

**Dónde va:** repo **fen-logistica** en GitHub (Add file → Upload files, todo el contenido del zip, Commit).
**Necesita:** las reglas **fen-b2b v1.10.0** publicadas en Firebase (ver el archivo de reglas).

## Qué cambia (pestaña Cobros)
- Abajo aparece **"Sobre de hoy"**: lo cobrado hoy, los gastos y lo que se **entrega** (cobrado − gastos).
- **+ Gasto:** monto, en qué (estacionamiento, compra chica, bencina u otro), detalle y si le dieron boleta. Si le dieron, la boleta va dentro del sobre.
- **Quitar** un gasto anotado por error, mientras Emmanuel no lo haya recibido.
- **Imprimir etiqueta del sobre:** imprime **directo** en la impresora de etiquetas por Bluetooth (Chrome en Android), sin abrir Print Label. La primera vez de cada día Chrome pide elegir "BlueTooth Printer". Si la app Print Label está abierta, cerrarla antes.
- Si no imprime: el enlace "compártala con Print Label" (respaldo).
- La versión se ve arriba, bajo "Órdenes B2B".
- La página `prueba-impresora.html` ya no hace falta: puede borrarla del repo cuando quiera.

## Revisar después de subir
- [ ] Arriba dice **v1.5.0**.
- [ ] Anotar un gasto de prueba y quitarlo.
- [ ] Imprimir la etiqueta desde el celular Android con la impresora encendida.
