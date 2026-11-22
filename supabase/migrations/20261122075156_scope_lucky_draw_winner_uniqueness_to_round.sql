-- Scope winner uniqueness to a draw session.
-- A participant may legitimately win the same prize category in a later session,
-- but must not be recorded twice in one session.
ALTER TABLE public.draw_winners
  DROP CONSTRAINT IF EXISTS draw_winners_participant_id_prize_category_id_key;

ALTER TABLE public.draw_winners
  ADD CONSTRAINT draw_winners_round_participant_key
  UNIQUE (draw_round_id, participant_id);
