'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Field, inputClass } from './Field';

/** Password input with a show/hide toggle, built on top of Field/inputClass. */
export function PasswordField({
  label,
  htmlFor,
  name,
  error,
  hint,
  required,
  minLength,
  autoComplete,
}: {
  label: string;
  htmlFor: string;
  name?: string;
  error?: string[];
  hint?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} htmlFor={htmlFor} error={error} hint={hint}>
      <div className="relative">
        <input
          id={htmlFor}
          name={name ?? htmlFor}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className={inputClass + ' pr-10'}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </Field>
  );
}
