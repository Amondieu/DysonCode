const { executeAgent } = require('./dist/main/agent-executor.js');
async function run() {
    try {
        console.log('Starting execution...');
        const result = await executeAgent({sessionId:'live-test', nodeId:'agent-1', prompt:'ping'});
        console.log('RESULT_START');
        console.log(JSON.stringify(result, null, 2));
        console.log('RESULT_END');
    } catch (error) {
        console.error('RUNTIME_ERROR:', error);
    }
}
run();
