import { NextResponse } from 'next/server';
import { getUsageReport } from '@/lib/usage';

// Always read fresh — usage changes as the pipeline runs.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getUsageReport());
}
