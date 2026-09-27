import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as feedback } from '@/app/api/feedback/content/route';
import { PUT as preferences } from '@/app/api/notification-preferences/route';
const mocks=vi.hoisted(()=>({from:vi.fn(),rateLimit:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(async()=>({auth:{getUser:async()=>({data:{user:{id:'account-a'}},error:null})},from:mocks.from}))}));
vi.mock('@/lib/server/rate-limit',()=>({rateLimit:mocks.rateLimit}));
describe('account write database admission responses',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.rateLimit.mockResolvedValue({success:true});});
 it('preserves feedback database refusal as retryable 429',async()=>{
  mocks.from.mockReturnValue({upsert:vi.fn(async()=>({error:{code:'PT429'}}))});
  const response=await feedback(new NextRequest('https://example.test/api/feedback/content',{method:'POST',body:JSON.stringify({content_id:'00000000-0000-4000-8000-000000000001',is_positive:true})}));
  expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('60');
 });
 it('preserves preference database refusal as retryable 429',async()=>{
  mocks.from.mockReturnValue({upsert:()=>({select:()=>({single:async()=>({error:{code:'PT429'}})})})});
  const response=await preferences(new NextRequest('https://example.test/api/notification-preferences',{method:'PUT',body:JSON.stringify({request_published_email_enabled:false})}));
  expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('60');
 });
 it('rejects oversized feedback before database work',async()=>{
  const response=await feedback(new NextRequest('https://example.test/api/feedback/content',{method:'POST',body:JSON.stringify({content_id:'00000000-0000-4000-8000-000000000001',is_positive:true,details:'x'.repeat(4001)})}));
  expect(response.status).toBe(400);expect(mocks.from).not.toHaveBeenCalled();
 });
});
