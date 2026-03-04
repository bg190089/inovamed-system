// API Route: GET /api/ip
// Retorna o IP do cliente para uso no TCLE

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Vercel/Next.js headers com IP do cliente
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'Não identificado';

  return NextResponse.json({ ip });
}
