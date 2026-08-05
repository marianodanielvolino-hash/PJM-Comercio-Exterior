import { Card } from '@/components/ui/Card';
import { RequestResetForm } from './RequestResetForm';

export default async function RecuperarPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">Recuperar contraseña</h1>
          <p className="text-sm text-slate-500 mt-1">Te enviamos un link para elegir una contraseña nueva.</p>
        </div>
        <Card>
          <RequestResetForm invalidLink={error === 'invalid_link'} />
        </Card>
      </div>
    </div>
  );
}
