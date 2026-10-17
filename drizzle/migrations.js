// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_workout_pause.sql';
import m0002 from './0002_body_weight.sql';
import m0003 from './0003_built_in.sql';
import m0004 from './0004_water.sql';
import m0005 from './0005_food.sql';
import m0006 from './0006_food_grams.sql';
import m0007 from './0007_food_drinks.sql';
import m0008 from './0008_food_meal.sql';
import m0009 from './0009_health_activities.sql';
import m0010 from './0010_food_health.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010
    }
  }
  