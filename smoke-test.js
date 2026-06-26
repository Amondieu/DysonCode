const { setDbPath, getDb } = require('./dist/main/db');
const { createNode, getGraph, updateLayout } = require('./dist/main/graph-service');
const path = require('path');
const fs = require('fs');

async function runTest() {
  const dbPath = path.join(__dirname, 'test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  
  setDbPath(dbPath);
  const db = await getDb();

  // Create a session for the smoke test
  db.prepare(\"INSERT INTO sessions (title, text_id) VALUES (?, ?)\").run('Test Session', 'test-sess-123');

  const sessionId = 'test-sess-123';
  
  console.log('Creating node...');
  const nodeId = await createNode({
    sessionId,
    nodeType: 'test-node',
    modeOrigin: 'flow',
    label: 'Initial Node',
    posX: 100,
    posY: 200
  });
  console.log('Node created with ID:', nodeId);

  console.log('Reading graph...');
  const graph = await getGraph(sessionId, 'flow');
  console.log('Nodes found:', graph.nodes.length);
  const node = graph.nodes.find(n => n.id === nodeId);
  
  if (node) {
    console.log('Session text ID from graph:', node.sessionId);
  } else {
    throw new Error('Node not found in graph');
  }

  console.log('Updating layout...');
  await updateLayout([{
    nodeId,
    mode: 'flow',
    posX: 300,
    posY: 400
  }]);

  const updatedGraph = await getGraph(sessionId, 'flow');
  const updatedNode = updatedGraph.nodes.find(n => n.id === nodeId);
  console.log('Updated Position:', updatedNode.position);

  if (updatedNode.position.x === 300 && updatedNode.position.y === 400) {
    console.log('SMOKE TEST PASSED');
  } else {
    console.log('SMOKE TEST FAILED: Position not updated correctly');
  }
  
  // Clean up
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

runTest().catch(err => {
  console.error('SMOKE TEST ERROR:', err);
  process.exit(1);
});
