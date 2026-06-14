-- Add sort_order column to products for drag-and-drop reordering in admin
alter table products add column if not exists sort_order integer;

-- Backfill existing rows with their current id order as initial sort_order
update products set sort_order = id where sort_order is null;
