import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabase } from './lib/supabase.js';
import cron from 'node-cron';
import { fetchAndStoreDailyCounts } from './scripts/fetchDailyCounts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../../src/frontend')));

// Initial backfill of daily_counts on startup
fetchAndStoreDailyCounts().catch(console.error);

// Schedule daily backfill of daily_counts at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily_counts backfill...');
  try {
    await fetchAndStoreDailyCounts();
    console.log('daily_counts backfill complete');
  } catch (err) {
    console.error('daily_counts backfill error:', err);
  }
});

// API Routes
app.get('/api/detections/recent', async (req, res) => {
  try {
    // Number of days for sparkline (excludes today)
    const days = 31;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // Fetch daily counts for the last `days` days, paginated to fetch all rows
    let allRows = [];
    let page = 0;
    let pageSize = 1000;
    let fetched;
    do {
      const { data, error } = await supabase
        .from('daily_counts')
        .select('*')
        .gte('date', sinceDate)
        .order('date', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      fetched = data.length;
      allRows = allRows.concat(data);
      page++;
    } while (fetched === pageSize);
    const rows = allRows;

    // Debug patch: print sinceDate, total rows, and all dates for Eastern Bluebird
    console.log('sinceDate used in query:', sinceDate);
    console.log('Total rows returned from Supabase:', rows.length);
    const bluebirdRows = rows.filter(r => r.common_name === 'Eastern Bluebird');
    console.log('ALL DB rows for Eastern Bluebird:', bluebirdRows);
    console.log('Dates for Eastern Bluebird:', bluebirdRows.map(r => r.date));

    // Build list of past days (oldest first)
    const dateList = [];
    for (let i = days; i >= 1; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dateList.push(d.toISOString().split('T')[0]);
    }
    console.log('Backend /api/detections/recent dateList:', dateList);

    // Aggregate total_detections for each (species, date) before building dateMap
    const bySpecies = {};
    rows.forEach(row => {
      const key = row.species_code;
      if (!bySpecies[key]) {
        bySpecies[key] = {
          species_code: row.species_code,
          common_name: row.common_name,
          scientific_name: row.scientific_name,
          color: row.color,
          image_url: row.image_url,
          thumbnail_url: row.thumbnail_url,
          png_url: row.png_url,
          dateMap: {},
          last_detected: row.latest_detection_at
        };
      }
      // If the date already exists, sum the detections (aggregate)
      if (!bySpecies[key].dateMap[row.date]) {
        bySpecies[key].dateMap[row.date] = row.total_detections;
      } else {
        bySpecies[key].dateMap[row.date] += row.total_detections;
      }
      if (row.latest_detection_at > bySpecies[key].last_detected) {
        bySpecies[key].last_detected = row.latest_detection_at;
      }
    });

    // Build result with daily detection counts and filter out species with no detections
    let result = Object.values(bySpecies)
      .map(item => {
        // Create a map of date to total detections
        const dateTotals = dateList.map(date => ({
          date,
          total: item.dateMap[date] || 0
        }));
        
        // Calculate daily counts (previous day total - current day total)
        const frequency = dateTotals.map((day, index) => {
          if (index === dateTotals.length - 1) return day.total; // Last day, use total as is
          const nextTotal = dateTotals[index + 1].total;
          // Subtract next day's total from current day's total
          return Math.max(0, day.total - nextTotal);
        });
        
        const total_detections = frequency.reduce((sum, v) => sum + v, 0);
        
        if (item.common_name === 'Eastern Bluebird') {
          console.log('Eastern Bluebird date totals:', dateTotals.map(d => ({
            date: d.date,
            total: d.total,
            daily: d.total - (dateTotals[dateTotals.indexOf(d) - 1]?.total || 0)
          })));
          console.log('Eastern Bluebird frequency:', frequency);
          console.log('Eastern Bluebird total_detections:', total_detections);
        }
        
        return {
          species_code: item.species_code,
          common_name: item.common_name,
          scientific_name: item.scientific_name,
          color: item.color,
          image_url: item.image_url,
          thumbnail_url: item.thumbnail_url,
          png_url: item.png_url,
          frequency,
          total_detections,
          last_detected: item.last_detected
        };
      });
      
    // Filter out species with no detections in the date range and sort by total_detections
    result = result
      .filter(item => item.total_detections > 0)
      .sort((a, b) => b.total_detections - a.total_detections);
      
    console.log(`Filtered out ${Object.keys(bySpecies).length - result.length} species with no detections`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching recent daily counts:', error);
    res.status(500).json({ error: 'Failed to fetch recent daily counts' });
  }
});

app.get('/api/detections/rare', async (req, res) => {
  try {
    const days = 31;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const { data: rows, error } = await supabase
      .from('daily_counts')
      .select('*')
      .gte('date', sinceDate)
      .order('date', { ascending: true })
      .range(0, 4999);
    if (error) throw error;
    const grouped = rows.reduce((acc, row) => {
      const key = row.species_code;
      if (!acc[key]) acc[key] = { ...row, frequency: [row.total_detections], last_detected: row.latest_detection_at };
      else { acc[key].frequency.push(row.total_detections); if (row.latest_detection_at > acc[key].last_detected) acc[key].last_detected = row.latest_detection_at; }
      return acc;
    }, {});
    const threshold = 5;
    const result = Object.values(grouped)
      .filter(item => item.frequency[item.frequency.length - 1] < threshold)
      .sort((a, b) => new Date(b.last_detected) - new Date(a.last_detected))
      .slice(0, 12);
    res.json(result);
  } catch (error) {
    console.error('Error fetching rare daily counts:', error);
    res.status(500).json({ error: 'Failed to fetch rare daily counts' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
