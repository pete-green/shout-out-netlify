import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key.trim()] = value;
    }
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Your old tracking system data
const oldSystemTGLs = [
  { date: '10/1/2025', time: '10:29 AM', tech: 'Chris Mccue', customer: 'Richard E Garcia' },
  { date: '10/1/2025', time: '10:30 AM', tech: 'Chris Mccue', customer: 'Richard E Garcia' },
  { date: '10/1/2025', time: '4:05 PM', tech: 'Cole Short', customer: 'Bobby Garcia' },
  { date: '10/2/2025', time: '12:30 PM', tech: 'Gino Gomez', customer: 'Annika Purvis' },
  { date: '10/3/2025', time: '8:59 AM', tech: 'Gino Gomez', customer: 'Bryan & Bethany Thacker' },
  { date: '10/3/2025', time: '9:26 AM', tech: 'Gino Gomez', customer: 'Leah Gillespie' },
  { date: '10/3/2025', time: '3:50 PM', tech: 'Kylee Driver', customer: 'Jaclyn Schladt' },
  { date: '10/3/2025', time: '4:00 PM', tech: 'Robert McGuire', customer: 'Andrew Kline' },
  { date: '10/6/2025', time: '5:32 PM', tech: 'Cole Short', customer: 'Fernando Oliveira' },
  { date: '10/8/2025', time: '12:30 PM', tech: 'Robert Johnson', customer: 'Linda Goff' },
  { date: '10/8/2025', time: '5:53 PM', tech: 'Robert Johnson', customer: 'Alan and Amy Mueller' },
  { date: '10/9/2025', time: '2:58 PM', tech: 'Robert Johnson', customer: 'Brittany Bailey' },
  { date: '10/9/2025', time: '4:15 PM', tech: 'Cole Short', customer: 'Sarah Black' },
  { date: '10/9/2025', time: '6:15 PM', tech: 'Robert McGuire', customer: 'Kaitlin & Nick Todora' },
  { date: '10/9/2025', time: '7:14 PM', tech: 'Robert Johnson', customer: 'Sally Alvarez' },
  { date: '10/10/2025', time: '11:56 AM', tech: 'Robert McGuire', customer: 'Jim Stratford' },
  { date: '10/10/2025', time: '3:12 PM', tech: 'Gino Gomez', customer: 'Tommy Wehrenberg' },
  { date: '10/13/2025', time: '6:20 PM', tech: 'Gino Gomez', customer: 'Kim Moore' },
  { date: '10/14/2025', time: '4:20 PM', tech: 'Gino Gomez', customer: 'Ping Zhang' },
  { date: '10/14/2025', time: '5:38 PM', tech: 'Tony Rivera', customer: 'Keith Waters' },
  { date: '10/15/2025', time: '2:38 PM', tech: 'Gino Gomez', customer: 'Ashley Robinson' },
  { date: '10/15/2025', time: '5:08 PM', tech: 'Gino Gomez', customer: 'Donna Cooper' },
  { date: '10/16/2025', time: '3:59 PM', tech: 'Gino Gomez', customer: 'Darlene Bigelow' },
  { date: '10/20/2025', time: '9:56 AM', tech: 'Robert McGuire', customer: 'Cathy Wilson' },
  { date: '10/20/2025', time: '1:51 PM', tech: 'Chris Mccue', customer: 'Pat Decker' },
  { date: '10/20/2025', time: '1:58 PM', tech: 'Gino Gomez', customer: 'Marshall Tuck' },
  { date: '10/20/2025', time: '5:37 PM', tech: 'Gino Gomez', customer: 'Kneeland, Doug & Ratliff, Sherry' },
  { date: '10/21/2025', time: '2:23 PM', tech: 'Gino Gomez', customer: 'Ann Tangedal' },
  { date: '10/21/2025', time: '2:37 PM', tech: 'Robert Johnson', customer: 'Nancy Bruce' },
  { date: '10/22/2025', time: '12:17 PM', tech: 'Robert McGuire', customer: 'Zack Hixon' },
  { date: '10/22/2025', time: '12:57 PM', tech: 'Robert Johnson', customer: 'Lisa & Daniel Nance' },
  { date: '10/22/2025', time: '3:01 PM', tech: 'Gino Gomez', customer: 'Laura Johnson' },
];

console.log('🔍 Comparing old tracking system with database TGLs\n');

