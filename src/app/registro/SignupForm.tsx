'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signup } from '@/app/actions/auth';
import { Field, inputClass, selectClass, textareaClass } from '@/components/ui/Field';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="space-y-6">
      <Card step={1} title="Tus datos">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre y apellido" htmlFor="fullName" error={state?.errors?.fullName}>
            <input id="fullName" name="fullName" required className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="email" error={state?.errors?.email}>
            <input id="email" name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Teléfono" htmlFor="phone" error={state?.errors?.phone}>
            <input id="phone" name="phone" required className={inputClass} />
          </Field>
          <Field label="WhatsApp (opcional)" htmlFor="whatsapp">
            <input id="whatsapp" name="whatsapp" className={inputClass} />
          </Field>
          <PasswordField
            label="Contraseña"
            htmlFor="password"
            error={state?.errors?.password}
            hint="Mínimo 8 caracteres."
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
      </Card>

      <Card step={2} title="Tu empresa">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Razón social" htmlFor="businessName" error={state?.errors?.businessName}>
            <input id="businessName" name="businessName" required className={inputClass} />
          </Field>
          <Field label="CUIT" htmlFor="cuit" error={state?.errors?.cuit}>
            <input id="cuit" name="cuit" required className={inputClass} placeholder="30-12345678-9" />
          </Field>
          <Field label="Condición fiscal" htmlFor="taxCondition" error={state?.errors?.taxCondition}>
            <select id="taxCondition" name="taxCondition" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Seleccioná una opción
              </option>
              <option value="responsable_inscripto">Responsable Inscripto</option>
              <option value="monotributista">Monotributista</option>
              <option value="exento">Exento</option>
              <option value="consumidor_final">Consumidor Final</option>
            </select>
          </Field>
          <Field label="Domicilio" htmlFor="address" error={state?.errors?.address}>
            <input id="address" name="address" required className={inputClass} />
          </Field>
          <Field label="Actividad / rubro" htmlFor="industry" error={state?.errors?.industry}>
            <input id="industry" name="industry" required className={inputClass} />
          </Field>
          <Field
            label="Frecuencia estimada de importación"
            htmlFor="importFrequency"
            error={state?.errors?.importFrequency}
          >
            <select id="importFrequency" name="importFrequency" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Seleccioná una opción
              </option>
              <option value="primera_vez">Es mi primera importación</option>
              <option value="ocasional">Ocasional (algunas veces al año)</option>
              <option value="mensual">Mensual</option>
              <option value="semanal">Semanal o más frecuente</option>
            </select>
          </Field>
          <Field
            label="Modalidad habitual"
            htmlFor="usualTransportMode"
            error={state?.errors?.usualTransportMode}
          >
            <select id="usualTransportMode" name="usualTransportMode" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Seleccioná una opción
              </option>
              <option value="maritima">Marítima</option>
              <option value="aerea">Aérea</option>
              <option value="terrestre">Terrestre</option>
              <option value="mixta">Mixta / no lo sé aún</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Productos que suele importar"
            htmlFor="usualProducts"
            error={state?.errors?.usualProducts}
          >
            <textarea id="usualProducts" name="usualProducts" required rows={2} className={textareaClass} />
          </Field>
        </div>
      </Card>

      <Card step={3} title="Consentimientos">
        <div className="space-y-3 text-sm text-slate-600">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptedTerms" className="mt-1" />
            <span>
              Acepto los{' '}
              <Link href="/terminos" className="text-indigo-600 hover:underline">
                términos y condiciones
              </Link>{' '}
              de uso de la plataforma.
            </span>
          </label>
          {state?.errors?.acceptedTerms && (
            <p className="text-xs text-rose-600 font-medium pl-6">{state.errors.acceptedTerms[0]}</p>
          )}

          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptedEstimateNotice" className="mt-1" />
            <span>
              Entiendo que los cálculos son <strong>estimativos</strong> y no constituyen cotización formal ni
              asesoramiento aduanero definitivo.
            </span>
          </label>
          {state?.errors?.acceptedEstimateNotice && (
            <p className="text-xs text-rose-600 font-medium pl-6">{state.errors.acceptedEstimateNotice[0]}</p>
          )}

          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptedCommercialContact" className="mt-1" />
            <span>Acepto ser contactado comercialmente por PJM Comercio Exterior.</span>
          </label>
        </div>
      </Card>

      {state?.message && <p className="text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-3">{state.message}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="text-indigo-600 font-semibold hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </form>
  );
}
