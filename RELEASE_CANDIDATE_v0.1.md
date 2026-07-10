# PJM Cotizador Inteligente de Importación Argentina — Release Candidate v0.1

Estado: **listo para revisión humana, PR y deploy de staging.** No es
producción-ready sin antes correr el QA manual completo contra un proyecto
Supabase real y decidir sobre los riesgos conocidos (ver más abajo).

Rama: `claude/cotizador-importacion-argentina-h2uxfi`
Alcance: MVP (Sprint 1) + Sprint 1.5 (estabilización) + Sprints 2 a 5
(catálogo NCM real, documentos/checklist/panel PJM, cotización comercial
formal, integraciones/feature flags/health center) + automatización de
escenarios alternativos de envío parcial (marítimo + courier/aéreo).

---

## 1. Estado general del proyecto

| Área | Estado |
| --- | --- |
| Build (`next build`) | ✅ Limpio |
| Lint (`eslint`) | ✅ Limpio |
| Typecheck (`tsc --noEmit`) | ✅ Limpio |
| Tests unitarios (`vitest`) | ✅ 94/94 en verde |
| Working tree | ✅ Sin cambios sin commitear |
| Migraciones | ✅ 5 migraciones (`0001`–`0005`), aplicables en orden |
| QA manual end-to-end contra Supabase real | ⬜ **No corrido en este ciclo** — pendiente antes de producción |
| Integraciones externas reales (ARCA/BNA/BCRA/VUCE/email/WhatsApp) | ⬜ No conectadas a propósito (fuera de alcance del MVP) |
| Deploy en Vercel | ⬜ No desplegado todavía |

No se agregaron features nuevas en este ciclo — es exclusivamente
documentación y preparación de release.

---

## 2. Qué quedó construido, por sprint

### Sprint 1 — MVP
Registro/login (Supabase Auth), perfil de cliente y empresa, dashboard con
historial de simulaciones, wizard de simulación (datos de operación,
mercadería, resultado), motor de cálculo de nacionalización (FOB → CIF →
tributos → créditos fiscales → caja necesaria → costo unitario), PDF
preliminar imprimible, solicitud de cotización formal (mínima), panel
admin básico.

**Archivos clave:** `src/lib/calculations/importCostCalculator.ts`,
`src/app/simulaciones/nueva/`, `src/app/simulaciones/[id]/`,
`src/app/dashboard/`, `src/app/admin/page.tsx`,
`supabase/migrations/0001_init.sql`.

### Sprint 1.5 — Estabilización
README con instrucciones reales de instalación, auditoría de la migración
(FKs, índices, RLS), `QA_CHECKLIST.md`, seed de usuarios demo
(`scripts/seed-demo-users.mjs`), manejo de errores de Supabase visible en
UI, auditoría responsive, checklist de deploy Vercel.

### Sprint 2 — Catálogo NCM real
Catálogo NCM/tributos/intervenciones versionado (draft/active/inactive/
archived), importador CSV con validación, buscador y autocompletado en el
wizard, panel admin de catálogo/tributos/intervenciones, validación NCM
por un admin en el detalle de cada solicitud.

**Archivos clave:** `src/lib/ncm/` (normalización, búsqueda, match de
tributos/intervenciones, import CSV — todos con tests), `src/app/admin/ncm/`,
`src/components/ncm/`, `supabase/migrations/0002_ncm_catalog.sql`.

### Sprint 3 — Documentos, checklist, panel PJM robusto
Carga y reemplazo de documentos (Storage), checklist operativo de 25 ítems
con semáforo (rojo/amarillo/verde) calculado por función pura, comentarios
internos vs. visibles al cliente, auditoría (`audit_logs`) y notificaciones
in-app, panel PJM con KPIs/filtros/pestañas y el flujo "marcar listo para
cotización" con bloqueos explicables.

**Archivos clave:** `src/lib/checklist.ts`, `src/lib/readyForQuote.ts`,
`src/lib/auditLog.ts`, `src/lib/notify.ts`, `src/app/actions/documents.ts`,
`checklist.ts`, `comments.ts`, `notifications.ts`, `src/components/documents/`,
`checklist/`, `comments/`, `notifications/`,
`src/app/admin/solicitudes/[id]/page.tsx`,
`supabase/migrations/0003_documents_checklist_admin.sql`.

### Sprint 4 — Cotización comercial formal
Borrador de cotización (copia editable de ítems/costos, no referencia a la
simulación), aprobación interna, emisión con numeración correlativa
atómica (`COT-2026-0001` vía función SECURITY DEFINER), respuesta del
cliente (aceptar/rechazar), PDF comercial imprimible.

