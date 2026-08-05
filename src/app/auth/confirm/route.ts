import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_OTP_TYPES = ['email', 'recovery', 'invite', 'email_change'] as const;
type ValidOtpType = (typeof VALID_OTP_TYPES)[number];

function isValidOtpType(type: string | null): type is ValidOtpType {
  return VALID_OTP_TYPES.includes(type as ValidOtpType);
}

/**
 * Landing point for links sent by Supabase Auth emails (currently only the
 * password-recovery email, see requestPasswordReset in
 * src/app/actions/auth.ts). Exchanges the token hash for a session, then
 * redirects to `next` — for recovery links that's /actualizar-password,
 * where updatePassword() finishes the flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/';

  if (tokenHash && isValidOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect('/recuperar-password?error=invalid_link');
}
