-- Semantic image cache for generated clinical illustrations.
alter table app.illustrations drop constraint if exists illustrations_tag_key;
alter table app.illustrations
  add column if not exists semantic_tags text[] not null default '{}',
  add column if not exists cache_key text,
  add column if not exists mime_type text,
  add column if not exists source text not null default 'uploaded'
    check (source in ('generated', 'uploaded', 'mock')),
  add column if not exists generation_model text,
  add column if not exists generated_cost_usd numeric(10, 4) not null default 0
    check (generated_cost_usd >= 0);

update app.illustrations
set
  semantic_tags = case
    when cardinality(semantic_tags) = 0 then array[tag]
    else semantic_tags
  end,
  cache_key = coalesce(cache_key, tag)
where cache_key is null or cardinality(semantic_tags) = 0;

alter table app.illustrations
  alter column cache_key set not null;

create unique index if not exists idx_illustrations_cache_key
  on app.illustrations(cache_key);

create index if not exists idx_illustrations_semantic_tags
  on app.illustrations using gin(semantic_tags);
