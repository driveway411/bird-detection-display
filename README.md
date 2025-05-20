# Bird Detection Display

A large-screen display application for showing recent bird detections at a sanctuary. Built for Mass Audubon using BirdWeather API data.

## Setup

1. Create a Supabase project and get your credentials
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run development server:
   ```bash
   npm run dev
   ```

## Structure

- `/src/frontend` - Static frontend files (HTML, CSS, JS)
- `/src/backend` - Node.js/Express server and API
- `/src/shared` - Shared utilities and types

## Environment Variables

Required environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon/public key
- `BIRDWEATHER_STATION_ID` - Your BirdWeather station ID

## Development

- Frontend runs on vanilla JS/HTML/CSS
- Backend uses Node.js/Express
- Database is Supabase (PostgreSQL)
- Deployment via Vercel
