-- 162: a project's strategy document ("brief": grundbultar + content buckets,
-- components/project/ProjectBrief.jsx) is a project doc too. The old slide
-- deck ("strategy") stays allowed so nothing saved before is lost.
ALTER TABLE project_docs DROP CONSTRAINT IF EXISTS project_docs_kind_check;
ALTER TABLE project_docs ADD CONSTRAINT project_docs_kind_check CHECK (kind IN ('board', 'strategy', 'brief'));
