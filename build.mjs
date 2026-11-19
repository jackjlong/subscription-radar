import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.mjs', 'model.mjs', 'renewals.mjs', 'import.mjs', 'storage.mjs']) {
  await copyFile(file, `dist/${file}`);
}
