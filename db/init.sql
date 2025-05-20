-- Create the detections table
create table detections (
  id uuid default uuid_generate_v4() primary key,
  species_code text not null,
  common_name text not null,
  scientific_name text,
  confidence float,
  detected_at timestamp with time zone not null,
  is_rare boolean default false,
  station_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create a unique constraint for species+time
create unique index detections_species_time_idx 
on detections(species_code, detected_at);

-- Create RLS policies (Row Level Security)
alter table detections enable row level security;

-- Allow anonymous read access
create policy "Allow anonymous read access"
on detections for select
to anon
using (true);