**Archivos clave:** `src/lib/quoteTotals.ts`, `src/app/actions/quotes.ts`,
`src/components/quotes/`, `src/app/simulaciones/[id]/cotizacion/pdf/`,
`supabase/migrations/0004_formal_quotes.sql`.

### Sprint 5 — Integraciones, feature flags, health center
Feature flags (email/WhatsApp/webhook, apagados por defecto), adapters de
notificación saliente con fallback a consola/log (sin proveedores reales),
tipo de cambio BNA de carga manual con snapshot en la cotización, CRUD de
referencias BCRA/VUCE, dos cron jobs protegidos por `CRON_SECRET`
(expirar cotizaciones y documentos vencidos), health center en
`/admin/integraciones`.

**Archivos clave:** `src/lib/integrations/dispatch.ts`, `src/lib/cron.ts`,
`src/app/actions/integrations.ts`, `src/app/api/cron/`,
`src/app/admin/integraciones/page.tsx`, `vercel.json`,
`supabase/migrations/0005_integrations.sql`.

### Post-release — Automatización de escenarios alternativos de envío parcial
Cuando una simulación marítima tiene mercadería divisible o con una
porción urgente, el sistema compara automáticamente el escenario marítimo
completo contra separar una parte por courier o por aéreo — siempre
estimativo, nunca presentado como ahorro garantizado ni como cotización
formal. Reglas de elegibilidad courier y tarifas 100% parametrizadas
(nada hardcodeado); motor puro con 31 tests reutiliza el motor de cálculo
existente para el tramo aéreo y el remanente marítimo.

**Archivos clave:** `src/lib/calculations/shipmentScenarioOptimizer.ts`,
`src/app/actions/scenarios.ts`, `src/components/scenarios/`,
`src/components/admin/ScenarioReviewPanel.tsx`,
`supabase/migrations/0006_shipment_scenarios.sql`. Ver `SCENARIOS_QA.md`
para el detalle completo y las simplificaciones documentadas.

---

## 3. Migraciones aplicadas

Aplicar **en orden** contra un proyecto Supabase (ver sección 5):

1. `supabase/migrations/0001_init.sql` — esquema base, RLS, índices, bucket de Storage.
2. `supabase/migrations/0002_ncm_catalog.sql` — catálogo NCM/tributos/intervenciones versionado.
3. `supabase/migrations/0003_documents_checklist_admin.sql` — documentos, checklist, auditoría, notificaciones.
4. `supabase/migrations/0004_formal_quotes.sql` — cotización comercial formal.
5. `supabase/migrations/0005_integrations.sql` — feature flags, tipo de cambio, referencias regulatorias, logs.
6. `supabase/migrations/0006_shipment_scenarios.sql` — reglas/tarifas courier y aéreo, campos de mercadería divisible, escenarios alternativos.

Después de las migraciones: `supabase/seed.sql` (catálogo NCM/tributos de
ejemplo, fallback — **no es el catálogo real de producción**, ver riesgos).

---

## 4. Variables de entorno necesarias

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

| Variable | Dónde se usa | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | Pública, va al bundle del navegador. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Pública; RLS protege los datos. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sólo server-side: `scripts/seed-demo-users.mjs`, `src/lib/auditLog.ts`, `src/lib/notify.ts`, `src/lib/integrations/dispatch.ts`, `/api/cron/*` | **Nunca** debe llegar al bundle del cliente — no tiene prefijo `NEXT_PUBLIC_`, Next.js ya la mantiene server-only. |
| `CRON_SECRET` | `src/lib/cron.ts`, `/api/cron/*` | String propio (ej. `openssl rand -hex 24`). Vercel lo inyecta automáticamente como header `Authorization: Bearer $CRON_SECRET` en las invocaciones de `vercel.json`. Sin esta variable, los cron routes rechazan todo con 401. |

No hay variables de proveedores externos (email/WhatsApp/webhooks/ARCA/BNA)
porque **no hay ninguna integración real conectada** en este release — ver
sección 8.

---

## 5. Buckets de Supabase requeridos

Un solo bucket, creado automáticamente por `0001_init.sql`:

- **`simulation-documents`** (privado, `public: false`) — documentación de
  cada simulación/solicitud (invoice, packing list, BL/AWB, etc.). Políticas
  de Storage: el dueño de la simulación o un `admin_pjm` puede leer; sólo
  el dueño autenticado puede subir (`owner = auth.uid()`).

