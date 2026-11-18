import { DataTypes } from 'sequelize';
import db from '../shared/config/db.js';

const Migracion = db.define(
  'Migracion',
  {
    id: { type: DataTypes.STRING(120), primaryKey: true },
    aplicado_en: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: 'migracion', timestamps: false },
);

export default Migracion;
