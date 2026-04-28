-- Shipping notifications are now driven by ColiixStateTemplate (keyed on
-- Coliix's literal wording). The seven shipping_* MessageTemplate rows
-- and any rules tied to them are obsolete — the dispatcher no longer
-- maps order transitions to those triggers, so they could never fire.
-- Drop the rows so the Templates UI doesn't list ghosts. Existing
-- MessageLog rows retain their trigger value (the enum still has these
-- values for back-compat).

DELETE FROM "AutomationRule"
WHERE "trigger" IN (
  'shipping_label_created',
  'shipping_picked_up',
  'shipping_in_transit',
  'shipping_out_for_delivery',
  'shipping_delivered',
  'shipping_returned',
  'shipping_return_validated'
);

DELETE FROM "MessageTemplate"
WHERE "trigger" IN (
  'shipping_label_created',
  'shipping_picked_up',
  'shipping_in_transit',
  'shipping_out_for_delivery',
  'shipping_delivered',
  'shipping_returned',
  'shipping_return_validated'
);
