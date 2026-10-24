"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { verify, PRODUCTION_SUPABASE_REF } = require("../scripts/verify-ifood-staging-env.cjs");
const ref = "abcdefghijabcdefghij";
const safe = () => ({
 SHIFUH_ENV:"staging", SHIFUH_STAGING_SUPABASE_REF:ref,
 NEXT_PUBLIC_SUPABASE_URL:"https://"+ref+".supabase.co",
 NEXT_PUBLIC_SUPABASE_ANON_KEY:"synthetic-anon", SUPABASE_SERVICE_ROLE_KEY:"synthetic-service",
 SHIFUH_STAGING_SERVICE_ROLE_VERIFIED:"true", IFOOD_PERSISTED_REPLAY_ENABLED:"false",
});
test("accepts isolated staging with replay off",()=>assert.deepEqual(verify(safe()),{environment:"staging",projectRef:ref,replayEnabled:false}));
test("rejects production Supabase",()=>assert.throws(()=>verify({...safe(), SHIFUH_STAGING_SUPABASE_REF:PRODUCTION_SUPABASE_REF,NEXT_PUBLIC_SUPABASE_URL:"https://"+PRODUCTION_SUPABASE_REF+".supabase.co"}),/Production Supabase/));
test("rejects mismatched branch URL",()=>assert.throws(()=>verify({...safe(),NEXT_PUBLIC_SUPABASE_URL:"https://wrong.supabase.co"}),/isolated staging ref/));
test("rejects unverified service-role credentials",()=>assert.throws(()=>verify({...safe(),SHIFUH_STAGING_SERVICE_ROLE_VERIFIED:"false"}),/independently verified/));
test("rejects live iFood endpoint",()=>assert.throws(()=>verify({...safe(),IFOOD_CLIENT_ID:"synthetic-id",IFOOD_MERCHANT_API_BASE_URL:"https://merchant-api.ifood.com.br"}),/Live iFood API/));
test("rejects real WhatsApp bot configuration",()=>assert.throws(()=>verify({...safe(),WHATSAPP_BOT_API_URL:"https://whatsapp.example.com"}),/Real WhatsApp/));
test("replay cannot be enabled before the migration is verified and approved",()=>{
const opts={...safe(),IFOOD_PERSISTED_REPLAY_ENABLED:"true",IFOOD_MERCHANT_API_BASE_URL:"http://localhost:3100"};
assert.throws(()=>verify(opts),/Lease migration unverified/);
assert.throws(()=>verify({...opts,SHIFUH_STAGING_LEASE_MIGRATION_VERIFIED:"true"}),/not authorized/);
assert.equal(verify({...opts,SHIFUH_STAGING_LEASE_MIGRATION_VERIFIED:"true",SHIFUH_STAGING_REPLAY_APPROVED:"true"}).replayEnabled,true);
});
test("invalid project ref blocked",()=>assert.throws(()=>verify({...safe(),SHIFUH_STAGING_SUPABASE_REF:"bad"}),/Invalid SHIFUH_STAGING_SUPABASE_REF/));
