<!--
  GitHub MCP no está conectado en este ciclo, así que el PR no se pudo
  abrir automáticamente. Este archivo tiene el título y la descripción
  listos para pegar a mano (o para que el bot los use apenas se
  reautorice GitHub MCP — ver RELEASE_CANDIDATE_v0.1.md, sección 17).

  Base: main (o la default branch del repo)
  Compare: claude/cotizador-importacion-argentina-h2uxfi
-->

# Título del PR

```
PJM Cotizador Inteligente de Importación Argentina — MVP + Sprints 2–5
```

# Descripción del PR

## Resumen ejecutivo

Release candidate v0.1 del cotizador de importación de PJM Comercio
Exterior: simula el costo nacionalizado de una importación argentina
(FOB → CIF → tributos → créditos fiscales → caja necesaria), y cubre todo
el ciclo operativo desde la simulación hasta una cotización comercial
formal — registro/login, catálogo NCM real y versionado, gestión de
documentos y checklist, panel interno PJM, cotización formal con
numeración y aprobación, y un centro de integraciones con feature flags.

Ninguna integración externa real (ARCA/BNA/BCRA/VUCE/email/WhatsApp) está
conectada todavía — es alcance deliberadamente fuera de este release; ver
`RELEASE_CANDIDATE_v0.1.md` para el detalle completo de limitaciones y
backlog recomendado.

## Alcance implementado

- **Sprint 1 (MVP)**: auth, perfil/empresa, dashboard, wizard de
  simulación, motor de cálculo, PDF preliminar, solicitud de cotización
  informal, panel admin básico.
- **Sprint 1.5**: estabilización — README real, auditoría de RLS/índices,
  QA checklist, seed de usuarios demo, manejo de errores, responsive,
  deploy-readiness.
- **Sprint 2**: catálogo NCM/tributos/intervenciones real, versionado e
  importable por CSV; buscador/autocompletado en el wizard; validación NCM
  por un admin.
- **Sprint 3**: documentos (carga/reemplazo vía Storage), checklist
  operativo con semáforo, comentarios internos/visibles, auditoría y
  notificaciones in-app, panel PJM robusto (KPIs, filtros, ready-for-quote).
- **Sprint 4**: cotización comercial formal — borrador editable, aprobación
  interna, emisión con numeración correlativa atómica, respuesta del
  cliente (aceptar/rechazar), PDF comercial.
- **Sprint 5**: feature flags, adapters de notificación con fallback a
  consola/log (sin proveedores reales), tipo de cambio BNA manual, CRUD de
  referencias BCRA/VUCE, cron jobs protegidos por `CRON_SECRET`, health
  center en `/admin/integraciones`.

Detalle completo por sprint (archivos, módulos, decisiones de alcance) en
`RELEASE_CANDIDATE_v0.1.md`.

## Cómo probar

1. Clonar la rama y `npm install`.
2. Crear un proyecto de Supabase y completar `.env.local` (ver variables
   más abajo).
3. Aplicar las 5 migraciones + `supabase/seed.sql` (`npx supabase db push`
   o pegarlas en el SQL Editor, en orden — ver `RELEASE_CANDIDATE_v0.1.md`
   sección 11).
4. `npm run seed:demo-users` para crear un usuario `cliente` y uno
   `admin_pjm` de prueba, o promover un usuario propio a mano (sección 12).
5. `npm run dev` y correr los checklists de QA manual en orden:
   `QA_CHECKLIST.md` → `SPRINT_2_QA.md` → `SPRINT_3_QA.md` →
   `SPRINT_4_QA.md` → `SPRINT_5_QA.md` (cada uno depende de datos creados
   por el anterior).

Verificación automática ya corrida en esta rama: `npm run lint`,
`npm run build` y `npm run test` (63 tests) — todos limpios.

## Migraciones

```
supabase/migrations/0001_init.sql                        # esquema base, RLS, índices, bucket de Storage
supabase/migrations/0002_ncm_catalog.sql                 # catálogo NCM/tributos/intervenciones versionado
supabase/migrations/0003_documents_checklist_admin.sql   # documentos, checklist, auditoría, notificaciones
supabase/migrations/0004_formal_quotes.sql                # cotización comercial formal
supabase/migrations/0005_integrations.sql                 # feature flags, tipo de cambio, referencias, logs
```

Aplicar en ese orden. Después, `supabase/seed.sql` (catálogo NCM de
ejemplo — no es el catálogo real de producción).

## Variables necesarias

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Detalle de dónde se usa cada una en `RELEASE_CANDIDATE_v0.1.md`, sección 4.

## Screenshots

Pendiente — no se generaron screenshots en este ciclo (release
candidate centrado en documentación/preparación, sin correr la app contra
un Supabase real). Agregar capturas del wizard, el panel PJM y el detalle
de cotización formal antes de la demo interna, o al validar el deploy de
staging.

## Checklist QA

- [ ] `QA_CHECKLIST.md` — Sprint 1 / 1.5 (auth, wizard, solicitud, RLS
      entre dos clientes).
- [ ] `SPRINT_2_QA.md` — catálogo NCM, importación, validación.
- [ ] `SPRINT_3_QA.md` — documentos, checklist, panel PJM, auditoría,
      notificaciones, RLS.
- [ ] `SPRINT_4_QA.md` — cotización formal, numeración, respuesta del
      cliente, PDF, RLS.
- [ ] `SPRINT_5_QA.md` — health center, feature flags, cron jobs, RLS.
- [ ] `npm run lint` sin errores.
- [ ] `npm run build` sin errores.
- [ ] `npm run test` — 63/63 en verde.

## Riesgos conocidos / limitaciones

Ver `RELEASE_CANDIDATE_v0.1.md`, secciones 7 y 16 — resumen: catálogo NCM
de seed no es real, QA manual de punta a punta no corrido en este ciclo,
un solo rol admin sin separación de funciones, cron jobs no probados en
Vercel real todavía, sin integraciones externas reales conectadas.
