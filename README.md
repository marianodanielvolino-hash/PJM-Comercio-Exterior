# PJM Cotizador Inteligente de Importación Argentina

MVP de la plataforma de PJM Comercio Exterior para simular el costo nacionalizado
de una importación en Argentina: FOB, flete, seguro, CIF, tributos, gastos
locales, créditos fiscales, costo unitario y caja necesaria para liberar la
mercadería — con registro de clientes, guardado de simulaciones, PDF
preliminar, solicitud de cotización formal y un panel interno básico para PJM.

Este proyecto parte de la lógica de cálculo del prototipo HTML original
("Cotizador de Carga Internacional") — modalidad marítimo FCL/LCL, aéreo y
terrestre, CBM/peso tasable, seguro, Incoterms — modularizada en
`src/lib/calculations/importCostCalculator.ts` y extendida con las fórmulas
de nacionalización de Argentina (DIE, tasa estadística, IVA, IVA adicional,
percepciones, créditos fiscales y caja necesaria).

## Stack

- **Next.js 16** (App Router, TypeScript) — nota: en Next.js 16 `middleware.ts`
  pasó a llamarse `proxy.ts` (mismo comportamiento, ver `src/proxy.ts`).
- **Tailwind CSS 4**
- **Supabase** — Auth, Postgres (con Row Level Security) y Storage (bucket
  `simulation-documents` ya creado para la fase de carga de documentos).
- Despliegue pensado para **Vercel**.

## Cómo instalar y correr localmente

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el proyecto de Supabase

