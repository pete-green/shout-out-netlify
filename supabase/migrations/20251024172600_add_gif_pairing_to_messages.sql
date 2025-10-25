-- Add paired_gif_id column to link message to specific GIF
ALTER TABLE celebration_messages
  ADD COLUMN paired_gif_id BIGINT NULL REFERENCES celebration_gifs(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_messages_paired_gif ON celebration_messages(paired_gif_id);

-- Add comment
COMMENT ON COLUMN celebration_messages.paired_gif_id IS 'Optional: Links message to a specific GIF. If set and GIF is active, this GIF will always be used with this message instead of random selection. Many messages can reference the same GIF.';
