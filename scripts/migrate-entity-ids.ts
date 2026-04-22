import pg from "pg";

const connectionString = Deno.env.get("DATABASE_URL");
if (!connectionString) throw new Error("DATABASE_URL env var is required");

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Entity {
  id: string;
  name: string;
  color: string;
}

async function migrate() {
  const client = await pool.connect();
  try {
    const { rows: registries } = await client.query(
      "SELECT id, entities_json FROM registries WHERE entities_json IS NOT NULL"
    );

    let totalEntities = 0;
    let totalTransactions = 0;

    for (const reg of registries) {
      const registryId = reg.id as string;
      const raw = reg.entities_json;
      if (!raw) continue;

      const entities: Entity[] = typeof raw === "string" ? JSON.parse(raw) : raw;
      const needsMigration = entities.some((e) => !UUID_RE.test(e.id));
      if (!needsMigration) continue;

      const idMap = new Map<string, string>();
      for (const entity of entities) {
        if (!UUID_RE.test(entity.id)) {
          idMap.set(entity.id, crypto.randomUUID());
        }
      }

      if (idMap.size === 0) continue;

      console.log(
        `[registry ${registryId}] Mapping ${idMap.size} entity ID(s): ${[...idMap.entries()].map(([o, n]) => `${o} -> ${n}`).join(", ")}`
      );

      await client.query("BEGIN");

      try {
        const updatedEntities = entities.map((e) => ({
          ...e,
          id: idMap.get(e.id) ?? e.id,
        }));
        await client.query(
          "UPDATE registries SET entities_json = $1 WHERE id = $2",
          [JSON.stringify(updatedEntities), registryId]
        );

        const { rows: txRows } = await client.query(
          "SELECT id, user_paid, split_json FROM transactions WHERE registry_id = $1",
          [registryId]
        );

        for (const tx of txRows) {
          const txId = tx.id as string;
          const userPaid = tx.user_paid as string;
          const splitJson = tx.split_json;
          let needsUpdate = false;
          let newUserPaid = userPaid;
          let newSplitJson = splitJson;

          if (idMap.has(userPaid)) {
            newUserPaid = idMap.get(userPaid)!;
            needsUpdate = true;
          }

          if (splitJson && typeof splitJson === "object") {
            const parsed = typeof splitJson === "string"
              ? JSON.parse(splitJson)
              : { ...splitJson };
            let splitChanged = false;
            if (parsed.splits && Array.isArray(parsed.splits)) {
              for (const split of parsed.splits) {
                if (idMap.has(split.userId)) {
                  split.userId = idMap.get(split.userId)!;
                  splitChanged = true;
                }
              }
            }
            if (splitChanged) {
              newSplitJson = JSON.stringify(parsed);
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            await client.query(
              "UPDATE transactions SET user_paid = $1, split_json = $2 WHERE id = $3",
              [newUserPaid, newSplitJson, txId]
            );
            totalTransactions++;
          }
        }

        await client.query("COMMIT");
        totalEntities += idMap.size;
        console.log(
          `[registry ${registryId}] Committed: ${idMap.size} entities, ${totalTransactions} transactions updated`
        );
        totalTransactions = 0;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[registry ${registryId}] ROLLED BACK due to error:`, err);
        throw err;
      }
    }

    console.log(`\nDone. Migrated ${totalEntities} entity ID(s) across all registries.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  Deno.exit(1);
});
