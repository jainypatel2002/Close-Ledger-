"use client";

import Dexie, { Table } from "dexie";
import { ClosingInput, LotteryMasterEntry, Store, SyncMutation } from "@/lib/types";

export interface LocalStoreRecord extends Store {
  _dirty?: boolean;
}

export interface LocalClosingRecord extends ClosingInput {
  updated_at: string;
  _dirty?: boolean;
}

export interface LocalLotteryMasterRecord extends LotteryMasterEntry {
  _dirty?: boolean;
}

export interface LocalMonthlyAnalyticsRecord {
  id: string;
  store_id: string;
  year: number;
  month: number;
  range_months: number;
  payload: Record<string, unknown>;
  updated_at: string;
}

export interface LocalDocumentRecord {
  id: string;
  closing_day_id: string;
  store_id: string;
  file_name: string;
  bytes_base64: string;
  created_at: string;
  _dirty?: boolean;
}

export class NightlyClosingDexie extends Dexie {
  stores!: Table<LocalStoreRecord, string>;
  closings!: Table<LocalClosingRecord, string>;
  lotteryMasterEntries!: Table<LocalLotteryMasterRecord, string>;
  monthlyAnalyticsCache!: Table<LocalMonthlyAnalyticsRecord, string>;
  documents!: Table<LocalDocumentRecord, string>;
  mutations!: Table<SyncMutation, string>;

  constructor() {
    super("nightly-closing-db");
    this.version(1).stores({
      stores: "id,updated_at,_dirty",
      closings: "id,store_id,business_date,status,updated_at,_dirty",
      documents: "id,closing_day_id,store_id,created_at,_dirty",
      mutations: "id,type,status,store_id,entity_id,created_at,updated_at"
    });
    this.version(2).stores({
      stores: "id,updated_at,_dirty",
      closings: "id,store_id,business_date,status,updated_at,_dirty",
      lotteryMasterEntries: "id,store_id,display_number,is_active,updated_at,_dirty",
      monthlyAnalyticsCache: "id,store_id,year,month,range_months,updated_at",
      documents: "id,closing_day_id,store_id,created_at,_dirty",
      mutations: "id,type,status,store_id,entity_id,created_at,updated_at"
    });
  }
}

export const offlineDb = new NightlyClosingDexie();
