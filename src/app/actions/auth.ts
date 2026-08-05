'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  LoginFormSchema,
  SignupFormSchema,
  RequestPasswordResetSchema,
  UpdatePasswordSchema,
  type LoginFormState,
  type SignupFormState,
  type RequestPasswordResetState,
  type UpdatePasswordState,
} from '@/lib/validations/auth';
import { mapAuthError } from '@/lib/errorMessages';

/** Site origin for building auth redirect links, derived from the incoming request (no extra env var needed). */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

export async function signup(_state: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const validated = SignupFormSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    whatsapp: formData.get('whatsapp'),
    password: formData.get('password'),
    businessName: formData.get('businessName'),
    cuit: formData.get('cuit'),
    taxCondition: formData.get('taxCondition'),
    address: formData.get('address'),
    industry: formData.get('industry'),
    importFrequency: formData.get('importFrequency'),
    usualTransportMode: formData.get('usualTransportMode'),
    usualProducts: formData.get('usualProducts'),
    acceptedTerms: formData.get('acceptedTerms'),
    acceptedEstimateNotice: formData.get('acceptedEstimateNotice'),
    acceptedCommercialContact: formData.get('acceptedCommercialContact'),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const data = validated.data;
  const supabase = await createClient();

  const { data: signUpData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        phone: data.phone,
        whatsapp: data.whatsapp || null,
        role: 'cliente',
        accepted_terms: true,
        accepted_estimate_notice: true,
        accepted_commercial_contact: data.acceptedCommercialContact === 'on',
      },
    },
  });

  if (error) {
    return { message: mapAuthError(error.message) };
  }

  const userId = signUpData.user?.id;
  let companyWarning: string | null = null;
  if (userId) {
    const { error: companyError } = await supabase.from('companies').insert({
      user_id: userId,
      business_name: data.businessName,
      cuit: data.cuit,
      tax_condition: data.taxCondition,
      address: data.address,
      industry: data.industry,
      import_frequency: data.importFrequency,
      usual_transport_mode: data.usualTransportMode,
      usual_products: data.usualProducts,
    });
    if (companyError) {
      companyWarning =
        'Tu cuenta se creó correctamente, pero no pudimos guardar los datos de tu empresa. Iniciá sesión y completalos desde "Perfil" antes de crear una simulación.';
    }
  }

  if (!signUpData.session) {
    return {
      message:
        companyWarning ??
        'Cuenta creada. Revisá tu email para confirmar el registro antes de iniciar sesión.',
    };
  }

  if (companyWarning) {
    return { message: companyWarning };
  }

  redirect('/dashboard');
}

export async function login(_state: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const validated = LoginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(validated.data);

  if (error) {
    return { message: mapAuthError(error.message) };
  }

  const role = data.user?.user_metadata?.role;
  redirect(role === 'admin_pjm' ? '/admin' : '/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/**
 * Always responds with the same generic success message regardless of
 * whether the email exists — avoids leaking which emails are registered.
 */
export async function requestPasswordReset(
  _state: RequestPasswordResetState,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const validated = RequestPasswordResetSchema.safeParse({ email: formData.get('email') });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/actualizar-password`,
  });

  // Rate-limit errors are worth surfacing; anything else still returns the
  // generic success message so we don't reveal whether the email exists.
  if (error && error.message.toLowerCase().includes('rate limit')) {
    return { message: mapAuthError(error.message) };
  }

  return {
    success: true,
    message: 'Si existe una cuenta con ese email, te enviamos un link para restablecer tu contraseña.',
  };
}

/** Only succeeds while the user has an active Supabase recovery session (see /auth/confirm). */
export async function updatePassword(_state: UpdatePasswordState, formData: FormData): Promise<UpdatePasswordState> {
  const validated = UpdatePasswordSchema.safeParse({ password: formData.get('password') });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { message: 'El link de recuperación no es válido o expiró. Solicitá uno nuevo.' };
  }

  const { error } = await supabase.auth.updateUser({ password: validated.data.password });
  if (error) {
    return { message: mapAuthError(error.message) };
  }

  await supabase.auth.signOut();
  redirect('/login?reset=success');
}
