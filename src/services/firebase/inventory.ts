/**
 * Inventory — staff-only equipment/loan tracker. A club can have several
 * inventories, each either club-wide or scoped to one team, with fully
 * customizable columns (see InventoryField). inventoryItems is a flat
 * top-level collection (not a subcollection of inventories) so a club can
 * list every item across every inventory with a plain
 * where('clubId','==',...) query — same reasoning as registrationEntries.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Inventory, InventoryField, InventoryItem } from '../../types';

/** Fresh ids every call, so two inventories' default fields never collide. */
export function buildDefaultInventoryFields(): InventoryField[] {
  return [
    { id: crypto.randomUUID(), label: 'Name', type: 'text' },
    { id: crypto.randomUUID(), label: 'Equipment', type: 'text' },
    { id: crypto.randomUUID(), label: 'Given to', type: 'text' },
    { id: crypto.randomUUID(), label: 'Phone', type: 'text' },
    { id: crypto.randomUUID(), label: 'Email', type: 'text' },
    { id: crypto.randomUUID(), label: 'Deposit required', type: 'checkbox' },
    { id: crypto.randomUUID(), label: 'Deposit amount', type: 'number' },
    { id: crypto.randomUUID(), label: 'Paid on', type: 'date' },
    { id: crypto.randomUUID(), label: 'Return by', type: 'date', role: 'returnDate' },
    { id: crypto.randomUUID(), label: 'Returned', type: 'checkbox', role: 'returned' },
  ];
}

export async function createInventory(params: {
  clubId: string;
  teamId?: string;
  name: string;
  fields: InventoryField[];
  createdBy: string;
}): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'inventories'), {
    clubId: params.clubId,
    ...(params.teamId ? { teamId: params.teamId } : {}),
    name: params.name,
    fields: params.fields,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function getInventory(id: string): Promise<Inventory | null> {
  const snap = await getDoc(doc(db, 'inventories', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Inventory) : null;
}

export async function getClubInventories(clubId: string): Promise<Inventory[]> {
  const q = query(collection(db, 'inventories'), where('clubId', '==', clubId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Inventory));
}

export async function updateInventory(id: string, updates: { name?: string; fields?: InventoryField[] }): Promise<void> {
  await updateDoc(doc(db, 'inventories', id), { ...updates, updatedAt: Timestamp.now() });
}

export async function deleteInventory(id: string): Promise<void> {
  const items = await getInventoryItems(id);
  await Promise.all(items.map(item => deleteDoc(doc(db, 'inventoryItems', item.id))));
  await deleteDoc(doc(db, 'inventories', id));
}

/** Pulls the two role-tagged fields (if present) out of a values map, for denormalization. */
function deriveRoleFields(fields: InventoryField[], values: Record<string, string | number | boolean>) {
  const returnDateField = fields.find(f => f.role === 'returnDate');
  const returnedField = fields.find(f => f.role === 'returned');
  const returnDate = returnDateField ? (values[returnDateField.id] as string | undefined) || undefined : undefined;
  const returned = returnedField ? !!values[returnedField.id] : undefined;
  return { returnDate, returned };
}

export async function addInventoryItem(params: {
  inventory: Inventory;
  values: Record<string, string | number | boolean>;
  createdBy: string;
}): Promise<string> {
  const now = Timestamp.now();
  const { returnDate, returned } = deriveRoleFields(params.inventory.fields, params.values);
  const docRef = await addDoc(collection(db, 'inventoryItems'), {
    inventoryId: params.inventory.id,
    clubId: params.inventory.clubId,
    ...(params.inventory.teamId ? { teamId: params.inventory.teamId } : {}),
    values: params.values,
    ...(returnDate ? { returnDate } : {}),
    ...(returned !== undefined ? { returned } : {}),
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function updateInventoryItem(
  itemId: string,
  inventory: Inventory,
  values: Record<string, string | number | boolean>
): Promise<void> {
  const { returnDate, returned } = deriveRoleFields(inventory.fields, values);
  await updateDoc(doc(db, 'inventoryItems', itemId), {
    values,
    // A cleared/removed return-role field must actually clear the
    // denormalized copy too — never leave a stale value an unrelated field
    // update could leave behind.
    returnDate: returnDate ?? null,
    returned: returned ?? null,
    reminderSent: false, // a changed date/status deserves a fresh reminder cycle
    updatedAt: Timestamp.now(),
  });
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'inventoryItems', itemId));
}

export async function getInventoryItems(inventoryId: string): Promise<InventoryItem[]> {
  const q = query(collection(db, 'inventoryItems'), where('inventoryId', '==', inventoryId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
}
