"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCustomerProfiles, normalizeCustomerPhone, segmentCustomer,
} = require("../src/features/clients/customer-hub.ts");

const daysAgo = (days) => new Date(Date.UTC(2026, 10, 9) - days * 86400000).toISOString();
const today = Date.UTC(2026, 10, 9);
const customer = (id, phone, name) => ({id,phone,name,created_at:daysAgo(50)});
const order = (id, phone, status, days, total=20, is_test=false) => ({
  id,customer_phone:phone,customer_name:"Nome do checkout",status,created_at:daysAgo(days),
  total,display_number:1,payment_method:"pix",is_test
});

test("normalizes +55, local phones and formatted contacts without merging missing phones", () => {
  assert.equal(normalizeCustomerPhone("+55 (11) 98888-7777"), "11988887777");
  assert.equal(normalizeCustomerPhone("11 98888-7777"), "11988887777");
  assert.equal(normalizeCustomerPhone(""), "");
  assert.equal(normalizeCustomerPhone("abc"), "");
});

test("joins registered customers, completed sales and loyalty even with different phone formats", () => {
  const customers=[customer("c1", "+5511988887777","Cliente Presencial"),customer("c2","11999990000","Sem Compra")];
  const orders=[
    order("o1", "11988887777","done",2,35),
    order("o2", "+55 11 98888-7777","done",5,20),
    order("o3", "11988887777","pending",1,100),
    order("o4", "11988887777","canceled",0,200),
    order("o5", "11988887777","done",0,500,true),
    order("o6", "11912345678","done",4,12),
  ];
  const accounts=[{customer_id:"c1",points_balance:15,lifetime_earned:23}];
  const transactions=[{id:"tx1",customer_id:"c1",created_at:daysAgo(1),points_delta:4,transaction_type:"adjustment_credit",description:"Compra presencial"}];
  const result=buildCustomerProfiles(customers,orders,accounts,transactions);
  assert.equal(result.length,3);
  const row=result.find(p=>p.phone==="11988887777");
  assert.ok(row);
  assert.equal(row.name,"Cliente Presencial");
  assert.equal(row.orderCount,2);
  assert.equal(row.totalSpent,55);
  assert.equal(row.lastOrderDate,daysAgo(2));
  assert.equal(row.recentOrders.length,3);
  assert.equal(row.pointsBalance,15);
  assert.equal(row.lifetimeEarned,23);
  assert.equal(row.recentTransactions[0].points,4);
  assert.equal(segmentCustomer(row,true,today),"active");
  assert.equal(segmentCustomer(result.find(p=>p.phone==="11999990000"),true,today),"never");
  assert.equal(result.find(p=>p.phone==="11912345678").registered,false);
});

test("inactivity ignores pending/canceled/test orders and uses a 30-day window", () => {
  const rows=buildCustomerProfiles([customer("c1","11912345678","Maria")], [
    order("done","11912345678","done",45,10),
    order("pending","11912345678","pending",1,30),
    order("cancelled","11912345678","canceled",0,50),
  ],[],[]);
  assert.equal(rows[0].orderCount,1);
  assert.equal(rows[0].totalSpent,10);
  assert.equal(segmentCustomer(rows[0],true,today),"inactive");
  assert.equal(segmentCustomer({lastOrderDate:null},true,today),"never");
  assert.equal(segmentCustomer({lastOrderDate:null},false,today),"unknown");
  assert.equal(segmentCustomer({lastOrderDate:daysAgo(30)},true,today),"inactive");
  assert.equal(segmentCustomer({lastOrderDate:daysAgo(29)},true,today),"active");
});

test("central reads only current restaurant with RLS and does not modify database", () => {
  const code=fs.readFileSync(path.join(__dirname,"../src/app/admin/(painel)/clients/ClientsWorkspace.tsx"),"utf8");
  const page=fs.readFileSync(path.join(__dirname,"../src/app/admin/(painel)/clients/page.tsx"),"utf8");
  const hub=fs.readFileSync(path.join(__dirname,"../src/features/clients/customer-hub.ts"),"utf8");
  assert.ok(code.split('.eq("restaurant_id", restaurantId)').length >= 5);
  assert.match(code,/getCurrentRestaurant\(supabase\)/);
  assert.match(code,/fetchPaged/);
  assert.match(code,/MAX_ROWS_PER_TABLE/);
  assert.match(code,/Histórico incompleto/);
  assert.match(code,/Abrir WhatsApp/);
  assert.doesNotMatch(code,/\.insert\(|\.update\(|\.delete\(|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(page,/<ClientsWorkspace/);
  assert.doesNotMatch(hub,/supabase\.rpc|service_role|\.from\(/);
  const vercel=JSON.parse(fs.readFileSync(path.join(__dirname,"../vercel.json"),"utf8"));
  assert.equal(vercel.git.deploymentEnabled.main,false);
  assert.equal(vercel.git.deploymentEnabled["feat/customer-hub-retention-20261109"],false);
});
