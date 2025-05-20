import { supabase } from '../lib/supabase.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BIRDWEATHER_API = 'https://app.birdweather.com/api/v1';
const STATION_ID = process.env.BIRDWEATHER_STATION_ID;

async function fetchDetectionsForDate(date) {
  const formattedDate = date.toISOString().split('T')[0];
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);
  const limit = 100;
  let offset = 0;
  const allDetections = [];
  while (true) {
    const url = `${BIRDWEATHER_API}/stations/${STATION_ID}/detections?from=${dateStart.toISOString()}&to=${dateEnd.toISOString()}&limit=${limit}&offset=${offset}`;
    console.log(`[${formattedDate}] Fetching detections from ${dateStart.toISOString()} to ${dateEnd.toISOString()}, limit=${limit}, offset=${offset}:`, url);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[${formattedDate}] HTTP error:`, response.status);
        break;
      }
      const data = await response.json();
      if (!data.success || !Array.isArray(data.detections)) {
        console.error(`[${formattedDate}] Invalid API response format:`, data);
        break;
      }
      const fetched = data.detections.length;
      console.log(`[${formattedDate}] Retrieved ${fetched} detections, sample timestamp:`, data.detections[0]?.timestamp);
      allDetections.push(...data.detections);
      if (fetched < limit) {
        break;
      }
      offset += limit;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[${formattedDate}] Fetch error:`, error);
      break;
    }
  }
  return allDetections;
}

async function checkSupabaseTable() {
  console.log('🔍 Checking Supabase table structure...');
  
  // First check if we can connect
  const { data: testData, error: testError } = await supabase
    .from('detections')
    .select('count');

  if (testError) {
    if (testError.message.includes('does not exist')) {
      console.log('❌ Table does not exist, creating it...');
      const { error: createError } = await supabase.rpc('create_detections_table');
      if (createError) {
        throw new Error(`Failed to create table: ${createError.message}`);
      }
      console.log('✅ Table created successfully');
    } else {
      throw new Error(`Failed to check table: ${testError.message}`);
    }
  } else {
    console.log('✅ Table exists and is accessible');
  }
}

export async function fetchAndStoreDetections() {
  try {
    await checkSupabaseTable();
    // Fetch detections for the last 14 days
    const detections = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      console.log(`Fetching detections for ${date.toISOString().split('T')[0]}...`);
      const dailyDetections = await fetchDetectionsForDate(date);
      detections.push(...dailyDetections);
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`📈 Total raw detections fetched: ${detections.length}`);
    
    // Transform and store detections
    const filteredDetections = detections.filter(d => {
      if (!d.species || !d.species.id || !d.species.commonName) {
        console.log('⚠️ Skipping invalid detection:', JSON.stringify(d, null, 2));
        return false;
      }
      return true;
    });
    console.log(`📏 After filtering invalid detections: ${filteredDetections.length}`);
    
    const transformedDetections = filteredDetections.map(detection => {
      const transformed = {
        id: `${detection.species.id}_${detection.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        species_code: detection.species.id.toString(),
        common_name: detection.species.commonName,
        scientific_name: detection.species.scientificName || null,
        image_url: detection.species.imageUrl || null,
        thumbnail_url: detection.species.thumbnailUrl || null,
        confidence: detection.confidence || 0,
        detected_at: detection.timestamp,
        is_rare: false,
        station_id: STATION_ID
      };
      return transformed;
    });

    if (transformedDetections.length === 0) {
      console.log('⛔ No detections to store');
      return;
    }
    
    console.log('📑 Sample detection:', JSON.stringify(transformedDetections[0], null, 2));

    // First verify Supabase connection
    const { data: testData, error: testError } = await supabase
      .from('detections')
      .select('count');

    if (testError) {
      console.error('❌ Supabase connection test failed:', testError);
      throw testError;
    }
    console.log('✅ Supabase connection test successful');

    // Clear existing detections before storing new ones
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    console.log('🗑️ Clearing detections from:', fourteenDaysAgo);
    
    // Delete old detections and get exact count of rows removed
    const { error: deleteError, count: deleteCount } = await supabase
      .from('detections')
      .delete()
      .gte('detected_at', fourteenDaysAgo)
      .select('*', { count: 'exact', head: true });

    if (deleteError) {
      console.error('❌ Error deleting old detections:', deleteError);
      throw deleteError;
    }
    console.log(`✅ Successfully cleared ${deleteCount} old detections`);

    // Insert detections in batches to avoid timeouts
    const BATCH_SIZE = 50; // Even smaller batch size
    const detectionsToInsert = transformedDetections.map(d => ({
      ...d,
      id: `${d.species_code}_${d.detected_at}_${Math.random().toString(36).substr(2, 9)}`
    }));
    
    console.log(`📥 Preparing to insert ${detectionsToInsert.length} detections in batches of ${BATCH_SIZE}...`);
    console.log('Sample detection:', JSON.stringify(detectionsToInsert[0], null, 2));
    
    // Insert all detections and get exact count without returning rows
    console.log('📥 Inserting all detections...');
    const { error: insertError, count: insertCount } = await supabase
      .from('detections')
      .insert(detectionsToInsert, { returning: 'minimal', count: 'exact' });
    
    if (insertError) {
      console.error('❌ Insert failed:', insertError);
      console.error('Sample record that failed:', JSON.stringify(detectionsToInsert[0], null, 2));
      throw insertError;
    }
    
    console.log(`✅ Successfully inserted ${insertCount} detections`);
    
    // Double check the count
    const { data: finalCount, error: countError } = await supabase
      .from('detections')
      .select('count');
      
    if (countError) {
      console.error('❌ Error getting final count:', countError);
    } else {
      console.log(`📊 Current total in database: ${finalCount[0].count} detections`);
    }

    // All done!
  } catch (error) {
    console.error('Error fetching/storing detections:', error);
    throw error;
  }
}
