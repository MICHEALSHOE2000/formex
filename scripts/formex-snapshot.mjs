import { writeFile } from "node:fs/promises";
import { catalogue } from "../server/formex.mjs";
const enabled = !!process.env.FORMEX_PROJECT_REF;
const rows = enabled ? await catalogue() : null;
await writeFile(
  "commerce/snapshot.mjs",
  "export default " + JSON.stringify(rows) + ";\n",
);
await writeFile(
  "commerce/enabled.mjs",
  "export const catalogueEnabled=" + enabled + ";\n",
);
