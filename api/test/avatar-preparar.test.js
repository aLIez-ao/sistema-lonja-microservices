import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'lonja-avatar-test-'));
process.env.UPLOADS_DIR = uploads;
const { DIR_AVATARES, prepararFoto } = await import('../modules/accounts/index.js');
const png =
  'data:image/png;base64,' +
  (
    await sharp({ create: { width: 10, height: 10, channels: 3, background: '#123456' } })
      .png()
      .toBuffer()
  ).toString('base64');
const anteriorUrl = '/uploads/avatares/u7-anterior.png';

before(async () => {
  await fs.mkdir(DIR_AVATARES, { recursive: true });
  await fs.writeFile(path.join(DIR_AVATARES, path.basename(anteriorUrl)), Buffer.from('anterior'));
});
after(async () => fs.rm(uploads, { recursive: true, force: true }));

test('revierte la foto nueva y conserva la anterior si la transacción falla', async () => {
  const preparada = await prepararFoto({ id: 7, foto: anteriorUrl }, { fotoData: png });
  assert.equal(preparada.foto.startsWith('/uploads/avatares/'), true);
  await fs.access(path.join(DIR_AVATARES, path.basename(anteriorUrl)));
  await fs.access(path.join(DIR_AVATARES, path.basename(preparada.foto)));
  await preparada.revertir();
  await fs.access(path.join(DIR_AVATARES, path.basename(anteriorUrl)));
  await assert.rejects(fs.access(path.join(DIR_AVATARES, path.basename(preparada.foto))));
});

test('confirma la foto nueva y limpia la anterior después de guardar', async () => {
  const preparada = await prepararFoto({ id: 7, foto: anteriorUrl }, { fotoData: png });
  await preparada.confirmar();
  await fs.access(path.join(DIR_AVATARES, path.basename(preparada.foto)));
  await assert.rejects(fs.access(path.join(DIR_AVATARES, path.basename(anteriorUrl))));
});

test('recodifica el avatar y elimina EXIF, orientación y metadatos de origen', async () => {
  const original = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#456789' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'dato privado', ImageDescription: 'metadatos que no deben publicarse' } })
    .toBuffer();
  assert.ok((await sharp(original).metadata()).exif);
  const foto = await prepararFoto({ id: 8 }, { fotoData: 'data:image/jpeg;base64,' + original.toString('base64') });
  const datos = await sharp(await fs.readFile(path.join(DIR_AVATARES, path.basename(foto.foto)))).metadata();
  assert.equal(datos.format, 'webp');
  assert.ok(datos.width <= 256 && datos.height <= 256);
  assert.equal(datos.exif, undefined);
  assert.equal(datos.xmp, undefined);
  assert.equal(datos.orientation, undefined);
});
