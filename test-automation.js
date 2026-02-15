// Quick Test Script for OpsGhost
// Run with: node test-click.js

const controller = require('./electron/windowsController');

async function test() {
  console.log('🧪 Testing Windows Controller...');
  
  console.log('\n1️⃣ Testing mouse movement...');
  await controller.moveMouse(500, 500);
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('\n2️⃣ Testing mouse click...');
  await controller.mouseClick('left');
  await new Promise(r => setTimeout(r, 500));
  
  console.log('\n3️⃣ Testing typing...');
  await controller.typeString('Hello from OpsGhost!');
  await new Promise(r => setTimeout(r, 500));
  
  console.log('\n✅ All tests complete!');
}

test().catch(console.error);
