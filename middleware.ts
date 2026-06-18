import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Supabase SSR auth entegrasyonu sonrası bu middleware aktif edilecek.
// Şu an sadece route yapısını korur.

const PROTECTED_ROUTES = ['/admin', '/santiye', '/satin-alma']
const PUBLIC_ROUTES = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // TODO: Supabase session kontrolü
  // const supabase = createMiddlewareClient({ req: request, res: NextResponse.next() })
  // const { data: { session } } = await supabase.auth.getSession()
  //
  // const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r))
  // if (isProtected && !session) {
  //   return NextResponse.redirect(new URL('/login', request.url))
  // }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
}
