import Link from 'next/link';
import { getCurrentUser } from '@/lib/dal';
import { Card } from '@/components/ui/Card';
import { UpdatePasswordForm } from './UpdatePasswordForm';

export default async function ActualizarPasswordPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">Elegí tu nueva contraseña</h1>
          <p className="text-sm text-slate-500 mt-1">Se va a usar la próxima vez que inicies sesión.</p>
        </div>
        <Card>
          {user ? (
            <UpdatePasswordForm />
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-500">
                Este link de recuperación no es válido o ya expiró. Pedí uno nuevo para continuar.
              </p>
              <Link
                href="/recuperar-password"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                Solicitar nuevo link
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
