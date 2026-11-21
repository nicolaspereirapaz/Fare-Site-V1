import importlib.util
import re
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.modules['painel_rede'] = types.SimpleNamespace(client_allowed=lambda h: True, serve_on_network=lambda *a: None)
spec = importlib.util.spec_from_file_location('painel_ia', Path(__file__).with_name('painel_ia.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

ERROR = "ChatGPT or Codex Subscription rejected your sign-in, so the model can't be reached. Sign in again: `hermes auth add openai-codex --type oauth`.\n\nProvider said: HTTP 401: Provided authentication token is expired. Please try signing in again."

class SafetyTests(unittest.TestCase):
 def test_failed_turn_is_internal_handoff_never_customer_reply(self):
  result={'completed':False, 'failed':True, 'failure_reason':'auth', 'final_response':ERROR}
  class Agent:
   tools=[]
   def __init__(self, **kwargs): pass
   def run_conversation(self, **kwargs): return result
  m.RUNTIME={'provider':'openai-codex'}
  m.PLUGIN=types.SimpleNamespace(META=re.compile(r'<FARE_META>(.*?)</FARE_META>',re.S))
  with patch.dict(sys.modules, {'run_agent':types.SimpleNamespace(AIAgent=Agent),'hermes_cli.runtime_provider':types.SimpleNamespace(resolve_runtime_provider=lambda **k: m.RUNTIME)}), patch.object(m,'build_turn',return_value=('rules','ola',[])):
   answer=m.ask_model({})
  self.assertFalse(answer['reply'], 'Provider diagnostic must never be customer-facing')
  self.assertTrue(answer['handoff'])
  self.assertIn('⚠',answer['subject'])
  self.assertNotIn('hermes auth',str(answer))
  self.assertNotIn('Provider said:',str(answer))

 def test_each_request_resolves_current_credentials(self):
  m.RUNTIME={'provider':'openai-codex','api_key':'stale'}
  m.PLUGIN=types.SimpleNamespace(META=re.compile(r'<FARE_META>(.*?)</FARE_META>',re.S))
  seen=[]
  class Agent:
   tools=[]
   def __init__(self, **kwargs): seen.append(kwargs.get('api_key'))
   def run_conversation(self, **kwargs): return {'completed':True,'final_response':'Olá!'}
  resolver=__import__('unittest.mock',fromlist=['Mock']).Mock(side_effect=[{'provider':'openai-codex','api_key':'fresh1'},{'provider':'openai-codex','api_key':'fresh2'}])
  with patch.dict(sys.modules, {'run_agent':types.SimpleNamespace(AIAgent=Agent),'hermes_cli.runtime_provider':types.SimpleNamespace(resolve_runtime_provider=resolver)}), patch.object(m,'build_turn',return_value=('rules','oi',[])):
   m.ask_model({}); m.ask_model({})
  self.assertEqual(seen,['fresh1','fresh2'])

 def test_runtime_exception_is_internal_alert_with_no_customer_reply(self):
  import io
  handler=object.__new__(m.Handler)
  handler.path='/responder'; handler.headers={'Content-Length':'2'}; handler.rfile=io.BytesIO(b'{}')
  handler.authorized=lambda: True
  sent=[]; handler.send=lambda status,body: sent.append((status,body))
  with patch.object(m,'ask_model',side_effect=RuntimeError('secret diagnostic')):
   handler.do_POST()
  self.assertEqual(sent[0][0],200)
  self.assertFalse(sent[0][1]['reply'])
  self.assertTrue(sent[0][1]['handoff'])
  self.assertIn('⚠',sent[0][1]['subject'])
  self.assertNotIn('secret diagnostic',str(sent))

 def test_failed_incomplete_and_diagnostic_results_are_silent(self):
  cases=[
   {'completed':False,'final_response':'timeout'},
   {'completed':True,'failed':True,'final_response':'failure'},
   {'completed':True,'interrupted':True,'final_response':'interrupted'},
   {'completed':True,'failure_reason':'rate_limit','final_response':'quota'},
   {'completed':True,'error':'oops','final_response':'error'},
   {'completed':True,'final_response':ERROR},
   {'completed':True,'final_response':''},
   {'completed':True,'final_response':123}, {}, None,
  ]
  for result in cases:
   with self.subTest(result=result):
    class Agent:
     tools=[]
     def __init__(self, **kwargs): pass
     def run_conversation(self, **kwargs): return result
    with patch.dict(sys.modules, {'run_agent':types.SimpleNamespace(AIAgent=Agent),'hermes_cli.runtime_provider':types.SimpleNamespace(resolve_runtime_provider=lambda **k: {'provider':'openai-codex'})}), patch.object(m,'build_turn',return_value=('rules','oi',[])):
     answer=m.ask_model({})
    self.assertFalse(answer['reply']); self.assertTrue(answer['handoff'])
    self.assertEqual(answer['profile'],{}); self.assertEqual(answer['name'],'')

 def test_success_preserves_reply_and_business_handoff(self):
  result={'completed':True,'failed':False,'final_response':'Vou chamar a equipe.<FARE_META>{"handoff":true,"name":"Maria","subject":"Orçamento","profile":{"interests":["fotos"]}}</FARE_META>'}
  class Agent:
   tools=[]
   def __init__(self, **kwargs): pass
   def run_conversation(self, **kwargs): return result
  m.PLUGIN=types.SimpleNamespace(META=re.compile(r'<FARE_META>(.*?)</FARE_META>',re.S))
  with patch.dict(sys.modules, {'run_agent':types.SimpleNamespace(AIAgent=Agent),'hermes_cli.runtime_provider':types.SimpleNamespace(resolve_runtime_provider=lambda **k: {'provider':'openai-codex'})}), patch.object(m,'build_turn',return_value=('rules','oi',[])):
   answer=m.ask_model({})
  self.assertEqual(answer['reply'],'Vou chamar a equipe.')
  self.assertTrue(answer['handoff']); self.assertEqual(answer['name'],'Maria')

if __name__=='__main__': unittest.main(verbosity=2)
