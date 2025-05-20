import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from '../lib/supabase.js';

dotenv.config();

const BIRDWEATHER_API = 'https://app.birdweather.com/api/v1';
const STATION_ID = process.env.BIRDWEATHER_STATION_ID;

// Ensure required env var is set
if (!STATION_ID) {
  console.error('ERROR: Missing BIRDWEATHER_STATION_ID in .env');
  process.exit(1);
}
console.log(`Using station ${STATION_ID} as API key.`);

/**
 * Fetch cumulative species totals for a given since-date via paging.
 * Returns an object keyed by species_code containing the species info and detections.total.
 */
async function fetchCumulativeTotals(sinceDate) {
  let page = 1;
  const limit = 100;
  const all = {};
  while (true) {
    const url = `${BIRDWEATHER_API}/stations/${STATION_ID}/species?period=day&since=${sinceDate}&limit=${limit}&page=${page}`;
    console.log(`Fetching species from ${sinceDate}, page ${page}:`, url);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${STATION_ID}` }
    });
    const json = await res.json();
    console.log(`[${sinceDate}] page ${page}, fetched species count: ${json.species?.length || 0}`);
    if (!json.success) console.error(`[${sinceDate}] API returned success=false`, json);
    if (!json.success || !Array.isArray(json.species) || json.species.length === 0) break;
    for (const sp of json.species) all[sp.id] = sp;
    if (json.species.length < limit) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

/**
 * Backfill daily counts into daily_counts table for the past N full days (excluding today).
 */
export async function fetchAndStoreDailyCounts(days = 31) {
  // Purge all data older than the most recent 'days' days
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() - days);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  const { error: purgeError } = await supabase
    .from('daily_counts')
    .delete()
    .lt('date', cutoffDate);
  if (purgeError) {
    console.error(`Error purging old daily_counts:`, purgeError);
  } else {
    console.log(`Purged all daily_counts older than ${cutoffDate}`);
  }
  // Build an ascending list of dates (oldest to most recent, excluding today)
  const dates = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  console.log(`Starting backfill for ${days} days (${dates[0]} through ${dates[dates.length-1]})`);

  // Fetch cumulative totals for each since-date
  const cumulative = {};
  for (const since of dates) {
    cumulative[since] = await fetchCumulativeTotals(since);
  }

  // Build master species list from all days
  const masterSpecies = {};
  for (const dayTotals of Object.values(cumulative)) {
    for (const [id, info] of Object.entries(dayTotals)) {
      if (!masterSpecies[id]) {
        masterSpecies[id] = info;
      }
    }
  }

  // For each day, upsert the API's .detections.total as the daily count (no subtraction)
  for (let idx = 0; idx < dates.length; idx++) {
    const date = dates[idx];
    const todayTotals = cumulative[date];
    const rows = [];
    for (const [id, info] of Object.entries(masterSpecies)) {
      const todayInfo = todayTotals[id];
      let meta, dailyCount, almostCertain, veryLikely, uncertain, unlikely, latestDetectionAt;
      if (todayInfo) {
        meta = todayInfo;
        dailyCount = todayInfo.detections?.total || 0;
        almostCertain = todayInfo.detections?.almostCertain || 0;
        veryLikely = todayInfo.detections?.veryLikely || 0;
        uncertain = todayInfo.detections?.uncertain || 0;
        unlikely = todayInfo.detections?.unlikely || 0;
        latestDetectionAt = todayInfo.latestDetectionAt || null;
      } else {
        meta = info;
        dailyCount = 0;
        almostCertain = 0;
        veryLikely = 0;
        uncertain = 0;
        unlikely = 0;
        latestDetectionAt = null;
      }
      rows.push({
        species_code: id,
        common_name: meta.commonName,
        scientific_name: meta.scientificName || null,
        color: meta.color || null,
        image_url: meta.imageUrl,
        thumbnail_url: meta.thumbnailUrl,
        png_url: meta.pngUrl,
        date,
        total_detections: dailyCount,
        almost_certain: almostCertain,
        very_likely: veryLikely,
        uncertain: uncertain,
        unlikely: unlikely,
        latest_detection_at: latestDetectionAt
      });
    }
    const { error } = await supabase.from('daily_counts').upsert(rows);
    if (error) console.error(`Error upserting ${date}:`, error);
    else console.log(`Upserted ${rows.length} records for ${date}`);
  }
}

// Execute backfill when script is invoked
fetchAndStoreDailyCounts().catch(console.error);
