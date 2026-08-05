import { z } from 'zod';

export const SignupFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: 'Ingresá tu nombre y apellido.' }),
  email: z.email({ error: 'Ingresá un email válido.' }).trim(),
  phone: z.string().trim().min(6, { error: 'Ingresá un teléfono de contacto.' }),
  whatsapp: z.string().trim().optional().or(z.literal('')),
  password: z.string().min(8, { error: 'La contraseña debe tener al menos 8 caracteres.' }),
  businessName: z.string().trim().min(2, { error: 'Ingresá la razón social.' }),
  cuit: z.string().trim().min(6, { error: 'Ingresá el CUIT.' }),
  taxCondition: z.string().trim().min(1, { error: 'Seleccioná la condición fiscal.' }),
  address: z.string().trim().min(2, { error: 'Ingresá el domicilio de la empresa.' }),
  industry: z.string().trim().min(1, { error: 'Ingresá la actividad o rubro.' }),
  importFrequency: z.string().trim().min(1, { error: 'Seleccioná la frecuencia estimada de importación.' }),
  usualTransportMode: z.string().trim().min(1, { error: 'Seleccioná la modalidad habitual.' }),
  usualProducts: z.string().trim().min(1, { error: 'Contanos qué productos importás habitualmente.' }),
  acceptedTerms: z.literal('on', { error: 'Debés aceptar los términos y condiciones.' }),
  acceptedEstimateNotice: z.literal('on', { error: 'Debés aceptar el aviso de cálculo estimativo.' }),
  acceptedCommercialContact: z.string().optional(),
});

export type SignupFormState =
  | {
      errors?: Partial<Record<keyof z.infer<typeof SignupFormSchema>, string[]>>;
      message?: string;
    }
  | undefined;

export const LoginFormSchema = z.object({
  email: z.email({ error: 'Ingresá un email válido.' }).trim(),
  password: z.string().min(1, { error: 'Ingresá tu contraseña.' }),
});

export type LoginFormState =
  | {
      errors?: Partial<Record<keyof z.infer<typeof LoginFormSchema>, string[]>>;
      message?: string;
    }
  | undefined;

export const RequestPasswordResetSchema = z.object({
  email: z.email({ error: 'Ingresá un email válido.' }).trim(),
});

export type RequestPasswordResetState =
  | {
      errors?: Partial<Record<keyof z.infer<typeof RequestPasswordResetSchema>, string[]>>;
      message?: string;
      success?: boolean;
    }
  | undefined;

export const UpdatePasswordSchema = z.object({
  password: z.string().min(8, { error: 'La contraseña debe tener al menos 8 caracteres.' }),
});

export type UpdatePasswordState =
  | {
      errors?: Partial<Record<keyof z.infer<typeof UpdatePasswordSchema>, string[]>>;
      message?: string;
    }
  | undefined;
