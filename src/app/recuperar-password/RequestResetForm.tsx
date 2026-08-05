'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '@/app/actions/auth';
import { Field, inputClass } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export function RequestResetForm({ invalidLink }: { invalidLink?: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  if (state?.success) {
    return <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">{state.message}</p>;
  }

  return (
    <form action={action} className="space-y-4">
      {invalidLink && !state?.message && (
        <p className="text-sm text-rose-600 font-medium">
          El link de recuperación no es válido o ya expiró. Pedí uno nuevo abajo.
        </p>
      )}
      <Field label="Email" htmlFor="email" error={state?.errors?.email}>
        <input id="email" name="email" type="email" required className={inputClass} placeholder="vos@empresa.com" />
      </Field>

      {state?.message && <p className="text-sm text-rose-600 font-medium">{state.message}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Enviando…' : 'Enviar link de recuperación'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="text-indigo-600 font-semibold hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
