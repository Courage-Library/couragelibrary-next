const fs = require('fs');
const path = require('path');
global.WebSocket = class WebSocket {};
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[trimmed.slice(0, idx).trim()] = val;
    }
  }
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRpcCall() {
  const examId = '16ddb81c-cb15-4ff1-ae6c-53c0dcb080ce';
  const slug = 'test-p3k13-rev-813023';

  console.log('Testing RPC call on 813023...');
  const { data, error } = await supabase.rpc('fn_delete_exam_controlled', {
    p_exam_id: examId,
    p_slug: slug,
    p_actor_id: null,
    p_actor_email: 'admin@couragelibrary.com',
    p_reason: 'Testing RPC on 813023'
  });

  console.log('RPC result data:', data);
  console.log('RPC result error:', error);
}

testRpcCall().catch(console.error);
