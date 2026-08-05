/**
 * Translates raw Supabase Auth / Postgrest errors into short, friendly
 * Spanish messages for end users. Falls back to a generic message instead of
 * leaking internal details (SQL, RLS policy names, stack traces) to the UI.
 */

export function mapAuthError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();

  if (m.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Tu cuenta todavía no fue confirmada. Revisá tu email para confirmar el registro antes de iniciar sesión.';
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return 'Ya existe una cuenta con ese email. Iniciá sesión o recuperá tu contraseña.';
  }
  if (m.includes('password') && m.includes('at least')) {
    return 'La contraseña no cumple con los requisitos mínimos de seguridad.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Se realizaron demasiados intentos. Esperá unos minutos y volvé a intentar.';
  }
  if (m.includes('otp_expired') || m.includes('expired') || m.includes('token has expired') || m.includes('invalid')) {
    return 'El link no es válido o ya expiró. Solicitá uno nuevo.';
  }
  if (m.includes('same_password') || (m.includes('new password') && m.includes('different'))) {
    return 'La nueva contraseña debe ser distinta de la actual.';
  }
  if (m.includes('fetch failed') || m.includes('network')) {
    return 'No pudimos conectarnos con el servidor de autenticación. Revisá tu conexión e intentá nuevamente.';
  }

  return 'No pudimos completar la operación. Intentá nuevamente en unos minutos.';
}

export function mapDbError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();

  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'No tenés permisos para realizar esta acción.';
  }
  if (m.includes('duplicate key') || m.includes('already exists')) {
    return 'Ya existe un registro con esos datos.';
  }
  if (m.includes('violates foreign key')) {
    return 'La información hace referencia a un registro que ya no existe. Recargá la página e intentá de nuevo.';
  }
  if (m.includes('violates not-null constraint') || m.includes('violates check constraint')) {
    return 'Faltan datos obligatorios o hay un valor inválido en el formulario.';
  }
  if (m.includes('fetch failed') || m.includes('network')) {
    return 'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá nuevamente.';
  }

  return 'Ocurrió un error inesperado al guardar los datos. Intentá nuevamente.';
}
