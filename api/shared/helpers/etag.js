import { createHash } from 'node:crypto';
export const etag = (datos) => '"' + createHash('sha256').update(JSON.stringify(datos)).digest('hex') + '"';
