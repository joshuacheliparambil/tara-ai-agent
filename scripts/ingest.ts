import "dotenv/config";
import { pool, withTransaction } from "../src/db.js";
import { ingestSnapshot } from "../src/ingest.js";

const snapshotDir = process.env.DATA_DIR ?? process.env.DEFAULT_DATA_DIR ?? "./data/sample_a";

async function main() {
  const result = await withTransaction((client) => ingestSnapshot(client, snapshotDir));
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});

