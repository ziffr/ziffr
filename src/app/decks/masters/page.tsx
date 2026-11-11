import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { MastersScreen } from "./screen";
import type { Master } from "@/lib/types";

export default async function MastersPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const sp = await searchParams;
  const [{ data: masters }, people, viewer] = await Promise.all([db.from("masters").select("*").order("id"), getProfiles(), viewerId()]);
  const list = (masters ?? []) as Master[];
  const current = sp.new ? null : list.find((m) => m.id === Number(sp.id)) ?? list.find((m) => m.is_default) ?? list[0] ?? null;
  return (
    <>
      <PageHeader title="Masters" sub="Design a background, logo and footer once. Every slide of a deck that uses the master shows it, in Ziffr and in the exported PowerPoint." />
      <MastersScreen masters={list} current={current} isNew={Boolean(sp.new) || !list.length} people={people} viewer={viewer} />
    </>
  );
}
