import { DataTypes } from 'sequelize';
import db from '../shared/config/db.js';

export default db.define(
  'RefreshUsado',
  {
    hash: { type: DataTypes.STRING(64), primaryKey: true },
    id_sesion: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'sesion', key: 'id' },
      onDelete: 'CASCADE',
    },
  },
  { tableName: 'refresh_usado', timestamps: false },
);
