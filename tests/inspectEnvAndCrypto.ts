import fs from "fs";
import path from "path";
import { isEncryptedDocument, decryptDocument, getEncryptionKey } from "../src/lib/crypto";
import prisma from "../src/lib/db";

async function inspect() {
  console.log("=== CRYPTOGRAPHY & UPLOADS AUDIT ===");
  const dir = path.join(process.cwd(), "uploads");
  const files = fs.readdirSync(dir).filter((f) => f !== ".gitkeep");
  console.log(`Total files in uploads: ${files.length}`);

  for (const f of files) {
    const filePath = path.join(dir, f);
    const buf = fs.readFileSync(filePath);
    const hasMagic = isEncryptedDocument(buf);

    let decryptOk = false;
    let errMsg = "";
    try {
      const res = await decryptDocument(buf);
      decryptOk = true;
      console.log(`File: ${f} | Size: ${buf.length} bytes | Has CVLT_GCM: ${hasMagic} | Decryption: SUCCESS (isEncrypted: ${res.isEncrypted})`);
    } catch (e: any) {
      errMsg = e.message;
      console.log(`File: ${f} | Size: ${buf.length} bytes | Has CVLT_GCM: ${hasMagic} | Decryption: FAILED (${errMsg})`);
    }
  }

  console.log("\n=== DATABASE DOCUMENTS AUDIT ===");
  const dbDocs = await prisma.document.findMany();
  console.log(`Total documents in database: ${dbDocs.length}`);
  for (const doc of dbDocs) {
    const p = path.join(dir, doc.storageKey);
    const exists = fs.existsSync(p);
    console.log(`Doc: "${doc.title}" | StorageKey: ${doc.storageKey} | FileExistsOnDisk: ${exists}`);
  }
}

inspect()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