1. Entrá a [supabase.com](https://supabase.com/dashboard) → **New project**.
2. Elegí nombre, contraseña de base de datos y región (cualquiera; Argentina
   no tiene región propia, `South America (São Paulo)` es la más cercana).
3. Esperá a que termine de aprovisionarse (1-2 minutos).
4. En **Project Settings → API** vas a encontrar los tres valores que
   necesita el paso 4: `Project URL`, `anon public key` y
   `service_role key` (este último es secreto, nunca lo expongas en el
   cliente ni lo commitees).

### 3. Aplicar la migración y el seed

**Opción A — Supabase CLI (recomendado):**

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>   # está en la URL del dashboard
npx supabase db push                                # aplica supabase/migrations/*.sql en orden (0001 a 0006)
```

El seed (`supabase/seed.sql`) no corre automáticamente con `db push`. Aplicalo
con:

```bash
npx supabase db execute -f supabase/seed.sql --linked
```

**Opción B — SQL Editor del dashboard (sin CLI):**

1. Abrí **SQL Editor → New query**.
2. Pegá y ejecutá, en orden y cada uno en una query separada, el contenido de
   `supabase/migrations/0001_init.sql`, `0002_ncm_catalog.sql`,
   `0003_documents_checklist_admin.sql`, `0004_formal_quotes.sql`,
   `0005_integrations.sql` y `0006_shipment_scenarios.sql`.
3. En una última query, pegá y ejecutá `supabase/seed.sql`.

Verificá que haya funcionado: **Table Editor** debería mostrar las tablas de
las seis migraciones (`profiles`, `companies`, `simulations`,
`simulation_items`, `ncm_positions`, `tax_parameters`, `logistic_costs`,
`documents`, `pjm_requests`, `comments`, `simulation_checklist_items`,
`audit_logs`, `notifications`, `formal_quotes`, `formal_quote_items`,
`formal_quote_costs`, `quote_sequences`, `feature_flags`,
`exchange_rates`, `regulatory_references`, `integration_logs`,
`shipping_scenario_rules`, `courier_rate_table`, `air_rate_table`,
`simulation_alternative_scenarios`, entre otras) y `ncm_positions`/
`tax_parameters` deberían tener 7 filas cada una tras el seed.

### 4. Configurar `.env.local`

```bash
cp .env.example .env.local
```

Completá los tres valores del paso 2, más un `CRON_SECRET` propio para
correr las rutas `/api/cron/*` en local:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<tu-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
CRON_SECRET=<cualquier string largo, ej. salida de `openssl rand -hex 24`>
```

`.env.local` está en `.gitignore` — nunca se commitea. `SUPABASE_SERVICE_ROLE_KEY`
la usan scripts locales (`scripts/seed-demo-users.mjs`) y las rutas
`/api/cron/*` (para poder actualizar `formal_quotes`/`documents` sin pasar
por RLS); ninguna de las dos se envía al navegador.

### 5. Correr localmente

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). `npm run build` y
`npm run lint` no requieren credenciales de Supabase (todas las rutas son
100% dinámicas); las credenciales sólo hacen falta en tiempo de ejecución
(`npm run dev` / `npm run start` / el deploy en Vercel).

Para desarrollo, se recomienda desactivar la confirmación de email en
**Authentication → Sign In / Providers → Email** (`Confirm email` = off), así
el registro deja al usuario logueado inmediatamente. En producción dejalo
activado.

### 6. Crear usuarios de ejemplo (opcional)

Con las credenciales del paso 4 completas, corré:

```bash
npm run seed:demo-users
```

Esto crea (vía la Admin API de Supabase, la forma soportada — nunca
insertando directo en `auth.users` por SQL) dos cuentas de prueba:

| Rol         | Email                     | Password       |
| ----------- | ------------------------- | -------------- |
| `cliente`   | `cliente.demo@pjm.local`  | `PjmDemo2026!` |
| `admin_pjm` | `admin.demo@pjm.local`    | `PjmDemo2026!` |

Es idempotente (podés correrlo de nuevo sin duplicar usuarios) y **no se
debe correr contra un proyecto de producción** — crea credenciales de login
reales con una contraseña pública. Si preferís no correr el script, creá los
usuarios a mano desde **Authentication → Users → Add user** en el dashboard
y seguí con el paso 7 para el admin.

### 7. Crear (o promover) un usuario `admin_pjm` a mano

Si no usaste el script del paso 6, cualquier usuario registrado por
`/registro` puede promoverse a admin_pjm desde el **SQL Editor**:

```sql
update public.profiles set role = 'admin_pjm' where email = 'tu-email@pjm.com.ar';

-- También actualizá el JWT metadata para que quede consistente
-- (el proxy ya lee el rol desde `profiles`, así que esto es sólo para
-- que cualquier otro código que mire user_metadata no quede desactualizado):
update auth.users
set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'admin_pjm')
where email = 'tu-email@pjm.com.ar';
```

No hace falta cerrar sesión: el gate de `/admin` (`src/proxy.ts` →
`src/lib/supabase/middleware.ts`) consulta `profiles.role` en cada request,
no el JWT, así que el cambio aplica en el siguiente request.

### 8. Configurar las redirect URLs de Supabase Auth

En **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` en desarrollo; la URL de producción
  de Vercel (ver más abajo) una vez desplegado.
- **Redirect URLs**: agregá tanto `http://localhost:3000/**` como
  `https://<tu-dominio-de-vercel>.vercel.app/**` (y tu dominio propio si
  usás uno). Sin esto, los links de confirmación de email y de recuperación
  de contraseña van a fallar o redirigir a un dominio incorrecto.

Este proyecto no usa OAuth de terceros ni magic links todavía, así que no
hace falta configurar providers adicionales.

## Estructura de carpetas

```
src/
  app/                        Rutas (App Router)
    page.tsx                  Landing pública
    simular/                  Calculadora pública (sin login)
    login/, registro/         Auth
    perfil/                   Perfil de cliente y empresa
    dashboard/                Dashboard cliente (historial de simulaciones)
    simulaciones/nueva/       Wizard de nueva simulación
    simulaciones/[id]/        Resultado / detalle de simulación
    simulaciones/[id]/pdf/    PDF preliminar (imprimible)
    simulaciones/[id]/cotizacion/pdf/   PDF comercial de la cotización formal (imprimible)
    admin/                    Panel interno PJM (solicitudes, usuarios, empresas, catálogo NCM, integraciones)
    admin/solicitudes/[id]/   Detalle de solicitud PJM (resumen, documentos, checklist, cotización, comentarios)
    admin/integraciones/      Health center: feature flags, tipo de cambio BNA, referencias BCRA/VUCE, logs
    api/cron/                 Rutas de cron protegidas por CRON_SECRET (expirar cotizaciones/documentos)
    actions/                  Server Actions (auth, company, simulations, admin, ncm, documents, checklist, comments, notifications, quotes, integrations, scenarios)
  components/
    layout/                   Header (incluye NotificationsBell), Footer
    ui/                       Primitivas (Card, Button, Field, Badge)
    simulation/                Pasos del wizard, tarjetas de resultado, SimulationDetailTabs
    admin/                    Controles del panel PJM (estados, comentarios, importador, validación NCM, AdminRequestDetailTabs, feature flags, tipo de cambio, referencias, ScenarioReviewPanel)
    ncm/                      Buscador NCM, tarjetas de detalle/tributos/intervenciones (cliente y admin)
    documents/                Carga, listado y revisión de documentos (cliente y admin)
    checklist/                Checklist de documentación con semáforo (cliente y admin)
    comments/                 Hilo de comentarios internos/visibles para el cliente
    notifications/            Campanita de notificaciones in-app
    quotes/                   Borrador/edición de cotización (admin), tarjeta resumen y respuesta (cliente)
    scenarios/                Tarjetas/tabla de escenarios alternativos (cliente); ScenarioReviewPanel vive en admin/
  lib/
    calculations/              Motor de cálculo (puro, sin UI) + shipmentScenarioOptimizer.ts (escenarios alternativos) + tests
    ncm/                       Normalización/búsqueda/match de NCM, tributos e intervenciones; parseo CSV + tests
    integrations/               Adapters de notificación saliente (email/whatsapp/webhook) con fallback a consola/log
    supabase/                  Clientes de Supabase (browser/server/service-role) + sesión de proxy
    constants/                 Ubicaciones, tarifas de referencia, catálogo NCM de ejemplo (fallback), estilos de estado, checklist por defecto
    validations/                Esquemas Zod
    checklist.ts                Cálculo puro del semáforo de checklist + tests
    readyForQuote.ts             Cálculo puro de bloqueos para "listo para cotización" + tests
    quoteTotals.ts                Cálculo puro de subtotal/impuestos/total de una cotización + tests
    cron.ts                      Verificación del header Authorization de los cron jobs + tests
    auditLog.ts                  Helper de auditoría (service-role, no lanza errores)
    notify.ts                    Helper de notificaciones in-app + fan-out al adapter de email (service-role, no lanza errores)
    dal.ts                     Data Access Layer (verificación de sesión/rol)
    errorMessages.ts           Traducción de errores de Supabase a mensajes cortos en español
  types/                      Tipos de dominio y de la base de datos (incluye documents.ts, quotes.ts, integrations.ts y scenarios.ts)
  proxy.ts                    Protección de rutas + refresco de sesión (ex-middleware.ts)
supabase/
  migrations/0001_init.sql    Esquema base + RLS + índices
  migrations/0002_ncm_catalog.sql   Catálogo NCM/tributos/intervenciones versionado + RLS (Sprint 2)
  migrations/0003_documents_checklist_admin.sql   Documentos, checklist, comentarios, auditoría, notificaciones + RLS (Sprint 3)
  migrations/0004_formal_quotes.sql   Cotización comercial formal, numeración, RLS (Sprint 4)
  migrations/0005_integrations.sql   Feature flags, tipo de cambio, referencias regulatorias, logs de integración + RLS (Sprint 5)
  migrations/0006_shipment_scenarios.sql   Reglas/tarifas courier y aéreo, campos de mercadería divisible, escenarios alternativos + RLS
  seed.sql                    Catálogo NCM y parámetros de impuestos de ejemplo (fallback)
scripts/
  seed-demo-users.mjs         Crea usuarios cliente/admin_pjm de prueba vía Admin API
vercel.json                   Configuración de los cron jobs (expirar cotizaciones/documentos)
QA_CHECKLIST.md               Checklist de pruebas manuales Sprint 1 / 1.5
SPRINT_2_QA.md                Checklist de pruebas manuales Sprint 2 (NCM/tributos/intervenciones)
SPRINT_3_QA.md                Checklist de pruebas manuales Sprint 3 (documentos/checklist/panel PJM)
SPRINT_4_QA.md                Checklist de pruebas manuales Sprint 4 (cotización comercial formal)
SPRINT_5_QA.md                Checklist de pruebas manuales Sprint 5 (integraciones, feature flags, health center)
SCENARIOS_QA.md               Checklist de pruebas manuales — escenarios alternativos de envío parcial
```

## Modelo de datos

Tablas Postgres (ver `supabase/migrations/0001_init.sql`):

- `profiles` — extiende `auth.users` (rol `cliente` | `admin_pjm`), se crea
  automáticamente con un trigger al registrarse.
- `companies` — datos de la empresa del cliente.
- `simulations` — una simulación de importación completa, con todos los
  valores calculados (FOB, CIF, tributos, créditos fiscales, caja necesaria,
  costo unitario) y sus estados (`status`, `ncm_status`, `document_status`).
  `raw_data` guarda el borrador completo del wizard (JSON) para poder
  reabrirlo o auditarlo.
- `simulation_items` — ítems de mercadería de una simulación.
- `ncm_positions` / `tax_parameters` — catálogo de referencia NCM y tasas
  (editable por admin a futuro; hoy poblado con datos de ejemplo).
- `logistic_costs` — desglose logístico de la simulación.
- `documents` — metadatos de documentación (checklist documental); el bucket
  de Storage `simulation-documents` ya está creado para la carga real de
  archivos en una fase siguiente.
- `pjm_requests` — solicitud de cotización formal asociada a una simulación.
- `comments` — comentarios internos de PJM sobre una solicitud.

Row Level Security: un cliente sólo ve sus propias filas (`user_id = auth.uid()`
o a través de la simulación asociada); `admin_pjm` ve todo, vía la función
`is_admin_pjm()`. Están indexadas todas las columnas de foreign key /
filtrado frecuente (`user_id`, `simulation_id`, `status`, etc. — ver el
bloque "Indexes" al final de `0001_init.sql`; Postgres no las indexa solas).

`companies.user_id` es `unique`: el modelo del MVP asume una empresa por
cliente (lo que asumen también `/perfil` y el wizard al usar `.maybeSingle()`).

## Catálogo NCM, tributos e intervenciones (Sprint 2)

`supabase/migrations/0002_ncm_catalog.sql` reemplaza el catálogo de ejemplo
del Sprint 1 por un módulo real, versionado e importable. Nada de esto
clasifica una posición arancelaria de forma definitiva: **todo NCM que un
cliente selecciona queda `pendiente_validacion` hasta que un admin_pjm lo
valida** desde el detalle de la solicitud.

- `ncm_catalog_versions` / `ncm_positions` — catálogo de posiciones, cada una
  perteneciendo a una versión. Sólo las posiciones de una versión con
  `status = 'active'` (`is_active = true`) aparecen en el buscador.
- `tax_parameter_versions` / `tax_parameters` — tasas (DIE, tasa estadística,
  IVA, IVA adicional, Ganancias, IIBB) versionadas de la misma forma,
  independientes del catálogo NCM (una tasa puede cargarse aunque el NCM
  todavía no exista, con advertencia).
- `intervention_rule_versions` / `intervention_rules` — reglas ANMAT, SENASA,
  INAL, etc. por NCM exacto o por capítulo (severidad `info` / `warning` /
  `blocking`); una regla por NCM exacto siempre gana sobre una de capítulo
  (`src/lib/ncm/matchInterventionRules.ts`).
- `import_jobs` — bitácora de cada importación (CSV) con filas
  procesadas/erróneas y el reporte de errores; se reutiliza en el Sprint 5
  para las sincronizaciones de ARCA.
- `ncm_validations` — el historial de "cliente propuso X, PJM validó/rechazó
  Y", uno por ítem de mercadería.

**Importar un catálogo**: `/admin/ncm`, `/admin/ncm/tributos` y
`/admin/ncm/intervenciones` aceptan un CSV (ver columnas en cada pantalla).
Cada importación crea una versión nueva en estado `draft` — no afecta el
cálculo ni el buscador hasta que un admin la activa desde la lista de
versiones. Activar una versión nueva no borra la anterior (queda como
`inactive`, disponible para reactivar = rollback lógico).

El parser de CSV es propio (`src/lib/ncm/csv.ts`, sin dependencias externas)
y sólo soporta CSV por ahora — XLSX/JSON quedan en "Próximos pasos".

**Buscador y autocompletado** (paso 3 del wizard, `src/components/ncm/`):
busca por código (con o sin puntos), capítulo o texto libre
(`src/lib/ncm/searchNcm.ts`), y al seleccionar una posición autocompleta
descripción, AEC, fuente, vigencia y las tasas tributarias activas
(`src/lib/ncm/matchTaxParameters.ts`) además de mostrar cualquier
intervención parametrizada. Si no hay tasas activas para el código, el
cálculo se marca con advertencia (`simulations.has_tax_warning`) en vez de
usar un valor inventado.

## Documentos, checklist y panel PJM (Sprint 3)

`supabase/migrations/0003_documents_checklist_admin.sql` convierte cada
simulación enviada a PJM en una solicitud gestionable de punta a punta.

- **Documentos** (`documents`, extendida desde Sprint 1): el cliente sube el
  archivo directo a Storage desde el navegador
  (`src/components/documents/DocumentUploadForm.tsx`, bucket
  `simulation-documents`, path `{simulation_id}/{document_type}/{timestamp}-{filename}`)
  y sólo después inserta la fila de metadata vía Server Action — así el
  archivo nunca pasa por el servidor de Next.js. Un cliente **no puede**
  actualizar el `status` de un documento directamente (sólo `admin_pjm`
  tiene policy de `update`); "reemplazar un documento observado" sube un
  archivo nuevo y llama a la función `replace_document()` (SECURITY DEFINER,
  valida que el que reemplaza sea el dueño de la simulación) para marcar el
  viejo como `replaced` sin darle al cliente permisos de escritura más
  amplios.
- **Checklist operativo** (`simulation_checklist_items`): se crea
  automáticamente con los 25 ítems de `src/lib/constants/defaultChecklist.ts`
  la primera vez que se solicita cotización formal. El semáforo
  (`simulations.checklist_status`: draft/red/yellow/green) se recalcula con
  la función pura `computeChecklistStatus` (`src/lib/checklist.ts`, con
  tests) cada vez que cambia un ítem — rojo si hay un ítem *bloqueante* sin
  aprobar (invoice, packing list, BL/AWB), amarillo si hay otros ítems
  requeridos pendientes/observados, verde si todo lo requerido está
  aprobado.
- **Comentarios** (`comments`, extendida desde Sprint 1): ahora distinguen
  `visibility` (`internal` | `client`) y pueden colgar de un documento o de
  un ítem del checklist además de una solicitud. Sólo `admin_pjm` puede
  insertar comentarios (RLS); un comentario `client` dispara además una
  notificación al dueño de la simulación.
- **Auditoría** (`audit_logs`) y **notificaciones** (`notifications`): toda
  acción relevante (subida/revisión de documento, cambio de checklist,
  cambio de estado de la solicitud, validación NCM, comentario) queda
  registrada. Ambas tablas se escriben con el cliente `service_role`
  (`src/lib/auditLog.ts`, `src/lib/notify.ts`) porque tanto clientes como
  admins disparan eventos auditables/notificables entre sí, y la RLS de
  lectura de `audit_logs` es admin-only.
- **Panel PJM robusto** (`/admin`): KPIs por estado operativo, filtros por
  estado/prioridad/NCM pendiente (`?status=&priority=&ncmPending=1`), y el
  detalle de cada solicitud (`/admin/solicitudes/[id]`) en pestañas
  (Resumen / Documentos / Checklist / Comentarios) con gestión de estado,
  prioridad, asignación y el botón "Marcar listo para cotización", que
  bloquea con la lista de motivos (`computeReadyForQuoteBlockers`,
  `src/lib/readyForQuote.ts`, con tests) salvo override explícito con
  comentario obligatorio.
- `pjm_requests.status` pasó a un dominio operativo propio (`received` →
  `in_review`/`ncm_review`/`tax_review`/`logistics_review` →
  `waiting_client` → `ready_for_quote` → `formal_quote_sent` → `closed`/
  `cancelled`), separado de `simulations.status` (el estado más simple que
  ve el cliente en su dashboard).

## Cotización comercial formal (Sprint 4)

`supabase/migrations/0004_formal_quotes.sql` agrega un flujo de
borrador → aprobación interna → emisión → respuesta del cliente para la
cotización comercial (distinta de la simulación preliminar y de la
"solicitud" operativa de Sprint 3).

- **Borrador** (`formal_quotes`, `formal_quote_items`, `formal_quote_costs`):
  desde la pestaña "Cotización" del panel PJM, "Crear borrador de
  cotización" copia los ítems de mercadería y arma un desglose de costos
  inicial a partir de la simulación (`src/app/actions/quotes.ts`,
  `createDraftQuote`). El borrador queda como una copia independiente —
  editar la simulación después no cambia la cotización — y se puede seguir
  editando (condiciones de pago, vigencia, notas, exclusiones, ítems,
  costos) mientras esté en estado `draft`.
- **Totales**: `subtotal` (mercadería), `taxes_total` (sólo costos
  categoría "Impuestos") y `total` (mercadería + todos los costos) se
  recalculan con la función pura `computeQuoteTotals`
  (`src/lib/quoteTotals.ts`, con tests) cada vez que se agrega/quita un
  ítem o un costo.
- **Aprobación e emisión**: "Aprobar borrador" exige al menos un ítem de
  mercadería y bloquea la edición (representa el paso interno antes de
  mandarla al cliente). "Emitir y enviar al cliente" llama a la función
  `issue_formal_quote()` (SECURITY DEFINER): asigna un número
  correlativo por año (`COT-2026-0001`, tabla `quote_sequences`) de forma
  atómica para que dos emisiones simultáneas nunca choquen, calcula
  `valid_until` y notifica al cliente.
- **Cliente**: la pestaña "Cotización formal" en `/simulaciones/[id]` sólo
  muestra la cotización una vez `issued` o posterior (RLS: un cliente no
  puede leer una cotización en `draft`/`approved`). Desde ahí puede
  aceptarla o rechazarla (con comentario opcional) — sólo esa transición
  de estado le está permitida por RLS (`formal_quotes_client_respond`),
  nunca aprobar ni fijar montos.
- **PDF comercial**: misma decisión que el PDF preliminar del Sprint 1 —
  ruta imprimible (`/simulaciones/[id]/cotizacion/pdf`, accesible por el
  dueño de la simulación o por un admin) en vez de sumar una dependencia
  de renderizado de PDF. Ver "Decisión de alcance: PDF" en
  `SPRINT_4_QA.md`.

## Integraciones y health center (Sprint 5)

`supabase/migrations/0005_integrations.sql` agrega la superficie de
integración externa del MVP — sin conectar ningún proveedor real todavía —
más un panel para operarla desde `/admin/integraciones`.

- **Feature flags** (`feature_flags`): tres interruptores
  (`email_notifications`, `whatsapp_notifications`, `webhook_notifications`),
  todos apagados por defecto, editables desde el health center.
- **Adapters con fallback** (`src/lib/integrations/dispatch.ts`): no hay
  credenciales de ningún proveedor de email/WhatsApp/webhooks en este MVP.
  Cuando un canal está habilitado, `dispatchIntegration()` cae a
  `console.log` como stand-in del envío real y deja registro en
  `integration_logs`; cuando está deshabilitado, queda como `skipped` sin
  intentar nada. `notifyUser`/`notifyAllAdmins` (`src/lib/notify.ts`) ya
  disparan el canal `email` en paralelo a la notificación in-app existente
  desde Sprint 3, así que cualquier evento notificable (documento subido,
  cotización emitida, etc.) también deja rastro en el health center.
- **BNA — tipo de cambio manual** (`exchange_rates`): un admin carga
  compra/venta por fecha y moneda desde el health center; al armar un
  borrador de cotización formal, un botón permite fijar
  `formal_quotes.exchange_rate` con el último valor cargado — queda
  congelado (snapshot) una vez que la cotización deja de ser `draft`.
- **BCRA / VUCE — referencias** (`regulatory_references`): carga y
  desactivación manual de referencias regulatorias (norma, NCM opcional,
  URL, descripción); un cliente sólo puede leer las que están `is_active`.
- **ARCA**: no hay un módulo nuevo — reutiliza el importador de catálogo
  NCM del Sprint 2 (`/admin/ncm`), que ya soporta marcar la fuente del lote
  importado.
- **Cron jobs** (`/api/cron/expire-formal-quotes`,
  `/api/cron/expire-documents`): protegidos por `CRON_SECRET`
  (`src/lib/cron.ts`, con tests) contra el header `Authorization: Bearer`
  que Vercel agrega automáticamente a las invocaciones programadas en
  `vercel.json`. Vencen cotizaciones `issued` con `valid_until` pasado y
  documentos con `expires_at` pasado (columna nueva en `documents`).
- Ver "Decisiones de alcance de este sprint" al final de `SPRINT_5_QA.md`
  para el detalle de qué quedó deliberadamente fuera (proveedores reales,
  scraping, tablas separadas por canal).

## Automatización de escenarios alternativos de envío parcial

`supabase/migrations/0006_shipment_scenarios.sql` agrega una comparación
automática entre el escenario marítimo completo que carga el cliente y
variantes con una porción de la mercadería separada por courier o por
aéreo — siempre estimativa, nunca presentada como ahorro garantizado ni
como cotización formal.

- **Parámetros courier configurables** (`shipping_scenario_rules`, tabla
  clave/valor jsonb): máximo de unidades de la misma especie, peso
  máximo por paquete, valor FOB máximo, franquicia FOB para derecho de
  importación y tasa estadística, exigencia de uso no comercial, y
  máximo de usos anuales — nada de esto está hardcodeado en el código,
  así que un cambio normativo se resuelve editando filas, no desplegando.
- **Tarifas de referencia** (`courier_rate_table`, `air_rate_table`): por
  franja de peso y ruta, con una fila `*`/`*` de fallback; editables
  desde SQL/futuro panel admin sin tocar código.
- **Motor puro** (`src/lib/calculations/shipmentScenarioOptimizer.ts`,
  con 31 tests): `generateShipmentScenarios` orquesta
  `checkCourierEligibility`, `splitCargoForCourier`/`splitCargoForAir`,
  `calculateMaritimeOnlyScenario`/`calculateMaritimePlusCourierScenario`/
  `calculateMaritimePlusAirScenario`, `compareScenarios`,
  `rankScenariosByCost`/`rankScenariosBySpeed` y
  `generateScenarioWarnings`. Reutiliza las funciones puras de
  `importCostCalculator.ts` (CIF, DIE, tasa estadística, IVA,
  percepciones, créditos fiscales) para el tramo aéreo — régimen general
  completo, sin franquicia — y para recalcular el remanente marítimo; el
  tramo courier usa una versión simplificada explícita (sólo derecho de
  importación y tasa estadística sobre el excedente de la franquicia,
  documentado en el código y en `SCENARIOS_QA.md`). Si no hay datos
  mínimos (peso o valor por unidad) para un ítem divisible, ese ítem
  queda fuera del escenario en vez de fabricar un ahorro falso.
- **Elegibilidad courier** de tres estados —
  `courier_eligible` / `courier_not_eligible` / `courier_requires_pjm_review`
  — con motivos explícitos (supera valor/peso/cantidad, uso comercial
  declarado, intervención NCM, mercadería no divisible, falta
  información, requiere validación documental).
- **Wizard**: el paso "Mercadería" agrega, por ítem, divisibilidad,
  cantidad mínima separable, peso por unidad, urgencia, necesidad de
  llegada anticipada y uso declarado. Guardar una simulación en
  transporte marítimo con al menos un ítem divisible/urgente dispara la
  generación automática (`generateAlternativeScenarios`,
  `src/app/actions/scenarios.ts`), persistida en
  `simulation_alternative_scenarios`.
- **Cliente**: pestaña "Escenarios alternativos" en
  `/simulaciones/[id]` con tarjetas comparativas y una tabla detallada;
  puede marcar un escenario como preferido o pedir análisis PJM (nunca
  convertirlo directo en cotización formal).
- **Panel PJM**: pestaña "Escenarios alternativos" en
  `/admin/solicitudes/[id]` para ver supuestos y desglose, validar o
  rechazar (comentario técnico obligatorio), ajustar costos/plazos, y
  convertir un escenario validado en la base de un borrador de
  cotización formal (Sprint 4) — reemplazando el desglose de costos por
  el del escenario en vez del de la simulación marítima original.
- Ver `SCENARIOS_QA.md` para el checklist de pruebas manuales y el
  detalle completo de simplificaciones documentadas.

## Cálculos

Todo vive en `src/lib/calculations/importCostCalculator.ts` (funciones puras,
sin I/O), reexportado también en la vista previa en vivo del wizard y en el
simulador público (`/simular`):

```
CIF = FOB + flete internacional + seguro
DIE = CIF * derecho_importacion
Tasa estadística = CIF * tasa_estadistica
Base IVA = CIF + DIE + tasa_estadistica
IVA = Base IVA * alicuota_iva
IVA adicional = Base IVA * iva_adicional
Ganancias = Base IVA * percepcion_ganancias
IIBB = Base IVA * percepcion_iibb
Costo definitivo = flete + seguro + gastos locales + DIE + tasa estadística + despacho + flete interno + otros costos definitivos
Créditos fiscales = IVA + IVA adicional + Ganancias + IIBB
Caja necesaria = costo definitivo + créditos fiscales
Costo unitario = caja necesaria / cantidad de unidades
```

La lógica de flete/CBM/peso tasable por modalidad (marítimo LCL/FCL, aéreo,
terrestre) y de responsabilidad de costos por Incoterm es el mismo motor del
prototipo original, ahora en funciones puras y testeables.

**Los cálculos son siempre estimativos.** La UI lo remarca en la landing, en
cada resultado, en el PDF preliminar y en el disclaimer del footer — nunca se
presenta como cotización vinculante.

## Tests automáticos

```bash
npm run test
```

Corre los tests unitarios con [Vitest](https://vitest.dev/) (`src/**/*.test.ts`,
sin dependencias de Supabase): normalización y búsqueda de NCM, match de
tributos/intervenciones, parseo/validación de los importadores CSV, el
motor de cálculo (`src/lib/calculations/importCostCalculator.ts`), el
semáforo de checklist y los bloqueos de "listo para cotización"
(`src/lib/checklist.ts`, `src/lib/readyForQuote.ts`), los totales de la
cotización formal (`src/lib/quoteTotals.ts`), la verificación del secreto
de los cron jobs (`src/lib/cron.ts`) y el optimizador de escenarios
alternativos de envío parcial (`src/lib/calculations/shipmentScenarioOptimizer.ts`).

## QA manual

Antes de cada release, correr las pruebas manuales de punta a punta contra
un proyecto Supabase real:

- [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) — registro, login, wizard, solicitud
  formal, panel admin, RLS entre dos clientes distintos (Sprint 1 / 1.5).
- [`SPRINT_2_QA.md`](./SPRINT_2_QA.md) — buscador NCM, importación de
  catálogo/tributos/intervenciones, validación NCM en el panel PJM.
- [`SPRINT_3_QA.md`](./SPRINT_3_QA.md) — subida/reemplazo de documentos,
  checklist operativo, panel PJM (KPIs, filtros, ready-for-quote),
  comentarios internos vs. visibles, auditoría, notificaciones, RLS.
- [`SPRINT_4_QA.md`](./SPRINT_4_QA.md) — borrador/aprobación/emisión de
  cotización formal, numeración correlativa, respuesta del cliente
  (aceptar/rechazar), PDF comercial, RLS.
- [`SPRINT_5_QA.md`](./SPRINT_5_QA.md) — health center, feature flags con
  fallback a consola/log, tipo de cambio BNA, referencias BCRA/VUCE, cron
  jobs protegidos por `CRON_SECRET`, RLS.
- [`SCENARIOS_QA.md`](./SCENARIOS_QA.md) — escenarios alternativos de
  envío parcial (marítimo + courier/aéreo), elegibilidad courier,
  wizard, panel PJM, auditoría, RLS.

## Deploy en Vercel

1. Importá el repositorio en [vercel.com/new](https://vercel.com/new). Framework
   preset "Next.js" se detecta solo.
2. En **Settings → Environment Variables** del proyecto de Vercel, cargá las
   mismas cuatro variables de `.env.local` para los entornos que uses
   (Production / Preview / Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (marcala para que **no** se exponga al
     bundle del cliente — al no tener el prefijo `NEXT_PUBLIC_`, Next.js ya
     la mantiene server-only, pero revisá igual que ningún código bajo
     `'use client'` la importe).
   - `CRON_SECRET` (cualquier string largo generado por vos, ej.
     `openssl rand -hex 24`) — Vercel lo agrega automáticamente como header
     `Authorization: Bearer $CRON_SECRET` en cada invocación de los cron
     jobs definidos en `vercel.json`; sin esta variable, `/api/cron/*`
     rechaza todas las requests con 401.
3. Deploy. Vercel construye con `npm run build` — el mismo comando que
   corrés localmente, y no requiere las variables de Supabase en build time
   (todas las rutas son dinámicas), sólo en runtime. `vercel.json` registra
   los dos cron jobs (`expire-formal-quotes`, `expire-documents`) con
   frecuencia diaria — no requiere configuración manual adicional en el
   dashboard.
4. Una vez que tengas la URL de producción (`https://tu-proyecto.vercel.app`
   o tu dominio propio), volvé a **Supabase → Authentication → URL
   Configuration** y agregala a **Site URL** / **Redirect URLs** (ver paso 8
   de la sección de instalación). Si no lo hacés, la confirmación de email
   en producción va a redirigir a `localhost`.
5. Verificación post-deploy: repetir al menos los puntos 1, 2 y 8 del
   `QA_CHECKLIST.md` (registro, login, permisos de admin) contra la URL de
   producción.

Checklist rápido de "no hay nada hardcodeado":

- [ ] `grep -rn "supabase.co\|eyJhbGciOi" src/` no devuelve URLs ni JWTs
      pegados a mano en el código (sólo deberían aparecer vía
      `process.env.*`).
- [ ] `.env.local` y `.env*` (salvo `.env.example`) están en `.gitignore` y
      `git status` no los lista como trackeados.
- [ ] `.env.example` lista las cuatro variables sin valores reales.
- [ ] `npm run build` termina sin errores con `.env.local` ausente (las
      credenciales sólo hacen falta en runtime, no en build).

## Próximos pasos sugeridos

- Catálogo NCM: soportar XLSX/JSON además de CSV en los importadores
  (`src/lib/ncm/import*.ts`), agregar una tabla `ncm_aliases` para sinónimos
  de búsqueda, y reemplazar la carga manual por una sincronización real con
  ARCA Arancel Integrado cuando haya una fuente estable para consumir.
- Asignación de especialista aduanero/despachante como rol separado de
  `admin_pjm`, con permisos más granulares (hoy valida NCM y gestiona
  documentos el mismo rol que administra todo el panel).
- Documentos: OCR/extracción automática de datos de invoice; el vencimiento
  automático ya existe (`documents.expires_at` + cron), falta que la UI de
  carga permita cargar esa fecha (hoy sólo se puede setear manualmente en
  Supabase).
- PDFs (preliminar y comercial) con diseño más avanzado (hoy son vistas
  imprimibles desde el navegador).
- Selector de usuario real para "Asignado a" en el panel PJM (hoy sólo hay
  autoasignación).
- Cotización formal: versionado explícito (recotizar sobre una cotización
  rechazada creando una v2 en vez de un borrador nuevo desde cero), y
  aprobación por un segundo rol/usuario distinto de quien arma el borrador
  (hoy cualquier `admin_pjm` puede aprobar su propio borrador).
- Integraciones reales: conectar proveedores efectivos de email/WhatsApp/
  webhooks detrás de los adapters ya armados en
  `src/lib/integrations/dispatch.ts` (hoy caen a consola/log a propósito,
  sin credenciales), y reemplazar la carga manual de ARCA/BNA/BCRA/VUCE por
  consumo real de sus APIs/fuentes de datos cuando estén disponibles y
  sean estables.
- Escenarios alternativos: falta una UI de administración para
  `shipping_scenario_rules`/`courier_rate_table`/`air_rate_table` (hoy se
  editan por SQL — la app sólo las lee); verificar automáticamente el
  límite de usos anuales de courier por cliente (no hay historial de uso
  courier todavía); permitir que el wizard cargue
  `documents.expires_at` en vez de fijarlo manualmente en Supabase.
- Fuera de alcance de este MVP: navieras, pagos, IA clasificadora de NCM,
  firma digital, integración con ERP.
