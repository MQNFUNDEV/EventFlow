alter table public.draw_entries
  add column queue_position integer,
  add column queue_status text not null default 'available';

alter table public.draw_entries
  add constraint draw_entries_queue_status_check
    check (queue_status in ('available', 'pending', 'collected', 'skipped')),
  add constraint draw_entries_queue_position_positive
    check (queue_position is null or queue_position > 0);

create unique index draw_entries_round_queue_position_uidx
  on public.draw_entries (draw_round_id, queue_position)
  where queue_position is not null;

create index draw_entries_round_queue_status_idx
  on public.draw_entries (draw_round_id, queue_status, queue_position);
