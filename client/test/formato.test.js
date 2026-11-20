import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import html from 'vscode-html-languageservice';
import { formatearHtml, formatearContenido } from '../../tools/formato.js';
const { getLanguageService, TokenType } = html;

test('el formato HTML conserva etiquetas EJS, atributos dinámicos y contenido preformateado', () => {
  const original = `<% const titulo = "<Entrada>"; %><section><h1><%= titulo %></h1><% for (const item of items) { %><input value="<%= item %>" <% if (item === elegido) { %>checked<% } %>><% } %><pre>uno   dos\n  tres</pre><script type="application/json">{"valor": "a  b"}</script></section>`;
  const salida = formatearHtml(original, 'prueba.ejs');
  const etiquetas = (s) => s.match(/<%[\s\S]*?%>/g);
  assert.deepEqual(etiquetas(salida), etiquetas(original));
  const normalizar = (s) => {
    const scanner = getLanguageService().createScanner(s);
    const tokens = [];
    for (let tipo = scanner.scan(); tipo !== TokenType.EOS; tipo = scanner.scan()) {
      const texto = scanner.getTokenText();
      if (tipo !== TokenType.Whitespace && !(tipo === TokenType.Content && /^\s*$/.test(texto)))
        tokens.push([tipo, texto]);
    }
    return tokens;
  };
  const datos = { items: ['A', 'B'], elegido: 'B' };
  assert.deepEqual(normalizar(ejs.render(salida, datos)), normalizar(ejs.render(original, datos)));
  assert.match(salida, /uno {3}dos\n {2}tres/);
  assert.match(salida, /"valor": "a {2}b"/);
  assert.equal(formatearHtml(salida, 'prueba.ejs'), salida, 'una segunda pasada no produce diferencias');
});

test('normaliza CRLF sin cambiar el código EJS en clones de Windows', () => {
  const plantilla = '<%\nconst nombre = "Lonja";\n%><p><%= nombre %></p>\n';
  assert.equal(formatearHtml(plantilla.replaceAll('\n', '\r\n')), formatearHtml(plantilla));
});

test('el formato de archivos conserva LF o CRLF y queda estable para JavaScript y EJS', async () => {
  for (const [nombre, texto] of [
    ['prueba.js', 'const valor=1;\n'],
    ['prueba.ejs', '<div><%= nombre %></div>\n'],
  ]) {
    for (const salto of ['\n', '\r\n']) {
      const entrada = texto.replaceAll('\n', salto);
      const salida = await formatearContenido(entrada, nombre);
      assert.equal(salida.includes('\r\n'), salto === '\r\n');
      assert.equal(await formatearContenido(salida, nombre), salida);
    }
  }
});
