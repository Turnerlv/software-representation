INSERT INTO extractor_coverage_ledger (id, pattern_name, framework, status, impact_level, evidence_repo, evidence_file, evidence_line, evidence_snippet) VALUES 
('gap_express_1', 'Express Route Definition', 'Express', 'DISCOVERED', 'HIGH', 'fixtures/cloned-repos/express', 'examples/hello-world/index.js', 7, 'app.get(''/'', function(req, res){'),
('gap_express_2', 'Express Router Mount', 'Express', 'DISCOVERED', 'HIGH', 'fixtures/cloned-repos/express', 'examples/multi-router/index.js', 7, 'app.use(''/api/v1'', require(''./controllers/api_v1''));'),
('gap_express_3', 'CommonJS Require', 'Node.js', 'DISCOVERED', 'MEDIUM', 'fixtures/cloned-repos/express', 'examples/hello-world/index.js', 3, 'var express = require(''../../'');');
