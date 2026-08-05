import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/simulaciones', '/admin'];
const ADMIN_ONLY_PREFIXES = ['/admin'];
const AUTH_PAGES = ['/login', '/registro', '/recuperar-password'];

/**
 * Refreshes the Supabase session cookie and performs optimistic route
 * protection. Called from `proxy.ts` (Next.js 16 renamed `middleware.ts` to
 * `proxy.ts`; the underlying request lifecycle hook is unchanged).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => path.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  if ((isAdminOnly || isAuthPage) && user) {
    // Read the role from `profiles` rather than the JWT's `user_metadata`:
    // the metadata is only refreshed on token issuance, so it goes stale the
    // moment someone is promoted to admin_pjm directly in the database (the
    // documented way to create the first admin). Querying profiles keeps
    // this check correct immediately after a promotion, without requiring
    // the user to log out and back in.
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = profile?.role;

    if (isAdminOnly && role !== 'admin_pjm') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      url.searchParams.set('error', 'forbidden');
      return NextResponse.redirect(url);
    }

    if (isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = role === 'admin_pjm' ? '/admin' : '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
