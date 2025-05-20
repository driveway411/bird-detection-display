import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const BIRDWEATHER_API = 'https://app.birdweather.com/api/v1';
const STATION_ID = process.env.BIRDWEATHER_STATION_ID;

async function debugAPI() {
  try {
    const response = await fetch(
      `${BIRDWEATHER_API}/stations/${STATION_ID}/detections`
    );
    
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

debugAPI();
