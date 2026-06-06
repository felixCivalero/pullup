-- 062_people_ig_profile.sql
-- Full Instagram profile snapshot for a person. The messaging webhook only
-- carries the sender's IGSID — username / name / profile pic / follower count
-- all come from a separate User Profile API call (graph.instagram.com/<IGSID>),
-- which we make the first time someone DMs a connected host. name + the IG
-- handle are mirrored onto the flat people.name / people.instagram columns;
-- this jsonb keeps the rest (profile_pic, follower_count, follow relationship,
-- fetched_at) so we retain everything IG gives us per interaction.
ALTER TABLE people ADD COLUMN IF NOT EXISTS ig_profile JSONB;
