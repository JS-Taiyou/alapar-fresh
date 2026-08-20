# A la Par

[English](README.md) | **Español**

> Comparte gastos con tu pareja, amigos o roomies — y queden siempre _a la par_.

![CI](https://github.com/JS-Taiyou/alapar-fresh/actions/workflows/ci.yml/badge.svg)
![Licencia](https://img.shields.io/badge/licencia-AGPLv3-blue)
![Demo](https://img.shields.io/badge/demo-en%20vivo-brightgreen)

**[▶ Prueba la demo guiada en vivo — sin registro](https://alapar.itzayanos.deno.net/demo)**
**App en vivo:** https://alapar.itzayanos.deno.net

## ¿Qué es?

A la Par es una PWA full-stack para dividir gastos, hecha para usuarios
hispanohablantes. Crea un registro, anota gastos y pagos, y la app mantiene el
balance actualizado de quién le debe a quién — incluyendo compras a meses,
cargos recurrentes y pagos directos entre miembros.

- **Registros para cualquier contexto** — parejas, roomies, viajes; cada usuario
  puede pertenecer a varios grupos
- **Meses y cargos recurrentes** — sigue los pagos restantes de cada compra a
  plazos y las suscripciones vigentes
- **Cálculo automático de saldos** — balancea pagos entre cualquier par de
  miembros
- **Corte de ejercicio** — archiva las transacciones del periodo y empieza en
  ceros; los saldos pendientes se arrastran como transacciones de apertura para
  que nada se pierda
- **Historial con búsqueda** — busca ejercicios cerrados por nombre y
  consúltalos cuando quieras
- **Interfaz bilingüe** — español/inglés con un selector por usuario
- **PWA instalable** — actualizaciones optimistas, caché con service workers,
  notificaciones push e instalación en Android y escritorio
- **Actualizaciones en tiempo real** — los cambios de otros miembros aparecen al
  instante vía Supabase Realtime

## Stack técnico

| Capa     | Tecnología                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | Deno + Fresh 2 (Preact + Signals), islas renderizadas en servidor |
| Backend  | Supabase — Postgres, Auth (email/contraseña + Google OAuth), RLS  |
| Estilos  | Tailwind CSS + DaisyUI (tema oscuro)                              |
| Hosting  | Deno Deploy                                                       |
| Empaque  | PWA (web manifest + service worker + Web Push)                    |

## Detalles de ingeniería

- **Aritmética monetaria en centavos enteros** — el motor de repartos y los
  deltas de saldo persistidos usan aritmética exacta en centavos, y la API
  valida que las partes sumen el monto total antes de guardar nada.
- **Reparto determinista del sobrante** — cuando una división no es exacta, los
  centavos restantes se asignan de forma reproducible (sembrados con un UUID por
  transacción): saldos auditables y justos en agregado.
- **Persistencia exacta de saldos** — los deltas por usuario se guardan como
  `NUMERIC(12,2)` en una tabla `transaction_balances` y se suman con aritmética
  exacta de SQL, eliminando las discrepancias de 1-2 centavos que se acumulan
  con totales flotantes. Las escrituras multi-paso (transacción + pagos +
  deltas, uniones por invitación, clonación por lotes) corren dentro de
  transacciones de BD, así que una falla parcial no deja saldos inconsistidos.
- **Recuperación del canal en tiempo real** — si el WebSocket de Supabase
  Realtime se cae (expiración de token, corte de red, suspensión del móvil), el
  cliente obtiene automáticamente un token nuevo y se resuscribe con retroceso
  exponencial.
- **Seguridad en la base de datos** — Row-Level Security de Postgres aísla los
  datos de cada grupo; el canal de tiempo real solo entrega transacciones de los
  registros a los que pertenece el usuario autenticado.
- **Suite de pruebas con stubs tipados** — el motor de saldos, repartos,
  validación de rutas y reglas de negocio corren contra stubs tipados de la base
  de datos y de Supabase (sin BD en vivo), y los stubs se verifican en tiempo de
  compilación contra la API real para que no se desincronicen.

## Correr en local

### Requisitos

- [Deno](https://docs.deno.com/runtime/getting_started/installation) (última
  versión)
- Un proyecto de [Supabase](https://supabase.com) (el plan gratuito funciona)

### Instalación

```bash
git clone https://github.com/JS-Taiyou/alapar-fresh.git
cd alapar-fresh
cp .env.example .env   # agrega tus credenciales de Supabase y VAPID
```

Ejecuta las migraciones en `db/` contra tu proyecto de Supabase, en el orden
indicado en [`docs/DATABASE.md`](docs/DATABASE.md#migrations) (`schema.sql`
primero, luego los archivos `add_*.sql` incluido `add_billing.sql`, después
`enable_rls.sql`, `tighten_rls.sql` y finalmente `enable_realtime.sql`;
`drop_allowed_emails.sql` al final — es un no-op en instalaciones nuevas).

Inicia el servidor de desarrollo:

```bash
deno task dev
```

Compila y corre para producción:

```bash
deno task build
deno task start
```

## Pruebas

```bash
deno task test    # corre la suite (DB simulada, sin DATABASE_URL)
deno task check   # fmt + lint + type-check + pruebas
```

La suite cubre el motor de saldos y repartos: las partes siempre suman el total,
la desviación máxima entre miembros es de un centavo, y entradas idénticas
producen repartos idénticos. Los handlers de ruta se prueban con un contexto de
petición falso y una capa de queries simulada.

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitectura del sistema,
  estructura de directorios, flujo de auth, caché, tiempo real
- [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) — cálculo de saldos, modos
  de división, corte/asentamiento, arrastre, invitaciones
- [`docs/DATABASE.md`](docs/DATABASE.md) — esquema, tablas, migraciones
- [`docs/ROUTES.md`](docs/ROUTES.md) — inventario de rutas
- [`docs/ISLANDS.md`](docs/ISLANDS.md) — componentes interactivos
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — componentes presentacionales
- [`docs/MONETIZATION.md`](docs/MONETIZATION.md) — diseño del plan Pro y runbook
  de Polar
- [`CHANGELOG.md`](CHANGELOG.md) — registro de cambios significativos

## Próximos pasos

- [ ] Publicación en Android vía TWA (Google Play)
- [ ] Dominio propio

## Licencia

AGPLv3 — consulta [LICENSE](LICENSE).
