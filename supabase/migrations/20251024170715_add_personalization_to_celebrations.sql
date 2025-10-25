-- Add personalization and usage tracking to celebration_messages
ALTER TABLE celebration_messages
  ADD COLUMN assigned_to_salesperson TEXT NULL,
  ADD COLUMN last_used_at TIMESTAMP NULL,
  ADD COLUMN last_used_for TEXT NULL,
  ADD COLUMN use_count INTEGER DEFAULT 0;

-- Add personalization and usage tracking to celebration_gifs
ALTER TABLE celebration_gifs
  ADD COLUMN assigned_to_salesperson TEXT NULL,
  ADD COLUMN last_used_at TIMESTAMP NULL,
  ADD COLUMN last_used_for TEXT NULL,
  ADD COLUMN use_count INTEGER DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX idx_messages_assigned_to ON celebration_messages(assigned_to_salesperson);
CREATE INDEX idx_gifs_assigned_to ON celebration_gifs(assigned_to_salesperson);

-- Add comments for documentation
COMMENT ON COLUMN celebration_messages.assigned_to_salesperson IS 'Name of salesperson this message is assigned to, or NULL for generic messages available to everyone';
COMMENT ON COLUMN celebration_messages.last_used_at IS 'Timestamp when this message was last used in a celebration';
COMMENT ON COLUMN celebration_messages.last_used_for IS 'Name of salesperson this message was last used for';
COMMENT ON COLUMN celebration_messages.use_count IS 'Total number of times this message has been used';

COMMENT ON COLUMN celebration_gifs.assigned_to_salesperson IS 'Name of salesperson this GIF is assigned to, or NULL for generic GIFs available to everyone';
COMMENT ON COLUMN celebration_gifs.last_used_at IS 'Timestamp when this GIF was last used in a celebration';
COMMENT ON COLUMN celebration_gifs.last_used_for IS 'Name of salesperson this GIF was last used for';
COMMENT ON COLUMN celebration_gifs.use_count IS 'Total number of times this GIF has been used';
