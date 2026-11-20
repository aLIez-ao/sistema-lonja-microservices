import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import html from 'vscode-html-languageservice';
import { formatearHtml } from '../../tools/formato.js';
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
