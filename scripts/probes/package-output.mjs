import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const directory = process.argv[2] ?? join(homedir(), '.tacuchi-updater', 'logs');
const counts = { files: 0, upgradeCommands: 0, candidateLines: 0, recognizablePackageLines: 0, managersWithRecognizablePackages: 0 };
if (existsSync(directory)) for (const file of readdirSync(directory)) {
  if (!file.endsWith('.log')) continue;
  counts.files++;
  const text = readFileSync(join(directory, file), 'utf8');
  counts.upgradeCommands += (text.match(/\$ .*\b(?:upgrade|update|install)\b/g) ?? []).length;
  counts.candidateLines += (text.match(/(?:==> (?:Upgrading|Installing) \S+|Updating \S+ v[\d.]+ -> v[\d.]+)/g) ?? []).length;
  counts.recognizablePackageLines += (text.match(/==> (?:Upgrading|Installing) [a-zA-Z][\w@./+-]*(?:\s|$)/g) ?? []).length;
}
counts.managersWithRecognizablePackages = counts.recognizablePackageLines > 0 ? 1 : 0;
console.log(JSON.stringify(counts));
