/**
 * Side-effect imports register Bull `.process()` handlers with the
 * single-process worker — required for the queues to actually pull jobs.
 * Imported once from src/index.ts.
 */
import '../modules/integrations/coliixV2/push.worker';
import '../modules/integrations/coliixV2/ingest.worker';
import '../modules/integrations/coliixV2/poll.worker';
