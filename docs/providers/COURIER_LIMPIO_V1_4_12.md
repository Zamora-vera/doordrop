# Regla de visualización de courier — V1.4.12

## Objetivo

Evitar que el cliente vea nombres técnicos de brokers o proveedores agregadores.

## Regla final

1. Si la cotización trae courier real, mostrar el courier real como nombre principal.
2. Si la cotización viene de un broker y sólo existe nombre técnico del broker, mostrar `Logihub` como nombre comercial.
3. No mostrar badges adicionales `Logihub` cuando ya se muestra courier real.
4. No mostrar `ParcelABC`, `PARCEL ABC ECONOMY`, `Genei`, `Paccofacile` o `SpedirePro` al cliente.

## Ejemplos

- Poste Italiane PDB EXPRESS HOME-HOME → `Poste Italiane`
- SDA PACCHI → `SDA`
- BRT EXPRESS → `BRT`
- UPS Standard → `UPS`
- PARCEL ABC ECONOMY → `Logihub`
