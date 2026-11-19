import js from '@eslint/js';
import globals from 'globals';
import nodePlugin from 'eslint-plugin-n';

const importsInternosDeModulo = {
  group: [
    '../../*/controllers/**',
    '../../*/services/**',
    '../../*/helpers/**',
    '../../*/routes/**',
    '../../helpers/**',
    '../../../helpers/**',
  ],
  message: 'Importa otro módulo solo desde su index.js y comparte utilidades desde shared/.',
};

const reglaLimitesModulo = (dependenciasProhibidas) => [
  'error',
  { patterns: [importsInternosDeModulo, ...dependenciasProhibidas] },
];

export default [
  {
    files: ['api/**/*.js'],
    ignores: ['api/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(render|redirect)$/]",
          message: 'La API responde JSON o binarios; las vistas y redirecciones pertenecen al cliente.',
        },
      ],
    },
  },
  {
    files: ['client/**/*.js'],
    ignores: ['client/test/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/api/**', 'sequelize', 'mariadb', '**/models/**'] }],
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      'client/public/bootstrap/**',
      'client/public/chartjs/**',
      'client/public/uploads/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  nodePlugin.configs['flat/recommended-module'],
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
    settings: { node: { version: '>=22' } },
    rules: {
      'no-unused-vars': 'warn',
      'no-control-regex': 'off',
      'n/no-process-exit': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    files: ['client/public/js/**/*.js'],
    languageOptions: { globals: { ...globals.browser, bootstrap: 'readonly', Chart: 'readonly' } },
  },
  {
    files: ['api/modules/**/*.js'],
    rules: {
      'no-restricted-imports': reglaLimitesModulo([]),
    },
  },
  {
    files: ['api/modules/accounts/**/*.js'],
    rules: {
      'no-restricted-imports': reglaLimitesModulo([
        { group: ['../catalog/**', '../../catalog/**'], message: 'Accounts must not depend on catalog.' },
        { group: ['../sales/**', '../../sales/**'], message: 'Accounts must not depend on sales.' },
        { group: ['../store/**', '../../store/**'], message: 'Accounts must not depend on store.' },
        { group: ['../orders/**', '../../orders/**'], message: 'Accounts must not depend on orders.' },
      ]),
    },
  },
  {
    files: ['api/modules/catalog/**/*.js'],
    rules: {
      'no-restricted-imports': reglaLimitesModulo([
        { group: ['../accounts/**', '../../accounts/**'], message: 'Catalog must not depend on accounts.' },
        { group: ['../sales/**', '../../sales/**'], message: 'Catalog must not depend on sales.' },
        { group: ['../store/**', '../../store/**'], message: 'Catalog must not depend on store.' },
        { group: ['../orders/**', '../../orders/**'], message: 'Catalog must not depend on orders.' },
      ]),
    },
  },
  {
    files: ['api/modules/sales/**/*.js'],
    rules: {
      'no-restricted-imports': reglaLimitesModulo([
        { group: ['../store/**', '../../store/**'], message: 'Sales must not depend on store.' },
        { group: ['../orders/**', '../../orders/**'], message: 'Sales must not depend on orders.' },
      ]),
    },
  },
  {
    files: ['api/modules/store/**/*.js'],
    rules: {
      'no-restricted-imports': reglaLimitesModulo([
        { group: ['../accounts/**', '../../accounts/**'], message: 'Store may only depend on catalog.' },
        { group: ['../sales/**', '../../sales/**'], message: 'Store may only depend on catalog.' },
        { group: ['../orders/**', '../../orders/**'], message: 'Store may only depend on catalog.' },
      ]),
    },
  },
  {
    files: ['api/modules/orders/**/*.js'],
    rules: {
      'no-restricted-imports': reglaLimitesModulo([
        { group: ['../store/**', '../../store/**'], message: 'Orders must not depend on store.' },
        { group: ['../sales/**', '../../sales/**'], message: 'Orders must not depend on sales.' },
      ]),
    },
  },
  {
    files: ['api/modules/*/api/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value='sequelize']",
          message: 'La sintaxis de Sequelize y sus operadores pertenecen a los servicios, no a los controladores.',
        },
        {
          selector:
            'ImportDeclaration[source.value=/models\\//] > ImportSpecifier[imported.name!=ROLES][imported.name!=ESTADO_PEDIDO][imported.name!=ESTADOS_PEDIDO][imported.name!=ETIQUETA_ESTADO_PEDIDO][imported.name!=OPCIONES_PAGO_PEDIDO]',
          message: 'Los controladores solo importan constantes de modelos; lleva las consultas a servicios.',
        },
        {
          selector: 'ImportDeclaration[source.value=/config\\/db\\.js$/]',
          message: 'La conexión y las transacciones pertenecen a los servicios.',
        },
      ],
    },
  },
  {
    files: ['api/shared/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../modules/**', '../../modules/**', '../../../modules/**'],
              message: 'Shared code must not depend on business modules.',
            },
          ],
        },
      ],
    },
  },
];
