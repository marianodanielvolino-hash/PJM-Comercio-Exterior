import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6">
        <Compass className="w-7 h-7" />
      </div>
      <span className="text-indigo-600 font-extrabold text-xs uppercase tracking-wider mb-2">Error 404</span>
      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Esta página no existe</h1>
      <p className="text-slate-500 mt-3 max-w-md text-sm sm:text-base">
        Puede que el enlace esté mal escrito o que la página se haya movido. Revisá la dirección o volvé al
        inicio.
      </p>
      <Link
        href="/"
        className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
