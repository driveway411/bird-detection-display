-- Drop existing table if it exists
drop table if exists detections;

-- Create the detections table with proper schema
create table detections (
    id text primary key,
    species_code text not null,
    common_name text not null,
    scientific_name text,
    image_url text,
    thumbnail_url text,
    confidence float,
    detected_at timestamp with time zone not null,
    is_rare boolean default false,
    station_id text not null,
    created_at timestamp with time zone default now()
);

-- Create indexes for better query performance
create index detections_detected_at_idx on detections(detected_at);
create index detections_species_code_idx on detections(species_code);
create index detections_is_rare_idx on detections(is_rare);

-- Create a function to calculate daily frequencies
create or replace function get_daily_frequencies(
    species_code_param text,
    days_back integer default 30
)
returns table (
    day date,
    count bigint
)
language sql
as $$
    select
        date_trunc('day', detected_at)::date as day,
        count(*) as count
    from detections
    where
        species_code = species_code_param
        and detected_at >= now() - (days_back || ' days')::interval
    group by 1
    order by 1 desc;
$$;

-- Table: daily_counts
CREATE TABLE IF NOT EXISTS daily_counts (
  species_code text NOT NULL,
  common_name text NOT NULL,
  scientific_name text,
  color text,
  image_url text,
  thumbnail_url text,
  png_url text,
  date date NOT NULL,
  total_detections integer NOT NULL,
  almost_certain integer NOT NULL,
  very_likely integer NOT NULL,
  uncertain integer NOT NULL,
  unlikely integer NOT NULL,
  latest_detection_at timestamptz,
  PRIMARY KEY (species_code, date)
);
