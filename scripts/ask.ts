import "dotenv/config";
import { askTara } from "../src/agent.js";
import { closePool } from "../src/db.js";

const question = process.argv.slice(2).join(" ");

if (!question) {
  console.error('Usage: npm run ask -- "How much did I spend on food in March 2025?"');
  process.exit(1);
}

const response = await askTara(question);
console.log(JSON.stringify(response, null, 2));
await closePool();

