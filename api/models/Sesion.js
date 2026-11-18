import { DataTypes } from 'sequelize';
import db from '../shared/config/db.js';

export default db.define(
  'Sesion',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuario', key: 'id' },
      onDelete: 'CASCADE',
    },
    hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    version: { type: DataTypes.INTEGER, allowNull: false },
    expira: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: 'sesion', timestamps: false },
);
