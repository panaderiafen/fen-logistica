# Logística v1.5.5 — También cobra órdenes ya facturadas

**Dónde va:** repo **fen-logistica** en GitHub (Add file → Upload files, todo el contenido del zip, Commit).
**Necesita:** reglas **fen-b2b v1.11.0** publicadas en Firebase (sin ellas, marcar Pagado una orden facturada da "sin permiso").

## Qué cambia
- En Cobros aparecen **todas** las órdenes del día, también las que ya tienen folio. Las facturadas muestran **"F" y su folio**.
- Se pueden marcar Pagado y Deshacer igual que las demás, y salen en la etiqueta del sobre.

## Revisar después de subir
- [ ] Arriba dice **v1.5.5**.
- [ ] Una orden ya facturada aparece en Cobros con su "F …".