No hace falta crear nada manualmente en **Storage** del dashboard — la
migración lo hace vía `insert into storage.buckets`.

---

## 6. Feature flags disponibles

Tabla `feature_flags`, sembrada por `0005_integrations.sql`, editable desde
`/admin/integraciones`:

| Key | Default | Efecto |
| --- | --- | --- |
| `email_notifications` | `false` | Si está en `true`, cada notificación in-app (`notifyUser`/`notifyAllAdmins`) también dispara el canal `email` — sin proveedor real conectado, cae a `console.log` + registro en `integration_logs`. Si está en `false`, el intento queda registrado como `skipped`. |
| `whatsapp_notifications` | `false` | Mismo mecanismo, canal `whatsapp`. **Sin punto de disparo automático todavía** (no hay ningún evento del producto que llame a este canal) — el flag y el adapter existen y están probados, pero no está cableado a ningún flujo. |
| `webhook_notifications` | `false` | Mismo mecanismo, canal `webhook`. Igual que WhatsApp: sin punto de disparo automático en este release. |

Ninguno de los tres requiere una credencial para activarse — activar el
flag sólo cambia el resultado registrado en `integration_logs` (de
`skipped` a `sent` vía fallback de consola), no conecta un proveedor real.

---

## 7. Limitaciones actuales (conocidas y deliberadas)

- **Sin integraciones externas reales**: ARCA, BNA, BCRA, VUCE, email,
  WhatsApp y webhooks son 100% de carga/operación manual o adapters con
  fallback a consola. No hay credenciales de ningún proveedor en el
  proyecto.
- **Catálogo NCM de ejemplo**: `supabase/seed.sql` carga ~7 posiciones NCM
  de muestra. No es el catálogo arancelario real — antes de producción hay
  que importar un catálogo real vía `/admin/ncm` (CSV).
- **Un solo rol admin (`admin_pjm`)**: no hay separación entre
  "despachante que valida NCM/documentos" y "quien aprueba/emite
  cotizaciones formales" — cualquier `admin_pjm` puede aprobar su propio
  borrador de cotización.
- **Sin OCR ni extracción automática** de datos de documentos (invoice,
  packing list, etc.) — carga y revisión 100% manual.
- **Vencimiento de documentos manual**: `documents.expires_at` existe y el
  cron lo usa, pero la UI de carga de documentos todavía no expone un campo
  para setear esa fecha (hay que hacerlo a mano en Supabase).
- **PDFs (preliminar y comercial) son vistas imprimibles del navegador**,
  no un renderer de PDF dedicado — sin membrete/diseño avanzado.
- **Sin OCR, pagos, firma digital, integración con ERP ni IA
  clasificadora de NCM** — explícitamente fuera de alcance del MVP.
- **No se corrió el QA manual de punta a punta** contra un proyecto
  Supabase real en este ciclo (los checklists existen en los `*_QA.md`,
  pero ejecutarlos es un paso pendiente antes de deploy — ver sección 12).
- **Cron jobs no verificados en Vercel real**: la lógica y la protección
  por `CRON_SECRET` tienen tests unitarios y se probaron localmente con
  `curl`, pero no se verificó todavía una ejecución real programada por
  Vercel Cron.

---

## 8. Backlog recomendado (post-demo interna)

Priorizado, no exhaustivo — ver también "Próximos pasos sugeridos" en
`README.md` para el detalle técnico de cada punto:

1. **Importar un catálogo NCM real** (reemplazar el seed de ejemplo) antes
   de cualquier demo con datos reales de un cliente.
2. **Correr el QA manual completo** de los 5 checklists (`QA_CHECKLIST.md`,
   `SPRINT_2_QA.md`…`SPRINT_5_QA.md`) contra un proyecto Supabase de
   staging real, con dos usuarios cliente distintos para las pruebas de RLS.
3. **Decidir sobre integraciones reales**: si el negocio necesita
   email/WhatsApp salientes de verdad para el piloto, conectar un proveedor
   real detrás de `src/lib/integrations/dispatch.ts` (el flag y el logging
   ya están listos, sólo falta el proveedor).
4. **Rol de despachante/especialista** separado de `admin_pjm` si la
   operación real lo requiere, con permisos más granulares.
5. **UI para `documents.expires_at`** en el formulario de carga, para que
   el cron de vencimiento de documentos sea útil sin editar Supabase a mano.
6. **Versionado de cotizaciones formales** (recotizar sobre una rechazada
   como v2) y separación de roles aprobador/armador si hace falta un
   control de cuatro ojos.
