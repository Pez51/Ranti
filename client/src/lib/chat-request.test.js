import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { apiRequest } from './api';
import { chatRequest } from './chat-request';
vi.mock('./api',()=>({apiRequest:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();});
afterEach(()=>vi.useRealTimers());
it('times out a stalled request and aborts the underlying fetch',async()=>{
  apiRequest.mockImplementation(()=>new Promise(()=>{}));
  const promise=chatRequest('/conversations/id/messages',{token:'token'});
  const assertion=expect(promise).rejects.toMatchObject({code:'CHAT_TIMEOUT'});
  await vi.advanceTimersByTimeAsync(12000);await assertion;
  expect(apiRequest.mock.calls[0][1].signal.aborted).toBe(true);
});
it('cancels immediately on unmount and clears its timeout',async()=>{
  apiRequest.mockImplementation(()=>new Promise(()=>{}));const controller=new AbortController();
  const promise=chatRequest('/path',{signal:controller.signal});const assertion=expect(promise).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await assertion;expect(vi.getTimerCount()).toBe(0);
});
