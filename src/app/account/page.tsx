import { redirect } from 'next/navigation';

export default async function AccountSearch({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain } = await searchParams;
  const clean = (domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (clean) redirect(`/account/${clean}`);
  redirect('/');
}