7. **PDF con diseño de marca** si el "imprimir desde el navegador" no
   alcanza para el uso comercial real.

---

## 9. Cómo correr local

```bash
npm install
cp .env.example .env.local   # completar con los valores de Supabase (sección 4)
npm run dev                  # http://localhost:3000
```

Requiere Node 18+ (o el que indique `package.json`/`.nvmrc` si existe) y
un proyecto de Supabase ya configurado (ver sección 10).

---

## 10. Cómo configurar Supabase

1. Crear un proyecto nuevo en [supabase.com/dashboard](https://supabase.com/dashboard)
   → **New project** (región `South America (São Paulo)` recomendada).
2. Copiar de **Project Settings → API**: `Project URL`, `anon public key` y
   `service_role key` a `.env.local` (sección 4).
3. Aplicar las 5 migraciones + el seed (sección 11).
4. Configurar **Authentication → URL Configuration**: `Site URL` y
   `Redirect URLs` apuntando a `http://localhost:3000` en desarrollo, y a la
   URL de Vercel una vez desplegado (paso 8 del `README.md`).
5. Verificar que el bucket `simulation-documents` existe en **Storage**
   (lo crea la migración `0001`, no hace falta crearlo a mano).

Instrucciones completas y alternativas (CLI vs. SQL Editor manual) en
`README.md`, sección "Cómo instalar y correr localmente".

---

## 11. Cómo aplicar las migraciones

**Opción A — Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push                                   # aplica 0001 a 0006 en orden
npx supabase db execute -f supabase/seed.sql --linked   # seed de catálogo NCM de ejemplo
```

**Opción B — SQL Editor del dashboard (sin CLI):** pegar y ejecutar, en
orden y cada uno en una query separada: `0001_init.sql`, `0002_ncm_catalog.sql`,
`0003_documents_checklist_admin.sql`, `0004_formal_quotes.sql`,
`0005_integrations.sql`, `0006_shipment_scenarios.sql`, y por último `seed.sql`.

Verificación: **Table Editor** debería mostrar ~28 tablas (incluyendo
`formal_quotes`, `feature_flags`, `exchange_rates`, `integration_logs`,
`shipping_scenario_rules`, `simulation_alternative_scenarios`, etc.) y
`ncm_positions`/`tax_parameters` deberían tener 7 filas cada una tras el
seed.

---

## 12. Cómo crear un usuario `admin_pjm`

**Opción rápida (desarrollo):**

```bash
npm run seed:demo-users
```

Crea `cliente.demo@pjm.local` y `admin.demo@pjm.local` (contraseña
`PjmDemo2026!` para ambos) vía la Admin API de Supabase. **No correr contra
producción** — es una contraseña pública y conocida.

**Opción manual (cualquier entorno):** registrar un usuario normal desde
`/registro` y después, en el **SQL Editor** de Supabase:

```sql
update public.profiles set role = 'admin_pjm' where email = 'tu-email@pjm.com.ar';

update auth.users
set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'admin_pjm')
where email = 'tu-email@pjm.com.ar';
```

No hace falta cerrar sesión — el gate de `/admin` lee `profiles.role` en
cada request.

---

## 13. Cómo correr tests / lint / build

```bash
npm run lint    # ESLint — debe terminar sin errores
npm run test    # Vitest — 94 tests unitarios, sin dependencias de Supabase
npm run build   # next build — typecheck + build de producción
```

Estado actual (verificado en este ciclo, ver sección 14): los tres
terminan limpios.

---

## 14. Checklist de QA manual

El QA manual de punta a punta contra un proyecto Supabase real **no se
corrió en este ciclo** — queda como paso explícito antes de dar por cerrado
el release candidate. Los checklists están escritos y listos para
ejecutar:

- [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) — registro, login, wizard,
  solicitud formal, panel admin, RLS entre dos clientes (Sprint 1 / 1.5).
- [`SPRINT_2_QA.md`](./SPRINT_2_QA.md) — buscador NCM, importación de
  catálogo/tributos/intervenciones, validación NCM en el panel PJM.
- [`SPRINT_3_QA.md`](./SPRINT_3_QA.md) — documentos, checklist operativo,
  panel PJM (KPIs/filtros/ready-for-quote), comentarios, auditoría,
  notificaciones, RLS.
- [`SPRINT_4_QA.md`](./SPRINT_4_QA.md) — borrador/aprobación/emisión de
  cotización formal, numeración correlativa, respuesta del cliente, PDF
  comercial, RLS.
- [`SPRINT_5_QA.md`](./SPRINT_5_QA.md) — health center, feature flags,
  tipo de cambio BNA, referencias BCRA/VUCE, cron jobs, RLS.
- [`SCENARIOS_QA.md`](./SCENARIOS_QA.md) — escenarios alternativos de
  envío parcial (marítimo + courier/aéreo), elegibilidad courier, wizard,
  panel PJM, auditoría, RLS.

**Orden recomendado para correrlos:** de punta a punta con dos usuarios
`cliente` distintos + un `admin_pjm`, siguiendo el orden de los sprints (un
checklist depende de datos creados por el anterior: simulación → solicitud
→ documentos/checklist → cotización → integraciones → escenarios
alternativos).

---

## 15. Pasos para deploy en Vercel

1. Importar el repositorio en [vercel.com/new](https://vercel.com/new)
   (framework "Next.js" se detecta solo).
2. En **Settings → Environment Variables**, cargar las 4 variables de la
   sección 4 para los entornos que corresponda (Production/Preview/
   Development). `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` no deben
   tener el prefijo `NEXT_PUBLIC_`.
3. Deploy — `npm run build` corre igual que en local, sin necesitar las
   variables de Supabase en build time (todas las rutas son dinámicas).
   `vercel.json` registra los dos cron jobs automáticamente.
4. Volver a **Supabase → Authentication → URL Configuration** y agregar la
   URL de producción a **Site URL** / **Redirect URLs** (si no, la
   confirmación de email redirige a `localhost`).
5. Verificación post-deploy: repetir al menos los puntos 1, 2 y 8 de
   `QA_CHECKLIST.md` (registro, login, permisos de admin) contra la URL de
   producción, y confirmar con `curl` que `/api/cron/*` devuelve 401 sin
   el header `Authorization`.

Checklist de "no hay nada hardcodeado" (detalle completo en `README.md`):
sin URLs/JWTs pegados a mano en `src/`, `.env.local` en `.gitignore`,
`.env.example` con las 4 variables sin valores reales, `npm run build`
funciona con `.env.local` ausente.

---

## 16. Riesgos conocidos

| Riesgo | Impacto | Mitigación / estado |
| --- | --- | --- |
| Catálogo NCM de seed no es real | Cálculos incorrectos si se usa con datos reales sin reemplazar el catálogo | Documentado en sección 7; importar catálogo real antes de cualquier demo con datos de cliente. |
| QA manual no ejecutado en este ciclo | Bugs de integración/RLS no detectados por los tests unitarios (que no tocan Supabase) | Checklists listos (sección 14); ejecutar antes de aprobar el release. |
| Un solo rol admin sin separación de funciones | Un mismo usuario puede armar y aprobar su propia cotización formal | Aceptado para el MVP; backlog ítem #4. |
| Cron jobs no probados en Vercel real | El vencimiento automático de cotizaciones/documentos podría no dispararse en producción si `CRON_SECRET` no está bien configurado | Verificar con `curl` post-deploy (sección 15, paso 5) antes de depender del cron. |
| `SUPABASE_SERVICE_ROLE_KEY` con privilegios amplios | Si se filtra, permite bypass de RLS completo | Nunca se importa desde código `'use client'` (verificado); mantenerla fuera de logs/repos. |
| Adapters de notificación sin proveedor real | Si se activa un feature flag esperando un envío real, el usuario no recibe nada (sólo queda en consola/log) | Comportamiento intencional y documentado (sección 6); no activar los flags en producción sin conectar un proveedor primero. |
| Sin backups/rollback plan documentado para Supabase | Un error en una migración o en datos de producción no tiene un procedimiento de recuperación definido en este repo | Fuera de alcance de este ciclo — a definir con el equipo de infraestructura antes de producción real. |

---

## 17. Próximos pasos operativos (orden sugerido)

1. Reautorizar GitHub MCP (o usar el flujo manual de PR) y abrir el PR
   desde `claude/cotizador-importacion-argentina-h2uxfi` — texto ya
   preparado en `PULL_REQUEST_DESCRIPTION.md`.
2. Deploy preview en Vercel.
3. Crear un proyecto de Supabase de staging y aplicar las 5 migraciones +
   seed.
4. Probar el flujo completo cliente/admin (los 5 checklists de QA, en
   orden) contra ese staging.
5. Demo interna del equipo.
6. Recién ahí, priorizar el backlog (sección 8) y decidir sobre
   integraciones reales.
