const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[trimmed.slice(0, idx).trim()] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testEventInsert() {
  const testEventId = '11111111-2222-3333-4444-555555555555';
  const eventPayload = {
    id: testEventId,
    exam_id: '5ecaf736-b8c4-41fb-990a-feb306429cfb',
    mock_test_id: 'de86f976-5308-44e9-a788-f42aa2aa6ab4',
    title: 'Test Event Status Check',
    slug: `test-event-status-${Date.now()}`,
    duration_minutes: 60,
    status: 'PUBLISHED',
    registration_start_at: new Date(Date.now() - 3600000).toISOString(),
    registration_end_at: new Date(Date.now() - 1800000).toISOString(),
    event_start_at: new Date(Date.now() - 1800000).toISOString(),
    event_end_at: new Date(Date.now() - 600000).toISOString(),
    result_publish_at: new Date(Date.now() - 300000).toISOString(),
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/live_test_events`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(eventPayload),
  });

  console.log('Insert status:', res.status);
  console.log('Insert response:', await res.text());

  // Clean up
  await fetch(`${supabaseUrl}/rest/v1/live_test_events?id=eq.${testEventId}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
}

testEventInsert().catch(console.error);
