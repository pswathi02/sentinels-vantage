import { redirect } from 'next/navigation';

export default async function AccountSearch({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; days?: string }>;
}) {
  const { domain, days } = await searchParams;
  const clean = (domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const window = [30, 90, 180].includes(Number(days)) ? Number(days) : 30;
  if (clean) redirect(`/account/${clean}?days=${window}`);
  redirect('/');
}
