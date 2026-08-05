'use client';

import { useActionState } from 'react';
import { updatePassword } from '@/app/actions/auth';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="space-y-4">
      <PasswordField
        label="Contraseña nueva"
        htmlFor="password"
        error={state?.errors?.password}
        hint="Mínimo 8 caracteres."
        required
        minLength={8}
        autoComplete="new-password"
      />

      {state?.message && <p className="text-sm text-rose-600 font-medium">{state.message}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}
