import { modelIdForKey, MODEL_KEYS, planModelMigration } from "../src/model-portability.ts";

const target = process.argv[2] || modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST);
const releaseIntent = process.env.MODEL_MIGRATION_RELEASE_INTENT;
console.log(JSON.stringify(planModelMigration(target, { releaseIntent }), null, 2));
