-- Rentz MVP schema (4 players, no login)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);

CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 1 AND 4),
  is_ready BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, player_id),
  UNIQUE (room_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON public.room_players(room_id);

CREATE TABLE IF NOT EXISTS public.room_events (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_room_events_room_id ON public.room_events(room_id);
CREATE INDEX IF NOT EXISTS idx_room_events_room_id_seq ON public.room_events(room_id, seq);

CREATE OR REPLACE FUNCTION public.next_room_seq(p_room_id uuid)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX(seq), 0) + 1
  FROM public.room_events
  WHERE room_id = p_room_id;
$$;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rooms' AND policyname='mvp_rooms_all'
  ) THEN
    CREATE POLICY mvp_rooms_all ON public.rooms
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_players' AND policyname='mvp_room_players_all'
  ) THEN
    CREATE POLICY mvp_room_players_all ON public.room_players
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_events' AND policyname='mvp_room_events_all'
  ) THEN
    CREATE POLICY mvp_room_events_all ON public.room_events
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_events;
