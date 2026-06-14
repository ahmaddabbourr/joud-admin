"use server";

import { createClient } from "../lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return supabase;
}

// ---- Products ----
export async function saveProduct(payload: Record<string, any>, editingId?: number) {
  const supabase = await requireUser();
  if (editingId) {
    const { error } = await supabase.from("products").update(payload).eq("id", editingId);
    if (error) { console.error("saveProduct update failed:", error.message, error); throw new Error(error.message); }
  } else {
    const { error } = await supabase.from("products").insert([payload]);
    if (error) { console.error("saveProduct insert failed:", error.message, error); throw new Error(error.message); }
  }
}

export async function deleteProduct(id: number) {
  const supabase = await requireUser();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderProducts(items: { id: number; sort_order: number }[]) {
  const supabase = await requireUser();
  for (const item of items) {
    const { error } = await supabase.from("products").update({ sort_order: item.sort_order }).eq("id", item.id);
    if (error) throw new Error(error.message);
  }
}

export async function toggleProductStock(id: number, field: "out_of_stock" | "sold_out", current: boolean) {
  const supabase = await requireUser();
  const otherField = field === "out_of_stock" ? "sold_out" : "out_of_stock";
  const { error } = await supabase.from("products").update({ [field]: !current, [otherField]: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function uploadProductImage(formData: FormData) {
  const supabase = await requireUser();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be smaller than 5MB");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false, contentType: file.type });
  if (error) { console.error("uploadProductImage failed:", error.message, error); throw new Error(error.message); }
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

// ---- Orders ----
export async function setOrderStatus(id: number, status: string, denial_reason?: string) {
  const supabase = await requireUser();
  const payload: Record<string, any> = { status };
  if (denial_reason !== undefined) payload.denial_reason = denial_reason;
  const { error } = await supabase.from("orders").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setOrdersStatusBulk(ids: number[], status: string) {
  const supabase = await requireUser();
  const { error } = await supabase.from("orders").update({ status }).in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteOrders(ids: number[]) {
  const supabase = await requireUser();
  const { error } = await supabase.from("orders").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

// ---- Settings ----
export async function saveSetting(key: string, value: any) {
  const supabase = await requireUser();
  const { data } = await supabase.from("settings").select("*").eq("key", key).single();
  if (data) {
    const { error } = await supabase.from("settings").update({ value }).eq("key", key);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("settings").insert([{ key, value }]);
    if (error) throw new Error(error.message);
  }
}

// ---- Categories ----
export async function addCategory(name: string, name_ar: string, slug: string) {
  const supabase = await requireUser();
  const { error } = await supabase.from("categories").insert([{ name, name_ar, slug }]);
  if (error) throw new Error(error.message);
}

export async function deleteCategory(id: number) {
  const supabase = await requireUser();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Promo Codes ----
export async function addPromoCode(code: string, discount_percent: number) {
  const supabase = await requireUser();
  const { error } = await supabase.from("promo_codes").insert([{ code: code.trim().toUpperCase(), discount_percent }]);
  if (error) throw new Error(error.message);
}

export async function togglePromoCode(id: number, current: boolean) {
  const supabase = await requireUser();
  const { error } = await supabase.from("promo_codes").update({ active: !current }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePromoCode(id: number) {
  const supabase = await requireUser();
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Reviews ----
export async function setReviewStatus(id: number, status: string) {
  const supabase = await requireUser();
  const { error } = await supabase.from("reviews").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteReview(id: number) {
  const supabase = await requireUser();
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
