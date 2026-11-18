import { DataTypes } from 'sequelize';
import db from '../shared/config/db.js';

export default db.define(
  'Idempotencia',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuario', key: 'id' },
      onDelete: 'CASCADE',
    },
    ambito: { type: DataTypes.STRING(120), allowNull: false },
    clave: { type: DataTypes.STRING(64), allowNull: false },
    entrada_hash: { type: DataTypes.STRING(64), allowNull: false },
    estado: { type: DataTypes.INTEGER, allowNull: false },
    respuesta: { type: DataTypes.JSON, allowNull: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'idempotencia',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['id_usuario', 'ambito', 'clave'], name: 'uq_idempotencia_usuario_ambito_clave' },
    ],
  },
);