// Get all TGLs from database
const { data: dbTGLs } = await supabase
  .from('estimates')
  .select('estimate_id, salesperson, customer_name, sold_at, option_name')
  .eq('is_tgl', true)
  .gte('sold_at', '2025-10-01T00:00:00')
  .lte('sold_at', '2025-10-31T23:59:59')
  .order('sold_at', { ascending: true });

console.log(`📊 Database has ${dbTGLs?.length || 0} TGLs for October`);
console.log(`📊 Old system had ${oldSystemTGLs.length} TGLs\n`);

// Group database TGLs by date
const dbByDate = {};
(dbTGLs || []).forEach(tgl => {
  const soldDate = new Date(tgl.sold_at);
  const dateStr = soldDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  if (!dbByDate[dateStr]) {
    dbByDate[dateStr] = [];
  }
  dbByDate[dateStr].push(tgl);
});

// Group old system TGLs by date
const oldByDate = {};
oldSystemTGLs.forEach(tgl => {
  if (!oldByDate[tgl.date]) {
    oldByDate[tgl.date] = [];
  }
  oldByDate[tgl.date].push(tgl);
});

console.log('═══════════════════════════════════════════════════\n');

// Compare day by day
const allDates = new Set([...Object.keys(oldByDate), ...Object.keys(dbByDate)]);
const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

let missingFromDB = 0;
let extraInDB = 0;

sortedDates.forEach(date => {
  const oldCount = oldByDate[date]?.length || 0;
  const dbCount = dbByDate[date]?.length || 0;

  if (oldCount === 0 && dbCount > 0) {
    console.log(`📅 ${date}`);
    console.log(`   ✨ ${dbCount} NEW TGLs found (not in old system):`);
    dbByDate[date].forEach(tgl => {
      const time = new Date(tgl.sold_at).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit'
      });
      console.log(`      ${time} - ${tgl.salesperson} - ${tgl.customer_name}`);
    });
    extraInDB += dbCount;
    console.log('');
  } else if (oldCount > 0 && dbCount === 0) {
    console.log(`📅 ${date}`);
    console.log(`   ❌ ${oldCount} TGLs MISSING from database:`);
    oldByDate[date].forEach(tgl => {
      console.log(`      ${tgl.time} - ${tgl.tech} - ${tgl.customer}`);
    });
    missingFromDB += oldCount;
    console.log('');
  } else if (oldCount !== dbCount) {
    console.log(`📅 ${date}`);
    console.log(`   ⚠️  Mismatch: Old system has ${oldCount}, database has ${dbCount}`);

    if (oldCount > dbCount) {
      console.log(`   ❌ Possibly missing ${oldCount - dbCount} TGLs:`);
      oldByDate[date].forEach(old => {
        const found = dbByDate[date]?.find(db =>
          db.salesperson.toLowerCase().includes(old.tech.toLowerCase().split(' ')[0]) &&
          (db.customer_name.toLowerCase().includes(old.customer.toLowerCase().split(' ')[0]) ||
           db.customer_name.toLowerCase().includes(old.customer.toLowerCase().split(',')[0]))
        );
        if (!found) {
          console.log(`      ${old.time} - ${old.tech} - ${old.customer}`);
          missingFromDB++;
        }
      });
    } else {
      console.log(`   ✨ Found ${dbCount - oldCount} additional TGLs:`);
      dbByDate[date].forEach(db => {
        const time = new Date(db.sold_at).toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit'
        });
        const found = oldByDate[date]?.find(old =>
          old.tech.toLowerCase().includes(db.salesperson.toLowerCase().split(' ')[0]) &&
          (old.customer.toLowerCase().includes(db.customer_name.toLowerCase().split(' ')[0]) ||
           old.customer.toLowerCase().includes(db.customer_name.toLowerCase().split(',')[0]))
        );
        if (!found) {
          console.log(`      ${time} - ${db.salesperson} - ${db.customer_name}`);
          extraInDB++;
        }
      });
    }
    console.log('');
  } else if (oldCount > 0) {
    console.log(`📅 ${date} - ✅ ${oldCount} TGLs match`);
  }
});

console.log('\n═══════════════════════════════════════════════════\n');
console.log('📈 FINAL SUMMARY:');
console.log(`   Old system total: ${oldSystemTGLs.length}`);
console.log(`   Database total: ${dbTGLs?.length || 0}`);
console.log(`   Missing from DB: ${missingFromDB}`);
console.log(`   Extra in DB (after old system stopped): ${extraInDB}`);

if (missingFromDB === 0) {
  console.log('\n✅ All TGLs from old system found in database!');
} else {
  console.log(`\n❌ ${missingFromDB} TGLs from old system are missing from database`);
}
