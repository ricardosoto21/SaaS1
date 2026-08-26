"use server";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { initialStore } from "@/lib/seed";
import { readSupabaseStore, shouldUseSupabaseStore, writeSupabaseStore } from "@/lib/supabase-store";
import type { AppStore } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "app-store.json");

async function ensureStoreFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeFile(storePath, JSON.stringify(initialStore, null, 2), "utf8");
  }
}

export async function readStore(): Promise<AppStore> {
  if (shouldUseSupabaseStore()) {
    return readSupabaseStore();
  }

  await ensureStoreFile();
  const raw = await readFile(storePath, "utf8");
  return JSON.parse(raw) as AppStore;
}

export async function writeStore(store: AppStore) {
  if (shouldUseSupabaseStore()) {
    await writeSupabaseStore(store);
    return;
  }

  await ensureStoreFile();
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}
