// Auto shopping list: a pantry product that runs out (quantity 0) or expires goes on the list once,
// tagged «αυτόματα». The item remembers why (`autoListed`), so a row the user deletes is not re-added
// until the product is restocked and runs out / expires again.
import { createShoppingItem, normalizeSearch } from './domain.js';

const key = (name) => normalizeSearch(name).trim();

export function autoListAdds(items = [], shopping = [], today, now = new Date().toISOString()) {
  const pending = new Set(shopping.filter((row) => !row.checked).map((row) => key(row.name)));
  const added = [];
  let changed = false;
  const nextItems = items.map((item) => {
    const out = !(Number(item.quantity) > 0);
    const expired = /^\d{4}-\d{2}-\d{2}$/.test(String(item.expiry || '')) && item.expiry < today;
    const reason = out ? 'out' : expired ? `expired:${item.expiry}` : '';
    if (!reason) { if (!item.autoListed) return item; changed = true; const { autoListed, ...rest } = item; return rest; }
    if (item.autoListed === reason) return item;
    changed = true;
    if (!pending.has(key(item.name))) {
      pending.add(key(item.name));
      const quantity = Number(item.minimum) > 0 ? Number(item.minimum) : 1;
      added.push(createShoppingItem({ name: item.name, quantity, unit: item.unit, itemId: item.id, auto: true }, now));
    }
    return { ...item, autoListed: reason };
  });
  return changed ? { items: nextItems, shopping: [...shopping, ...added], added } : { items, shopping, added };
}
