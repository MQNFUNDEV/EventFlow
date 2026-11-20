alter table public.participants
  drop constraint if exists participants_category_check;

alter table public.participants
  add constraint participants_category_check
  check (category ~ '^[a-z][a-z0-9_]{0,39}$');

alter table public.draw_rounds
  drop constraint if exists draw_rounds_pool_type_check;

alter table public.draw_rounds
  add constraint draw_rounds_pool_type_check
  check (pool_type = 'everyone' or pool_type ~ '^[a-z][a-z0-9_]{0,39}$');
